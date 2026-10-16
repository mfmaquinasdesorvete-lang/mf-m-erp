-- =====================================================================
-- Metas de vendas: por vendedor, por estado/região e da empresa (Painel gerencial → Metas e tela Metas)
--  * metas_vendas: a meta do mês (faturamento em R$; máquinas e margem % opcionais) da empresa, de um vendedor,
--    de um estado ('UF:SC') ou de uma região do IBGE ('REG:Sul'), de uma unidade (Matriz SC, Filial SP) ou de
--    todas (unidade vazia). Uma meta por mês + tipo + vendedor/região + unidade. Tirar a meta = ativo false;
--  * metas_salvar: grava as metas do mês de uma vez (administrador ou financeiro);
--  * metas_copiar: copia as metas de um mês para outro, com % de aumento (administrador ou financeiro);
--  * metas_apuracao: meta x realizado por mês da empresa, dos vendedores, dos estados e das regiões, com % atingido,
--    máquinas, margem, projeção pelos dias úteis, quanto falta por dia útil e o mesmo mês do ano anterior.
--    Realizado = vendas líquidas, com a regra do Painel gerencial, dos Relatórios e da Margem:
--      - pedidos aprovados, faturados ou entregues, no dia da aprovação;
--      - NF-e de venda autorizadas sem pedido (importadas do Tiny): de produção, saída, normal e com CFOP de venda
--        (o valor da nota na proporção dos itens de venda). Nota ligada a pedido não conta de novo: o pedido já conta;
--      - menos as NF-e de devolução de venda (entrada) ligadas a uma venda que conta, no mês da devolução;
--      - orçamentos, pedidos cancelados, notas canceladas, de teste, remessas e transferências ficam de fora.
--    Vendedor: o do pedido (ou o nome escrito no pedido); venda sem vendedor (nota do Tiny) fica com o vendedor da
--    carteira do cliente; sem nenhum, "Sem vendedor". Estado: o do destinatário da nota ou o do cliente.
--    Dias úteis: segunda a sexta, menos os feriados nacionais de data fixa, contados até hoje (inclusive).
--  * Administrador e financeiro veem tudo; o vendedor (perfil vendas) vê só a própria meta: o vendedor ligado
--    ao login em Comissões → Vendedores.
-- Somente acréscimos: tabela nova, funções create or replace e políticas novas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Metas
-- ---------------------------------------------------------------------
create table if not exists public.metas_vendas (
  id uuid primary key default gen_random_uuid(),
  -- primeiro dia do mês
  mes date not null,
  tipo text not null,
  vendedor_id uuid references public.vendedores(id),
  -- 'UF:SC' (um estado) ou 'REG:Sul' (uma região do IBGE)
  regiao text,
  -- vazia = todas as unidades
  unidade_id uuid references public.unidades(id),
  meta_valor numeric(14,2) not null default 0,
  meta_maquinas integer,
  -- margem mínima em % (venda menos o custo do produto)
  meta_margem numeric(5,2),
  observacao text,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_por uuid,
  atualizado_em timestamptz,
  constraint metas_vendas_mes check (mes = date_trunc('month', mes)::date),
  constraint metas_vendas_tipo check (tipo in ('empresa', 'vendedor', 'regiao')),
  constraint metas_vendas_alvo check (
       (tipo = 'empresa' and vendedor_id is null and regiao is null)
    or (tipo = 'vendedor' and vendedor_id is not null and regiao is null)
    or (tipo = 'regiao' and vendedor_id is null and regiao is not null)),
  constraint metas_vendas_regiao check (regiao is null or regiao ~ '^(UF:(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)|REG:(Norte|Nordeste|Centro-Oeste|Sudeste|Sul))$'),
  constraint metas_vendas_valores check (
    meta_valor >= 0 and (meta_maquinas is null or meta_maquinas >= 0)
    and (meta_margem is null or meta_margem between -100 and 100)
    and (observacao is null or length(observacao) <= 500))
);
comment on table public.metas_vendas is 'Metas de vendas do mês: empresa, vendedor, estado (UF:XX) ou região (REG:Nome), por unidade ou de todas (unidade vazia). Gravadas por metas_salvar e metas_copiar.';

-- uma meta por mês + tipo + vendedor/região + unidade (vazio conta como valor)
create unique index if not exists metas_vendas_unica
  on public.metas_vendas (mes, tipo, vendedor_id, regiao, unidade_id) nulls not distinct;
