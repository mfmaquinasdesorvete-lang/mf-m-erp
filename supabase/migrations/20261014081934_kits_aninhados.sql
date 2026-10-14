-- Kits de venda formados por componentes, como no Tiny, com kit dentro de kit:
--  * kit_composicao: o que sai do estoque para 1 kit, abrindo os kits que estão dentro dele (ex.: Mecânica Dupla
--    leva 2 Mecânicas Q 050, que por sua vez são eixo + separador + rolamentos + retentor);
--  * estrutura_consumo / custo_estrutura: kit que está na ficha técnica de uma máquina sai pelos componentes dele
--    (o kit não tem estoque próprio) e entra no custo pela soma dos componentes;
--  * nota direta: kit sai pela mesma regra do pedido;
--  * um kit não pode levar a si mesmo (direta ou indiretamente);
--  * importar_kits_tiny: grava a composição lida das planilhas "composição de fabricados e kits" do Tiny
--    (só preenche kit que ainda não tem componentes; não apaga nada).

-- Componentes que saem do estoque para 1 unidade do kit (escolha do pedido no 1º nível; kits de dentro pelo padrão)
create or replace function public.kit_composicao(p_kit uuid, p_escolha jsonb)
returns table (componente_id uuid, quantidade numeric) language sql stable security definer set search_path = public as $$
  with recursive topo(componente_id, quantidade) as (
    select (e->>'componente_id')::uuid, (e->>'quantidade')::numeric
      from jsonb_array_elements(case when jsonb_typeof(p_escolha) = 'array' then p_escolha else '[]'::jsonb end) e
     where exists (select 1 from kit_componentes k where k.kit_id = p_kit and k.componente_id = (e->>'componente_id')::uuid)
       and (e->>'quantidade')::numeric > 0
    union all
    select k.componente_id, k.quantidade from kit_componentes k
     where (p_escolha is null or jsonb_typeof(p_escolha) <> 'array' or jsonb_array_length(p_escolha) = 0)
       and k.kit_id = p_kit and k.padrao
  ),
  arvore(componente_id, quantidade, nivel, caminho) as (
    select t.componente_id, t.quantidade, 1, array[p_kit, t.componente_id] from topo t
    union all
    select k.componente_id, a.quantidade * k.quantidade, a.nivel + 1, a.caminho || k.componente_id
      from arvore a join kit_componentes k on k.kit_id = a.componente_id and k.padrao
     where a.nivel < 10 and not k.componente_id = any(a.caminho)
  )
  select a.componente_id, sum(a.quantidade)::numeric
    from arvore a
   where not exists (select 1 from kit_componentes x where x.kit_id = a.componente_id and x.padrao)
   group by a.componente_id
$$;

-- O que a produção de p_qtd unidades consome: peças compradas, subconjuntos com estoque próprio e,
-- no lugar de cada kit, os componentes dele.
create or replace function public.estrutura_consumo(p_produto uuid, p_qtd numeric)
returns table (componente_id uuid, quantidade numeric) language sql stable set search_path = public as $$
  with recursive arvore(componente_id, qtd, nivel, caminho) as (
    select c.componente_id, c.quantidade * p_qtd, 1, array[p_produto, c.componente_id]
      from produto_componentes c where c.produto_id = p_produto
    union all
    select c.componente_id, a.qtd * c.quantidade, a.nivel + 1, a.caminho || c.componente_id
      from arvore a
      join produtos sp on sp.id = a.componente_id and not sp.subconjunto_estocado
      join produto_componentes c on c.produto_id = a.componente_id
     where a.nivel < 15 and not c.componente_id = any(a.caminho)
  ),
  folhas as (
    select a.componente_id, p.subconjunto_estocado as estocado, sum(a.qtd) as qtd
      from arvore a join produtos p on p.id = a.componente_id
     where p.subconjunto_estocado or not exists (select 1 from produto_componentes x where x.produto_id = a.componente_id)
     group by a.componente_id, p.subconjunto_estocado
  )
  select coalesce(k.componente_id, f.componente_id), sum(f.qtd * coalesce(k.quantidade, 1))::numeric
    from folhas f
    left join lateral (select * from public.kit_composicao(f.componente_id, null) where not f.estocado) k on true
   group by coalesce(k.componente_id, f.componente_id)
$$;

