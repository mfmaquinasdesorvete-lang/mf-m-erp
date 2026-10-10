-- Estrutura de produto em vários níveis, como no Tiny:
--  * kit (produtos.kit) = montagem SEM estoque próprio (ex.: "W - Cálculo Interno - Elétrica Top 300",
--    "Mecânica Redutor Q 063"): quando é vendida, produzida ou usada dentro de outra, sai do estoque o que
--    está dentro dela, nível por nível;
--  * máquina / fabricado (kit = false) = tem estoque próprio: a ordem de produção dá entrada nela e, se ela
--    estiver dentro de outra estrutura, sai do estoque inteira.
--  Até 10 níveis; a mesma peça em dois ramos é somada; um item que contém a si mesmo é ignorado.
--  Vale para a venda (aprovar pedido), a NF-e direta, a ordem de produção e a necessidade de peças.
--  Também: importação das composições exportadas do Tiny ("composição fabricados/kits").
-- Idempotente: pode rodar de novo sem erro.

-- Composição padrão de cada produto (kit: os componentes marcados como padrão; máquina: a ficha técnica)
create or replace view public.estrutura_produto with (security_invoker = true) as
  select k.kit_id as produto_id, k.componente_id, k.quantidade, 'kit'::text as origem
    from public.kit_componentes k where k.padrao
  union all
  select c.produto_id, c.componente_id, c.quantidade, 'ficha'::text
    from public.produto_componentes c;

-- 1º nível de um kit: a escolha feita no pedido (opcionais e alternativas) ou o padrão
create or replace function public.kit_composicao_direta(p_kit uuid, p_escolha jsonb)
returns table (componente_id uuid, quantidade numeric) language sql stable security definer set search_path = public as $$
  select (e->>'componente_id')::uuid, (e->>'quantidade')::numeric
    from jsonb_array_elements(p_escolha) e
   where p_escolha is not null and jsonb_typeof(p_escolha) = 'array' and jsonb_array_length(p_escolha) > 0
     and exists (select 1 from kit_componentes k where k.kit_id = p_kit and k.componente_id = (e->>'componente_id')::uuid)
     and (e->>'quantidade')::numeric > 0
  union all
  select k.componente_id, k.quantidade from kit_componentes k
   where (p_escolha is null or jsonb_typeof(p_escolha) <> 'array' or jsonb_array_length(p_escolha) = 0)
     and k.kit_id = p_kit and k.padrao;
$$;

-- O que sai do estoque para p_qtd unidades do produto: abre os kits que estão dentro, até chegar em peças
-- ou em itens com estoque próprio.
create or replace function public.explodir_estrutura(p_produto uuid, p_qtd numeric default 1, p_escolha jsonb default null)
returns table (componente_id uuid, quantidade numeric) language sql stable set search_path = public as $$
  with recursive raiz as (
    select d.componente_id, d.quantidade from public.kit_composicao_direta(p_produto, p_escolha) d
     where coalesce((select kit from produtos where id = p_produto), false)
    union all
    select e.componente_id, e.quantidade from estrutura_produto e
     where e.produto_id = p_produto and not coalesce((select kit from produtos where id = p_produto), false)
  ), arv as (
    select r.componente_id, r.quantidade * coalesce(p_qtd, 1) as quantidade, array[p_produto, r.componente_id] as caminho, 1 as nivel
      from raiz r where r.componente_id <> p_produto
    union all
    select e.componente_id, a.quantidade * e.quantidade, a.caminho || e.componente_id, a.nivel + 1
      from arv a
      join produtos p on p.id = a.componente_id and p.kit
      join estrutura_produto e on e.produto_id = a.componente_id
     where a.nivel < 10 and e.componente_id <> all(a.caminho)
  )
  select a.componente_id, sum(a.quantidade)::numeric
    from arv a join produtos p on p.id = a.componente_id
   where not (p.kit and exists (select 1 from estrutura_produto e where e.produto_id = p.id))
   group by a.componente_id;
$$;

-- Kit vendido: agora abre também os kits que estão dentro dele
create or replace function public.kit_composicao(p_kit uuid, p_escolha jsonb)
returns table (componente_id uuid, quantidade numeric) language sql stable security definer set search_path = public as $$
  select x.componente_id, x.quantidade from public.explodir_estrutura(p_kit, 1, p_escolha) x;
$$;