create index if not exists metas_vendas_mes on public.metas_vendas (mes) where ativo;

alter table public.metas_vendas enable row level security;
revoke all on public.metas_vendas from anon, authenticated;
grant select on public.metas_vendas to authenticated;
grant all on public.metas_vendas to service_role;

-- vendedores ligados ao login de quem está usando
create or replace function public.metas_meus_vendedores()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(v.id), '{}') from public.vendedores v where v.user_id = auth.uid();
$$;
revoke execute on function public.metas_meus_vendedores() from public, anon;
grant execute on function public.metas_meus_vendedores() to authenticated;

-- administrador e financeiro leem todas; o vendedor só as próprias (a gravação é pelas funções)
do $$ begin
  create policy metas_vendas_select on public.metas_vendas for select to authenticated
    using (public.tem_algum_papel(array['financeiro'])
           or (tipo = 'vendedor' and vendedor_id = any (public.metas_meus_vendedores())));
exception when duplicate_object then null; end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.metas_vendas'::regclass) then
    create trigger zz_auditoria before insert or update on public.metas_vendas for each row execute function public.trg_auditoria();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Apoio: região do IBGE do estado, dias úteis do período e número do JSON da nota
-- ---------------------------------------------------------------------
create or replace function public.metas_regiao_da_uf(p_uf text)
returns text language sql immutable set search_path = public as $$
  select case
    when u = any (array['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO']) then 'Norte'
    when u = any (array['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']) then 'Nordeste'
    when u = any (array['DF', 'GO', 'MT', 'MS']) then 'Centro-Oeste'
    when u = any (array['ES', 'MG', 'RJ', 'SP']) then 'Sudeste'
    when u = any (array['PR', 'RS', 'SC']) then 'Sul'
  end
  from (select upper(btrim(coalesce(p_uf, ''))) u) x;
$$;

-- segunda a sexta, menos os feriados nacionais de data fixa (Consciência Negra a partir de 2024)
create or replace function public.metas_dias_uteis(p_de date, p_ate date)
returns integer language sql immutable set search_path = public as $$
  select count(*)::int
    from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') d
   where extract(isodow from d) < 6
     and to_char(d, 'MM-DD') <> all (array['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'])
     and not (to_char(d, 'MM-DD') = '11-20' and extract(year from d) >= 2024);
$$;