-- Custo de uma unidade somando as peças de todos os níveis (kit entra pela soma dos componentes dele)
create or replace function public.custo_estrutura(p_produto uuid)
returns numeric language sql stable set search_path = public as $$
  with recursive arvore(componente_id, qtd, nivel, caminho) as (
    select c.componente_id, c.quantidade::numeric, 1, array[p_produto, c.componente_id]
      from produto_componentes c where c.produto_id = p_produto
    union all
    select c.componente_id, a.qtd * c.quantidade, a.nivel + 1, a.caminho || c.componente_id
      from arvore a join produto_componentes c on c.produto_id = a.componente_id
     where a.nivel < 15 and not c.componente_id = any(a.caminho)
  )
  select coalesce(sum(a.qtd * coalesce(
           (select sum(k.quantidade * coalesce(pk.preco_custo, 0))
              from public.kit_composicao(a.componente_id, null) k join produtos pk on pk.id = k.componente_id),
           p.preco_custo, 0)), 0)
    from arvore a join produtos p on p.id = a.componente_id
   where not exists (select 1 from produto_componentes x where x.produto_id = a.componente_id)
$$;

-- Estoque da nota direta: saída de cada item (kit sai pelos componentes, abrindo os kits de dentro); p_estornar devolve
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
      for c in select componente_id, quantidade from public.kit_composicao(p.id, null) loop
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

-- Um kit não pode levar a si mesmo (A leva B que leva A)
create or replace function public.trg_kit_componentes_ciclo()
returns trigger language plpgsql set search_path = public as $$
declare v_nome text;
begin
  if exists (
    with recursive abaixo(id, nivel) as (
      select k.componente_id, 1 from kit_componentes k where k.kit_id = new.componente_id
      union
      select k.componente_id, a.nivel + 1 from abaixo a join kit_componentes k on k.kit_id = a.id where a.nivel < 20
    ) select 1 from abaixo where id = new.kit_id) then
    select descricao into v_nome from produtos where id = new.componente_id;
    raise exception 'o kit daria volta: % já leva este kit (direta ou indiretamente)', coalesce(v_nome, 'o componente');
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_kit_componentes_ciclo' and tgrelid = 'public.kit_componentes'::regclass) then
    create trigger trg_kit_componentes_ciclo before insert or update of kit_id, componente_id on public.kit_componentes
      for each row execute function public.trg_kit_componentes_ciclo();
  end if;
end $$;

-- Composição dos kits lida do Tiny: [{kit_id, itens: [{componente_id, quantidade}]}].
-- Só preenche kit que ainda está sem componentes (o que já foi cadastrado no ERP fica como está).
create or replace function public.importar_kits_tiny(p_kits jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_k jsonb; v_i jsonb; v_kit produtos; v_comp uuid; v_q numeric; v_ok boolean;
  n_kits int := 0; n_comp int := 0; n_ign int := 0; v_ja text[] := '{}';
begin
  perform public.exigir_papel('financeiro');
  if jsonb_typeof(p_kits) is distinct from 'array' or jsonb_array_length(p_kits) not between 1 and 300 then
    raise exception 'envie de 1 a 300 kits';
  end if;
  for v_k in select * from jsonb_array_elements(p_kits) loop
    select * into v_kit from produtos where id = nullif(v_k->>'kit_id', '')::uuid;
    if not found or not v_kit.kit then n_ign := n_ign + 1; continue; end if;
    if exists (select 1 from kit_componentes where kit_id = v_kit.id) then v_ja := v_ja || v_kit.descricao; continue; end if;
    v_ok := false;
    for v_i in select * from jsonb_array_elements(case when jsonb_typeof(v_k->'itens') = 'array' then v_k->'itens' else '[]'::jsonb end) loop
      v_comp := nullif(v_i->>'componente_id', '')::uuid;
      v_q := round(coalesce(nullif(v_i->>'quantidade', '')::numeric, 0), 3);
      if v_comp is null or v_comp = v_kit.id or v_q <= 0 or not exists (select 1 from produtos where id = v_comp) then
        n_ign := n_ign + 1; continue;
      end if;
      insert into kit_componentes (kit_id, componente_id, quantidade) values (v_kit.id, v_comp, v_q)
        on conflict (kit_id, componente_id) do update set quantidade = kit_componentes.quantidade + excluded.quantidade;
      n_comp := n_comp + 1; v_ok := true;
    end loop;
    if v_ok then n_kits := n_kits + 1; end if;
  end loop;
  return jsonb_build_object('kits', n_kits, 'componentes', n_comp, 'ja_tinham', to_jsonb(v_ja), 'ignorados', n_ign);
end $$;
revoke execute on function public.importar_kits_tiny(jsonb) from public, anon;