revoke execute on function public.kit_composicao_direta(uuid, jsonb) from public, anon;
revoke execute on function public.explodir_estrutura(uuid, numeric, jsonb) from public, anon;
revoke execute on function public.kit_composicao(uuid, jsonb) from public, anon;
grant execute on function public.kit_composicao_direta(uuid, jsonb) to authenticated;
grant execute on function public.explodir_estrutura(uuid, numeric, jsonb) to authenticated;
grant execute on function public.kit_composicao(uuid, jsonb) to authenticated;

-- Necessidade de peças de cada OP: estrutura aberta em todos os níveis
create or replace view public.necessidade_producao
with (security_invoker = true) as
select
  op.id as ordem_id,
  c.componente_id,
  p.descricao,
  p.unidade,
  p.fornecedor_padrao_id,
  p.preco_custo,
  c.quantidade as necessario,
  public.estoque_na_unidade(c.componente_id, op.unidade_id)::numeric(12,3) as estoque_atual,
  coalesce((
    select sum(x.quantidade)
      from public.ordens_producao op2
      cross join lateral public.explodir_estrutura(op2.produto_id, op2.quantidade) x
     where x.componente_id = c.componente_id
       and op2.status in ('planejada', 'em_producao') and op2.id <> op.id and op2.created_at < op.created_at
       and op2.unidade_id = op.unidade_id
  ), 0) as reservado_outras_op,
  coalesce((
    select sum(i.quantidade - i.quantidade_recebida)
      from public.pedido_compra_itens i
      join public.pedidos_compra pc on pc.id = i.pedido_compra_id
     where i.produto_id = c.componente_id and pc.status in ('cotacao', 'enviado', 'parcial') and pc.unidade_id = op.unidade_id
  ), 0) as a_caminho
from public.ordens_producao op
cross join lateral public.explodir_estrutura(op.produto_id, op.quantidade) c
join public.produtos p on p.id = c.componente_id;