-- número gravado como texto no JSON da nota (vazio ou inválido = 0)
create or replace function public.metas_num(p text)
returns numeric language sql immutable set search_path = public as $$
  select case when btrim(coalesce(p, '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p)::numeric else 0 end;
$$;

revoke execute on function public.metas_regiao_da_uf(text) from public, anon;
revoke execute on function public.metas_dias_uteis(date, date) from public, anon;
revoke execute on function public.metas_num(text) from public, anon;
grant execute on function public.metas_regiao_da_uf(text) to authenticated;
grant execute on function public.metas_dias_uteis(date, date) to authenticated;
grant execute on function public.metas_num(text) to authenticated;

-- ---------------------------------------------------------------------
-- Gravar as metas do mês (administrador ou financeiro)
--   p_linhas: [{ tipo, vendedor_id?, regiao?, meta_valor, meta_maquinas?, meta_margem?, observacao?, ativo? }]
--   linha sem valor e sem máquinas (ou ativo false) tira a meta que existir
-- ---------------------------------------------------------------------
create or replace function public.metas_salvar(p_mes date, p_unidade uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  l jsonb;
  v_tipo text;
  v_vend uuid;
  v_reg text;
  v_valor numeric;
  v_maq integer;
  v_marg numeric;
  v_obs text;
  v_ativo boolean;
  v_id uuid;
  n integer := 0;
begin
  if not public.tem_algum_papel(array['financeiro']) then
    raise exception 'só o administrador ou o financeiro gravam metas';
  end if;
  if p_mes is null then raise exception 'informe o mês da meta'; end if;
  if p_unidade is not null and not exists (select 1 from unidades where id = p_unidade) then
    raise exception 'unidade não encontrada';
  end if;
  if jsonb_typeof(coalesce(p_linhas, '[]'::jsonb)) <> 'array' then raise exception 'lista de metas inválida'; end if;

  perform set_config('erp.acao_usuario', 'on', true);
  for l in select x from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) x loop
    v_tipo := l->>'tipo';
    if v_tipo is null or v_tipo not in ('empresa', 'vendedor', 'regiao') then
      raise exception 'tipo de meta inválido: %', coalesce(v_tipo, '(vazio)');
    end if;
    v_vend := case when v_tipo = 'vendedor' then nullif(l->>'vendedor_id', '')::uuid end;
    v_reg := case when v_tipo = 'regiao' then nullif(btrim(l->>'regiao'), '') end;
    if v_tipo = 'vendedor' and (v_vend is null or not exists (select 1 from vendedores where id = v_vend)) then
      raise exception 'vendedor não encontrado';
    end if;
    if v_tipo = 'regiao' and (v_reg is null or v_reg !~ '^(UF:(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)|REG:(Norte|Nordeste|Centro-Oeste|Sudeste|Sul))$') then
      raise exception 'região inválida: %', coalesce(v_reg, '(vazia)');
    end if;
    v_valor := round(coalesce(nullif(l->>'meta_valor', '')::numeric, 0), 2);
    v_maq := round(nullif(l->>'meta_maquinas', '')::numeric)::int;
    v_marg := round(nullif(l->>'meta_margem', '')::numeric, 2);
    v_obs := left(nullif(btrim(coalesce(l->>'observacao', '')), ''), 500);
    if v_valor < 0 then raise exception 'a meta não pode ser negativa'; end if;
    if v_maq is not null and v_maq < 0 then raise exception 'a meta de máquinas não pode ser negativa'; end if;
    if v_marg is not null and (v_marg < -100 or v_marg > 100) then raise exception 'a margem vai de −100%% a 100%%'; end if;
    v_ativo := coalesce((l->>'ativo')::boolean, true) and (v_valor > 0 or coalesce(v_maq, 0) > 0);

    select m.id into v_id from metas_vendas m
     where m.mes = v_mes and m.tipo = v_tipo and m.vendedor_id is not distinct from v_vend
       and m.regiao is not distinct from v_reg and m.unidade_id is not distinct from p_unidade
     for update;
    if v_id is null then
      if not v_ativo then continue; end if;
      insert into metas_vendas (mes, tipo, vendedor_id, regiao, unidade_id, meta_valor, meta_maquinas, meta_margem, observacao)
      values (v_mes, v_tipo, v_vend, v_reg, p_unidade, v_valor, v_maq, v_marg, v_obs);
    else
      update metas_vendas set meta_valor = v_valor, meta_maquinas = v_maq, meta_margem = v_marg, observacao = v_obs,
             ativo = v_ativo, atualizado_por = auth.uid(), atualizado_em = now()
       where id = v_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.metas_salvar(date, uuid, jsonb) from public, anon;
grant execute on function public.metas_salvar(date, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Copiar as metas de um mês para outro, com % de aumento (administrador ou financeiro)
--   todas as unidades; vendedor desativado fica de fora; meta que já existe no destino só muda com p_substituir
-- ---------------------------------------------------------------------
create or replace function public.metas_copiar(p_de date, p_para date, p_aumento numeric default 0, p_substituir boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_de date := date_trunc('month', p_de)::date;
  v_para date := date_trunc('month', p_para)::date;
  v_fator numeric := 1 + coalesce(p_aumento, 0) / 100;
  r metas_vendas;
  v_atual metas_vendas;
  n integer := 0;
begin
  if not public.tem_algum_papel(array['financeiro']) then
    raise exception 'só o administrador ou o financeiro gravam metas';
  end if;
  if v_de is null or v_para is null then raise exception 'informe os dois meses'; end if;
  if v_de = v_para then raise exception 'escolha um mês diferente para copiar'; end if;
  if coalesce(p_aumento, 0) < -90 or coalesce(p_aumento, 0) > 500 then raise exception 'o aumento vai de −90%% a 500%%'; end if;

  perform set_config('erp.acao_usuario', 'on', true);
  for r in
    select m.* from metas_vendas m
      left join vendedores v on v.id = m.vendedor_id
     where m.mes = v_de and m.ativo and (m.vendedor_id is null or v.ativo)
  loop
    select m.* into v_atual from metas_vendas m
     where m.mes = v_para and m.tipo = r.tipo and m.vendedor_id is not distinct from r.vendedor_id
       and m.regiao is not distinct from r.regiao and m.unidade_id is not distinct from r.unidade_id
     for update;
    if v_atual.id is not null and v_atual.ativo and not coalesce(p_substituir, false) then continue; end if;
    if v_atual.id is null then
      insert into metas_vendas (mes, tipo, vendedor_id, regiao, unidade_id, meta_valor, meta_maquinas, meta_margem, observacao)
      values (v_para, r.tipo, r.vendedor_id, r.regiao, r.unidade_id, round(r.meta_valor * v_fator, 2),
              case when r.meta_maquinas is not null then round(r.meta_maquinas * v_fator)::int end, r.meta_margem, r.observacao);
    else
      update metas_vendas set meta_valor = round(r.meta_valor * v_fator, 2),
             meta_maquinas = case when r.meta_maquinas is not null then round(r.meta_maquinas * v_fator)::int end,
             meta_margem = r.meta_margem, observacao = r.observacao, ativo = true,
             atualizado_por = auth.uid(), atualizado_em = now()
       where id = v_atual.id;
    end if;
    v_atual := null;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.metas_copiar(date, date, numeric, boolean) from public, anon;
grant execute on function public.metas_copiar(date, date, numeric, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Apuração: meta x realizado por mês (de p_de até p_ate, no máximo 36 meses), da unidade escolhida ou de todas.
--   Unidade escolhida: só as metas dela. Todas: a meta "todas as unidades" ou, sem ela, a soma das unidades.
--   Região sem meta própria: a soma das metas dos estados dela. Empresa sem meta própria: a soma das metas
--   dos vendedores ou, sem elas, a das regiões (meta_origem diz de onde veio).
--   Venda sem unidade conta para a matriz.
-- ---------------------------------------------------------------------
create or replace function public.metas_apuracao(p_de date, p_ate date default null, p_unidade uuid default null)
returns table (
  mes date, tipo text, chave text, vendedor_id uuid, regiao text, nome text,
  meta numeric, meta_maquinas numeric, meta_margem numeric, meta_origem text, observacao text,
  realizado numeric, vendas integer, devolucoes numeric, maquinas numeric, margem_pct numeric, margem_base numeric,
  pct numeric, dias_uteis integer, dias_passados integer, projecao numeric, falta numeric, falta_por_dia numeric,
  ano_anterior numeric, ano_anterior_parcial numeric, variacao_ano numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_gerencia boolean := public.tem_algum_papel(array['financeiro']);
  v_meus uuid[];
  v_de date := date_trunc('month', p_de)::date;
  v_ate date := date_trunc('month', coalesce(p_ate, p_de))::date;
  v_fim date;
  v_hist date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_corte date;
  v_matriz uuid;
begin
  if not v_gerencia then
    if not public.tem_algum_papel(array['vendas']) then raise exception 'acesso negado'; end if;
    v_meus := public.metas_meus_vendedores();
  end if;
  if v_de is null then raise exception 'informe o mês'; end if;
  if v_ate < v_de then raise exception 'o mês final vem antes do inicial'; end if;
  if v_ate > (v_de + interval '35 months')::date then raise exception 'escolha no máximo 36 meses'; end if;
  v_fim := (v_ate + interval '1 month' - interval '1 day')::date;
  v_hist := (v_de - interval '1 year')::date;
  v_corte := (v_hoje - interval '1 year')::date;
  select u.id into v_matriz from unidades u where u.matriz order by u.codigo limit 1;

  return query
  with
  -- cliente pelo CPF/CNPJ do destinatário (nota importada sem cliente ligado); unificado vale o cadastro que ficou
  cli_doc as (
    select distinct on (x.d) x.d, x.id
      from (select regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g') d, coalesce(c.unificado_em, c.id) id, (c.unificado_em is null) nao_unif
              from clientes c) x
     where length(x.d) >= 11
     order by x.d, x.nao_unif desc
  ),
  -- produto do item da nota: código (SKU, do fabricante, alternativos, códigos antigos) ou a mesma descrição
  cod_prod as (
    select distinct on (x.cod) x.cod, x.pid from (
      select lower(btrim(p.sku)) cod, coalesce(p.unificado_em, p.id) pid, (p.unificado_em is null) nao_unif, p.ativo, 1 ordem
        from produtos p where btrim(coalesce(p.sku, '')) <> ''
      union all
      select lower(btrim(p.codigo_fabricante)), coalesce(p.unificado_em, p.id), (p.unificado_em is null), p.ativo, 2
        from produtos p where btrim(coalesce(p.codigo_fabricante, '')) <> ''
      union all
      select lower(a.c), coalesce(p.unificado_em, p.id), (p.unificado_em is null), p.ativo, 3
        from produtos p cross join lateral regexp_split_to_table(btrim(coalesce(p.codigos_alternativos, '')), '[,;[:space:]]+') a(c)
       where a.c <> ''
      union all
      select lower(btrim(s.sku)), s.produto_id, true, true, 4 from produto_skus s where btrim(coalesce(s.sku, '')) <> ''
    ) x order by x.cod, x.nao_unif desc, x.ativo desc, x.ordem
  ),
  desc_prod as (
    select distinct on (x.t) x.t, x.pid from (
      select public.sem_acento(regexp_replace(btrim(p.descricao), '\s+', ' ', 'g')) t, coalesce(p.unificado_em, p.id) pid,
             (p.unificado_em is null) nao_unif, p.ativo
        from produtos p) x
     where x.t <> '' order by x.t, x.nao_unif desc, x.ativo desc
  ),
  -- pedidos que contam como venda
  ped as (
    select p.id,
           (coalesce(p.aprovado_em, p.created_at) at time zone 'America/Sao_Paulo')::date dia,
           coalesce(p.unidade_id, v_matriz) unidade_id,
           coalesce(p.vendedor_id, vn.id, c.vendedor_id) vendedor_id,
           nullif(upper(btrim(coalesce(c.uf, ''))), '') uf,
           coalesce(p.valor_total, 0)::numeric valor,
           coalesce(it.maquinas, 0)::numeric maquinas,
           coalesce(it.custo, 0)::numeric custo,
           -- parte da venda (sem o frete, com o desconto) dos itens com custo no cadastro
           case when it.bruto > 0 then coalesce(it.bruto_custo, 0) * greatest(coalesce(p.valor_total, 0) - coalesce(p.frete, 0), 0) / it.bruto else 0 end receita_custo
      from pedidos p
      left join clientes c on c.id = p.cliente_id
      left join lateral (
        select v.id from vendedores v
         where p.vendedor_id is null and btrim(coalesce(p.vendedor, '')) <> ''
           and public.sem_acento(btrim(v.nome)) = public.sem_acento(btrim(p.vendedor))
         order by v.ativo desc, v.created_at
         limit 1) vn on true
      left join lateral (
        select sum(i.quantidade) filter (where pr.tipo = 'maquina') maquinas,
               sum(i.quantidade * pr.preco_custo) filter (where pr.preco_custo > 0) custo,
               sum(i.quantidade * i.valor_unitario) filter (where pr.preco_custo > 0) bruto_custo,
               sum(i.quantidade * i.valor_unitario) bruto
          from pedido_itens i left join produtos pr on pr.id = i.produto_id
         where i.pedido_id = p.id) it on true
     where p.status in ('aprovado', 'faturado', 'entregue')
  ),
  -- notas de venda sem pedido (histórico do Tiny ou emitidas direto)
  nf as (
    select n.id, (n.created_at at time zone 'America/Sao_Paulo')::date dia,
           coalesce(n.unidade_id, v_matriz) unidade_id,
           coalesce(n.cliente_id, cd.id) cliente_id,
           coalesce(n.valor_total, 0)::numeric valor_total,
           nullif(btrim(coalesce(n.payload->>'uf_destinatario', '')), '') uf_nota,
           case when jsonb_typeof(n.payload->'items') = 'array' then n.payload->'items' else '[]'::jsonb end itens
      from notas_fiscais n
      left join cli_doc cd on n.cliente_id is null and cd.d = regexp_replace(coalesce(n.destinatario_doc, ''), '\D', '', 'g')
     where n.status = 'autorizada' and coalesce(n.ambiente, 'producao') <> 'homologacao' and n.pedido_id is null
       and n.excluida_em is null and coalesce(n.tipo_operacao, 'saida') = 'saida' and coalesce(n.finalidade, 'normal') = 'normal'
  ),
  nf_itens as (
    select nf.id nota,
           regexp_replace(coalesce(i->>'cfop', ''), '\D', '', 'g') ~ '^[567](10[0-9]|11[0-9]|12[0-5]|40[1-5])$' venda,
           public.metas_num(i->>'valor_bruto') bruto,
           public.metas_num(i->>'quantidade_comercial') qtd,
           coalesce(cp.pid, dp.pid) pid
      from nf
      cross join lateral jsonb_array_elements(nf.itens) i
      left join cod_prod cp on cp.cod = lower(btrim(coalesce(i->>'codigo_produto', '')))
      left join desc_prod dp on cp.pid is null
        and dp.t = public.sem_acento(regexp_replace(btrim(coalesce(i->>'descricao', '')), '\s+', ' ', 'g'))
  ),
  nf_venda as (
    select nf.id, nf.dia, nf.unidade_id,
           c.vendedor_id,
           nullif(upper(btrim(coalesce(nf.uf_nota, c.uf, ''))), '') uf,
           -- o valor da nota na proporção dos itens de venda (nota só de venda = o valor da nota)
           case when s.bruto_todos > 0 then nf.valor_total * s.bruto_venda / s.bruto_todos else nf.valor_total end valor,
           coalesce(s.maquinas, 0) maquinas,
           coalesce(s.custo, 0) custo,
           case when s.bruto_todos > 0 then coalesce(s.bruto_custo, 0) * nf.valor_total / s.bruto_todos else 0 end receita_custo
      from nf
      join lateral (
        select count(*) filter (where x.venda) itens_venda,
               sum(x.bruto) filter (where x.venda) bruto_venda,
               sum(x.bruto) bruto_todos,
               sum(x.qtd) filter (where x.venda and pr.tipo = 'maquina') maquinas,
               sum(x.qtd * pr.preco_custo) filter (where x.venda and pr.preco_custo > 0) custo,
               sum(x.bruto) filter (where x.venda and pr.preco_custo > 0) bruto_custo
          from nf_itens x left join produtos pr on pr.id = x.pid
         where x.nota = nf.id) s on true
      left join clientes c on c.id = nf.cliente_id
     where s.itens_venda > 0
  ),
  vendas_todas as (
    select 'p:' || p.id::text ref, p.dia, p.unidade_id, p.vendedor_id, p.uf, p.valor, p.maquinas, p.custo, p.receita_custo from ped p
    union all
    select 'n:' || n.id::text, n.dia, n.unidade_id, n.vendedor_id, n.uf, n.valor, n.maquinas, n.custo, n.receita_custo from nf_venda n
  ),
  -- devolução de venda: NF-e de entrada ligada à nota original (pela nota ou pela chave); só se a venda conta
  dev as (
    select v.ref, (d.created_at at time zone 'America/Sao_Paulo')::date dia, coalesce(d.valor_total, 0)::numeric valor
      from notas_fiscais d
      join notas_fiscais o on o.id = d.nota_referenciada_id
        or (d.nota_referenciada_id is null and nullif(btrim(coalesce(d.chave_referenciada, '')), '') is not null and o.chave = d.chave_referenciada)
      join vendas_todas v on v.ref = case when o.pedido_id is not null then 'p:' || o.pedido_id::text else 'n:' || o.id::text end
     where d.status = 'autorizada' and coalesce(d.ambiente, 'producao') <> 'homologacao' and d.excluida_em is null
       and d.finalidade = 'devolucao' and d.tipo_operacao = 'entrada'
  ),
  mov as (
    select v.dia, v.unidade_id, v.vendedor_id, v.uf, v.valor, 1 n, v.maquinas, v.custo, v.receita_custo, 0::numeric devolucao
      from vendas_todas v
    union all
    select d.dia, v.unidade_id, v.vendedor_id, v.uf, -d.valor, 0, 0, 0, 0, d.valor
      from dev d join vendas_todas v on v.ref = d.ref
  ),
  mov_f as (
    select date_trunc('month', m.dia)::date mes, m.dia, coalesce(m.vendedor_id::text, 'sem_vendedor') vend,
           coalesce(m.uf, '--') uf, coalesce(public.metas_regiao_da_uf(m.uf), '--') reg,
           m.valor, m.n, m.maquinas, m.custo, m.receita_custo, m.devolucao
      from mov m
     where m.dia between v_hist and v_fim
       and (p_unidade is null or m.unidade_id = p_unidade)
  ),
  agg as (
    select f.mes, 'empresa'::text tipo, 'empresa'::text chave, sum(f.valor) realizado, sum(f.n)::int vendas, sum(f.devolucao) devolucoes,
           sum(f.maquinas) maquinas, sum(f.custo) custo, sum(f.receita_custo) receita_custo, sum(f.valor) filter (where f.dia <= v_corte) parcial
      from mov_f f group by f.mes
    union all
    select f.mes, 'vendedor', f.vend, sum(f.valor), sum(f.n)::int, sum(f.devolucao), sum(f.maquinas), sum(f.custo), sum(f.receita_custo),
           sum(f.valor) filter (where f.dia <= v_corte)
      from mov_f f group by f.mes, f.vend
    union all
    select f.mes, 'regiao', 'UF:' || f.uf, sum(f.valor), sum(f.n)::int, sum(f.devolucao), sum(f.maquinas), sum(f.custo), sum(f.receita_custo),
           sum(f.valor) filter (where f.dia <= v_corte)
      from mov_f f group by f.mes, f.uf
    union all
    select f.mes, 'regiao', 'REG:' || f.reg, sum(f.valor), sum(f.n)::int, sum(f.devolucao), sum(f.maquinas), sum(f.custo), sum(f.receita_custo),
           sum(f.valor) filter (where f.dia <= v_corte)
      from mov_f f where f.reg <> '--' group by f.mes, f.reg
  ),
  -- metas cadastradas: da unidade escolhida ou, em todas, a de "todas" ou a soma das unidades
  mt as (
    select m.mes, m.tipo, case m.tipo when 'vendedor' then m.vendedor_id::text when 'regiao' then m.regiao else 'empresa' end chave,
           case when bool_or(m.unidade_id is null) then max(m.meta_valor) filter (where m.unidade_id is null) else sum(m.meta_valor) end meta,
           (case when bool_or(m.unidade_id is null) then max(m.meta_maquinas) filter (where m.unidade_id is null) else sum(m.meta_maquinas) end)::numeric meta_maquinas,
           case when bool_or(m.unidade_id is null) then max(m.meta_margem) filter (where m.unidade_id is null)
                else round(sum(m.meta_margem * m.meta_valor) filter (where m.meta_margem is not null)
                           / nullif(sum(m.meta_valor) filter (where m.meta_margem is not null), 0), 2) end meta_margem,
           case when bool_or(m.unidade_id is null) then max(m.observacao) filter (where m.unidade_id is null)
                else string_agg(m.observacao, ' · ') end observacao
      from metas_vendas m
     where m.ativo and m.mes between v_de and v_ate and (p_unidade is null or m.unidade_id = p_unidade)
     group by 1, 2, 3
  ),
  -- região sem meta própria: soma dos estados dela
  mt1 as (
    select x.mes, x.tipo, x.chave, x.meta, x.meta_maquinas, x.meta_margem, 'cadastrada'::text origem, x.observacao from mt x
    union all
    select u.mes, 'regiao', 'REG:' || public.metas_regiao_da_uf(substr(u.chave, 4)), sum(u.meta), sum(u.meta_maquinas), null::numeric,
           'soma_estados', null::text
      from mt u
     where u.tipo = 'regiao' and u.chave like 'UF:%'
       and not exists (select 1 from mt r where r.mes = u.mes and r.tipo = 'regiao' and r.chave = 'REG:' || public.metas_regiao_da_uf(substr(u.chave, 4)))
     group by u.mes, public.metas_regiao_da_uf(substr(u.chave, 4))
  ),
  -- empresa sem meta própria: soma dos vendedores ou, sem eles, das regiões
  mt_final as (
    select * from mt1
    union all
    select v.mes, 'empresa', 'empresa', sum(v.meta), sum(v.meta_maquinas), null::numeric, 'soma_vendedores', null::text
      from mt1 v
     where v.tipo = 'vendedor' and not exists (select 1 from mt1 e where e.mes = v.mes and e.tipo = 'empresa')
     group by v.mes
    union all
    select r.mes, 'empresa', 'empresa', sum(r.meta), sum(r.meta_maquinas), null::numeric, 'soma_regioes', null::text
      from mt1 r
     where r.tipo = 'regiao' and r.chave like 'REG:%'
       and not exists (select 1 from mt1 e where e.mes = r.mes and e.tipo = 'empresa')
       and not exists (select 1 from mt1 v where v.mes = r.mes and v.tipo = 'vendedor')
     group by r.mes
  ),
  meses as (
    select g::date mes,
           public.metas_dias_uteis(g::date, (g + interval '1 month' - interval '1 day')::date) du,
           case when g::date > v_hoje then 0
                else public.metas_dias_uteis(g::date, least((g + interval '1 month' - interval '1 day')::date, v_hoje)) end dp
      from generate_series(v_de::timestamp, v_ate::timestamp, interval '1 month') g
  ),
  chaves as (
    select x.mes, x.tipo, x.chave from mt_final x
    union
    select a.mes, a.tipo, a.chave from agg a where a.mes between v_de and v_ate
    union
    select (h.mes + interval '1 year')::date, h.tipo, h.chave from agg h where h.mes <= (v_ate - interval '1 year')::date
    union
    select ms.mes, 'empresa', 'empresa' from meses ms
    union
    select ms.mes, 'regiao', 'REG:' || r.nome from meses ms cross join unnest(array['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']) r(nome)
    union
    select ms.mes, 'vendedor', mv::text from meses ms cross join unnest(coalesce(v_meus, '{}'::uuid[])) mv
  ),
  linhas as (
    select k.mes, k.tipo, k.chave,
           case when k.tipo = 'vendedor' and k.chave <> 'sem_vendedor' then k.chave::uuid end vendedor_id,
           case when k.tipo = 'regiao' then k.chave end regiao,
           m.meta, m.meta_maquinas, m.meta_margem, m.origem, m.observacao,
           coalesce(a.realizado, 0) realizado, coalesce(a.vendas, 0) vendas, coalesce(a.devolucoes, 0) devolucoes,
           coalesce(a.maquinas, 0) maquinas, coalesce(a.custo, 0) custo, coalesce(a.receita_custo, 0) receita_custo,
           coalesce(h.realizado, 0) ano_anterior,
           case when k.mes = date_trunc('month', v_hoje)::date then coalesce(h.parcial, 0) else coalesce(h.realizado, 0) end ano_anterior_parcial,
           ms.du, ms.dp
      from chaves k
      join meses ms on ms.mes = k.mes
      left join mt_final m on m.mes = k.mes and m.tipo = k.tipo and m.chave = k.chave
      left join agg a on a.mes = k.mes and a.tipo = k.tipo and a.chave = k.chave
      left join agg h on h.mes = (k.mes - interval '1 year')::date and h.tipo = k.tipo and h.chave = k.chave
  )
  select l.mes, l.tipo, l.chave, l.vendedor_id, l.regiao,
         case l.tipo
           when 'empresa' then 'Empresa'
           when 'vendedor' then coalesce(vd.nome, 'Sem vendedor')
           else case when l.chave = 'UF:--' then 'Sem estado' when l.chave like 'UF:%' then substr(l.chave, 4) else substr(l.chave, 5) end
         end as nome_,
         round(l.meta, 2) as meta_, l.meta_maquinas, l.meta_margem, l.origem, l.observacao,
         round(l.realizado, 2) as realizado_, l.vendas, round(l.devolucoes, 2) as devolucoes_, l.maquinas,
         case when l.receita_custo > 0 then round((l.receita_custo - l.custo) / l.receita_custo * 100, 1) end as margem_pct_,
         round(l.receita_custo, 2) as margem_base_,
         case when l.meta > 0 then round(l.realizado / l.meta * 100, 1) end as pct_,
         l.du, l.dp,
         -- projeção: o ritmo dos dias úteis passados (até hoje) levado ao mês inteiro
         case when l.dp >= l.du then round(l.realizado, 2) when l.dp > 0 then round(l.realizado / l.dp * l.du, 2) end as projecao_,
         case when l.meta is not null then round(greatest(l.meta - l.realizado, 0), 2) end as falta_,
         -- quanto vender em cada dia útil que ainda falta (depois de hoje)
         case when l.meta is null then null
              when l.meta - l.realizado <= 0 then 0::numeric
              when l.du - l.dp > 0 then round((l.meta - l.realizado) / (l.du - l.dp), 2) end as falta_por_dia_,
         round(l.ano_anterior, 2) as ano_anterior_, round(l.ano_anterior_parcial, 2) as ano_anterior_parcial_,
         -- mês corrente: comparado com o mesmo período (até o mesmo dia) do ano anterior
         case when l.ano_anterior_parcial > 0 then round((l.realizado / l.ano_anterior_parcial - 1) * 100, 1) end as variacao_ano_
    from linhas l
    left join vendedores vd on l.tipo = 'vendedor' and vd.id = l.vendedor_id
   where (v_gerencia or (l.tipo = 'vendedor' and l.vendedor_id = any (coalesce(v_meus, '{}'::uuid[]))))
     -- estados e vendedores sem meta e sem venda (nem no ano anterior) não aparecem
     and (l.tipo = 'empresa' or l.chave like 'REG:%' or l.meta is not null or l.realizado <> 0 or l.ano_anterior <> 0
          or l.vendedor_id = any (coalesce(v_meus, '{}'::uuid[])))
   order by l.mes, case l.tipo when 'empresa' then 0 when 'vendedor' then 1 else 2 end, l.realizado desc, 6;
end $$;
revoke execute on function public.metas_apuracao(date, date, uuid) from public, anon;
grant execute on function public.metas_apuracao(date, date, uuid) to authenticated;