-- Concluir a produção: baixa as peças de todos os níveis (as montagens sem estoque são abertas)
create or replace function public.concluir_producao(p_ordem uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_op public.ordens_producao;
  v_c record;
  v_faltas text;
begin
  perform public.exigir_papel('tecnico', 'financeiro');
  select * into v_op from public.ordens_producao where id = p_ordem for update;
  if not found then raise exception 'ordem de produção não encontrada'; end if;
  if v_op.status in ('concluida', 'cancelada') then raise exception 'ordem já finalizada'; end if;
  if not exists (select 1 from public.estrutura_produto where produto_id = v_op.produto_id) then
    raise exception 'cadastre a ficha técnica da máquina antes de concluir a produção';
  end if;

  select string_agg(p.descricao || ' (falta ' || trim_scale(x.quantidade - public.estoque_na_unidade(p.id, v_op.unidade_id)) || ')', ', ' order by p.descricao)
    into v_faltas
    from public.explodir_estrutura(v_op.produto_id, v_op.quantidade) x join public.produtos p on p.id = x.componente_id
   where public.estoque_na_unidade(p.id, v_op.unidade_id) < x.quantidade;
  if v_faltas is not null then raise exception 'peças insuficientes no estoque desta unidade: %', v_faltas; end if;

  for v_c in select * from public.explodir_estrutura(v_op.produto_id, v_op.quantidade) loop
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
    values (v_c.componente_id, 'saida', v_c.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.unidade_id);
  end loop;
  insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
  values (v_op.produto_id, 'entrada', v_op.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.numeros_serie, v_op.unidade_id);

  -- custo da máquina = soma das peças de todos os níveis (só quando todas as peças têm custo; senão fica o atual)
  update public.produtos set preco_custo = s.custo
    from (select coalesce(sum(x.quantidade * p.preco_custo), 0) as custo, bool_and(p.preco_custo > 0) as completo
            from public.explodir_estrutura(v_op.produto_id, 1) x join public.produtos p on p.id = x.componente_id) s
   where id = v_op.produto_id and s.completo and s.custo > 0;

  update public.ordens_producao set status = 'concluida', concluida_em = now() where id = p_ordem;
end $$;

-- NF-e direta: kit sai pelos componentes de todos os níveis
create or replace function public.estoque_nota_direta(p_nota uuid, p_estornar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; i jsonb; p produtos; c record; v_tipo text; v_q numeric; k int := 0;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into n from notas_fiscais where id = p_nota for update;
  if not found then raise exception 'nota não encontrada'; end if;
  if n.pedido_id is not null or n.itens is null then raise exception 'só para nota direta (a do pedido baixa o estoque pelo pedido)'; end if;
  if n.ambiente = 'homologacao' then raise exception 'nota de teste (homologação) não mexe no estoque'; end if;
  if not p_estornar and n.status <> 'autorizada' then raise exception 'só depois que a nota for autorizada'; end if;
  if coalesce(n.estoque_lancado, false) = (not p_estornar) then
    raise exception '%', case when p_estornar then 'o estoque desta nota não foi baixado' else 'o estoque desta nota já foi baixado' end;
  end if;
  v_tipo := case when p_estornar then 'entrada' else 'saida' end;
  for i in select * from jsonb_array_elements(n.itens) loop
    v_q := coalesce(nullif(i->>'quantidade', '')::numeric, 0);
    if nullif(i->>'produto_id', '') is null or v_q <= 0 then continue; end if;
    select * into p from produtos where id = (i->>'produto_id')::uuid;
    if not found then continue; end if;
    if coalesce(p.kit, false) then
      for c in select * from public.kit_composicao(p.id, null) loop
        insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
        values (c.componente_id, v_tipo, v_q * c.quantidade,
                case when p_estornar then 'Estorno da ' else '' end || 'NF-e ' || coalesce(n.numero, '') || ' (nota direta, kit ' || p.descricao || ')',
                'nfe_direta', n.id, n.unidade_id);
        k := k + 1;
      end loop;
    else
      insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
      values (p.id, v_tipo, v_q, case when p_estornar then 'Estorno da ' else '' end || 'NF-e ' || coalesce(n.numero, '') || ' (nota direta)',
              'nfe_direta', n.id, n.unidade_id);
      k := k + 1;
    end if;
  end loop;
  update notas_fiscais set estoque_lancado = not p_estornar where id = p_nota;
  return k;
end $$;
revoke execute on function public.estoque_nota_direta(uuid, boolean) from public, anon;

-- ---------------------------------------------------------------------
-- Importar as composições do Tiny (planilhas "composição fabricados/kits")
--   p_itens  = [{id, sku, descricao}]  todos os itens das planilhas (estruturas e componentes)
--   p_linhas = [{pai, comp, qtd}]      ID do Tiny da estrutura, do componente e a quantidade
-- Cada item é ligado ao produto do ERP: pelo ID do Tiny, pelo ID unificado ("Tiny 123" nos códigos
-- alternativos), pelo nome (sem acento e pontuação) ou pelo SKU, nessa ordem; o que não existe vira
-- componente de produção novo (um só por nome, mesmo que o Tiny tenha várias cópias).
-- O Tiny guarda cópias antigas das montagens: entra só o que é usado a partir de um produto que já está
-- no ERP, e de cada produto vale a estrutura do mesmo ID (ou a mais nova). Nada é apagado: componente
-- que já está na estrutura fica como está.
-- p_aplicar = false só mostra o que seria feito.
-- ---------------------------------------------------------------------
create or replace function public.chave_nome_produto(p text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ–—',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn--')), '[^a-z0-9]+', ' ', 'g')),
    '\mextrutura\M', 'estrutura', 'g'), '\mqueem\M', 'queen', 'g');
$$;

create or replace function public.importar_estruturas_tiny_nucleo(p_itens jsonb, p_linhas jsonb, p_aplicar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; v_id uuid; v_sku text; v_n int; v_ins int := 0; v_ja int := 0; v_kit int := 0; v_ficha int := 0;
  v_hoje text := to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
  v_res jsonb;
begin
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'planilha inválida: faltam os itens ou as linhas da composição';
  end if;
  drop table if exists pg_temp._it, pg_temp._li, pg_temp._res, pg_temp._no, pg_temp._est, pg_temp._ativo, pg_temp._usa, pg_temp._novo;

  create temp table _it on commit drop as
    select distinct on (btrim(x->>'id')) btrim(x->>'id') as tiny, nullif(btrim(x->>'sku'), '') as sku,
           regexp_replace(btrim(x->>'descricao'), '\s+', ' ', 'g') as descricao, public.chave_nome_produto(x->>'descricao') as chave
      from jsonb_array_elements(p_itens) x
     where nullif(btrim(x->>'id'), '') is not null and nullif(btrim(x->>'descricao'), '') is not null
     order by btrim(x->>'id');
  create temp table _li on commit drop as
    select btrim(x->>'pai') as pai, btrim(x->>'comp') as comp, sum((x->>'qtd')::numeric) as qtd
      from jsonb_array_elements(p_linhas) x
     where (x->>'qtd') ~ '^\s*[0-9]+([.][0-9]+)?\s*$' and (x->>'qtd')::numeric > 0
       and btrim(x->>'pai') in (select tiny from _it) and btrim(x->>'comp') in (select tiny from _it)
       and btrim(x->>'pai') <> btrim(x->>'comp')
     group by 1, 2;

  -- ligação de cada item a um produto do ERP
  create temp table _res (tiny text primary key, produto_id uuid, como text) on commit drop;
  insert into _res select i.tiny, p.id, 'id' from _it i join produtos p on p.id_externo = i.tiny and p.unificado_em is null;
  insert into _res select distinct on (i.tiny) i.tiny, p.id, 'unificado' from _it i
    join produtos p on p.unificado_em is null and coalesce(p.codigos_alternativos, '') ~ ('(^|[ ,])Tiny ' || i.tiny || '($|[ ,])')
   where not exists (select 1 from _res x where x.tiny = i.tiny) order by i.tiny, p.ativo desc;
  insert into _res select i.tiny, (array_agg(p.id))[1], 'nome' from _it i
    join produtos p on p.unificado_em is null and public.chave_nome_produto(p.descricao) = i.chave
   where not exists (select 1 from _res x where x.tiny = i.tiny) and i.chave <> ''
   group by i.tiny having count(*) = 1;
  insert into _res select i.tiny, (array_agg(p.id))[1], 'sku' from _it i
    join produtos p on p.unificado_em is null and i.sku is not null and upper(btrim(p.sku)) = upper(i.sku)
   where not exists (select 1 from _res x where x.tiny = i.tiny)
   group by i.tiny having count(*) = 1;

  -- nó = produto do ERP ou "novo:<nome>" (as cópias com o mesmo nome viram um produto só)
  create temp table _no on commit drop as
    select i.tiny, coalesce(r.produto_id::text, 'novo:' || i.chave) as no, r.como from _it i left join _res r on r.tiny = i.tiny;
  -- estrutura de cada nó: a do mesmo ID do Tiny; senão a do ID mais novo
  create temp table _est on commit drop as
    select distinct on (n.no) n.no, n.tiny as pai
      from _no n left join produtos p on p.id::text = n.no
     where exists (select 1 from _li l where l.pai = n.tiny)
     order by n.no, (p.id_externo is not distinct from n.tiny) desc, length(n.tiny) desc, n.tiny desc;
  -- entram as estruturas de produtos que já estão no ERP e as que elas usam (em qualquer nível)
  create temp table _ativo (no text primary key) on commit drop;
  insert into _ativo select e.no from _est e join _no n on n.tiny = e.pai where n.como in ('id', 'unificado') on conflict do nothing;
  loop
    insert into _ativo
      select distinct nc.no from _ativo a join _est e on e.no = a.no join _li l on l.pai = e.pai
        join _no nc on nc.tiny = l.comp join _est e2 on e2.no = nc.no
       where not exists (select 1 from _ativo x where x.no = nc.no)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    exit when v_n = 0;
  end loop;
  create temp table _usa on commit drop as
    select e.no as pai_no, nc.no as comp_no, sum(l.qtd) as qtd
      from _ativo a join _est e on e.no = a.no join _li l on l.pai = e.pai join _no nc on nc.tiny = l.comp
     where nc.no <> e.no
     group by 1, 2;
  create temp table _novo (no text primary key, produto_id uuid) on commit drop;
  insert into _novo (no) select distinct comp_no from _usa where comp_no like 'novo:%'
    union select no from _ativo where no like 'novo:%';

  if p_aplicar then
    for rec in
      select nv.no, (array_agg(n.tiny order by length(n.tiny), n.tiny))[1] as tiny,
             array_agg(n.tiny order by length(n.tiny), n.tiny) as ids,
             (array_agg(i.descricao order by length(n.tiny) desc, n.tiny desc))[1] as descricao,
             array_remove(array_agg(distinct i.sku), null) as skus,
             exists (select 1 from _ativo a where a.no = nv.no) as montagem
        from _novo nv join _no n on n.no = nv.no join _it i on i.tiny = n.tiny
       group by nv.no
    loop
      v_sku := null;
      if cardinality(rec.skus) = 1 and not exists (select 1 from produto_skus s where s.sku_norm = upper(btrim(rec.skus[1]))) then
        v_sku := rec.skus[1];
      end if;
      insert into produtos (descricao, sku, tipo, unidade, origem, preco_custo, preco_venda, estoque_atual, estoque_minimo,
                            ativo, vendavel, no_catalogo, kit, id_externo, codigos_alternativos, observacoes)
      values (rec.descricao, v_sku, 'insumo', 'UN', 0, 0, 0, 0, 0, true, false, false, rec.montagem, rec.tiny,
              nullif(array_to_string(array(select 'Tiny ' || x from unnest(rec.ids[2:]) x)
                || array(select s from unnest(rec.skus) s where s is distinct from v_sku), ', '), ''),
              'Criado ao importar a composição do Tiny em ' || v_hoje || '.')
      returning id into v_id;
      update _novo set produto_id = v_id where no = rec.no;
    end loop;

    for rec in
      select coalesce(np.produto_id, case when u.pai_no not like 'novo:%' then u.pai_no::uuid end) as pai,
             coalesce(nc.produto_id, case when u.comp_no not like 'novo:%' then u.comp_no::uuid end) as comp, u.qtd
        from _usa u left join _novo np on np.no = u.pai_no left join _novo nc on nc.no = u.comp_no
    loop
      if (select kit from produtos where id = rec.pai) then
        insert into kit_componentes (kit_id, componente_id, quantidade, opcional, padrao) values (rec.pai, rec.comp, rec.qtd, false, true)
        on conflict (kit_id, componente_id) do nothing;
        get diagnostics v_n = row_count; v_kit := v_kit + v_n;
      else
        insert into produto_componentes (produto_id, componente_id, quantidade) values (rec.pai, rec.comp, rec.qtd)
        on conflict (produto_id, componente_id) do nothing;
        get diagnostics v_n = row_count; v_ficha := v_ficha + v_n;
      end if;
      if v_n = 0 then v_ja := v_ja + 1; end if;
    end loop;
  end if;

  select jsonb_build_object(
    'aplicado', p_aplicar,
    'itens', (select count(*) from _it),
    'ligados', (select jsonb_object_agg(como, n) from (select como, count(*) n from _res group by como) x),
    'estruturas_planilha', (select count(distinct pai) from _li),
    'estruturas', (select count(*) from _ativo),
    'linhas', (select count(*) from _usa),
    'gravadas_kit', v_kit, 'gravadas_ficha', v_ficha, 'ja_existiam', v_ja,
    'novos', coalesce((select jsonb_agg(jsonb_build_object('descricao', x.descricao, 'copias', x.copias, 'montagem', x.montagem) order by x.descricao)
      from (select (array_agg(i.descricao order by length(n.tiny) desc, n.tiny desc))[1] descricao, count(*) copias,
                   exists (select 1 from _ativo a where a.no = nv.no) montagem
              from _novo nv join _no n on n.no = nv.no join _it i on i.tiny = n.tiny group by nv.no) x), '[]'),
    'por_nome', coalesce((select jsonb_agg(jsonb_build_object('tiny', i.descricao, 'erp', p.descricao, 'como', r.como) order by p.descricao)
      from _res r join _it i on i.tiny = r.tiny join produtos p on p.id = r.produto_id
     where r.como in ('nome', 'sku') and exists (select 1 from _usa u where u.comp_no = r.produto_id::text or u.pai_no = r.produto_id::text)), '[]'),
    'antigas', coalesce((select jsonb_agg(jsonb_build_object('tiny', d.pai, 'descricao', i.descricao) order by i.descricao)
      from (select distinct pai from _li) d join _it i on i.tiny = d.pai
     where not exists (select 1 from _est e join _ativo a on a.no = e.no where e.pai = d.pai)), '[]')
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.importar_estruturas_tiny_nucleo(jsonb, jsonb, boolean) from public, anon, authenticated;

create or replace function public.importar_estruturas_tiny(p_itens jsonb, p_linhas jsonb, p_aplicar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  return public.importar_estruturas_tiny_nucleo(p_itens, p_linhas, p_aplicar);
end $$;
revoke execute on function public.importar_estruturas_tiny(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.importar_estruturas_tiny(jsonb, jsonb, boolean) to authenticated;
