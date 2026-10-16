-- =====================================================================
-- Nota de fornecedor completa (como no Tiny, e melhor) e perfil Compras
--   * nfe_custos_itens: o custo de entrada de cada item da nota (valor do
--     produto + frete, seguro e outras despesas rateados + IPI + ICMS-ST
--     − desconto − créditos que a MF aproveita), com a conta guardada.
--     O custo do produto passa a dizer de qual nota veio (histórico de
--     custos e histórico do produto).
--   * preço: o preço escolhido na tela vai para a aprovação que já existe
--     (preco_sugestoes) ou é aplicado já por quem aprova (decidir_precos).
--     A regra de margem continua a mesma (preco_sugerido / margem_alvo_produto).
--   * nfe_oc_vinculos e nfe_oc_baixas: a nota ligada a uma ou mais ordens
--     de compra e a baixa das quantidades recebidas (quantidade_recebida e
--     situação parcial/recebido). A mesma nota não dá baixa duas vezes na
--     mesma OC. A baixa pela nota não mexe no estoque: o estoque entra pela nota.
--   * confirmar_entrada_nota: estoque + custo + preço + baixa da OC numa
--     transação só (tudo ou nada).
--   * entrada_automatica_nota: a entrada automática (Edge Functions) grava
--     o custo completo, com a mesma conta da tela, e guarda a conta.
--   * Créditos (ICMS, IPI, PIS 1,65% e COFINS 7,6% no Lucro Real) são
--     calculados em supabase/functions/_shared/nota-custo.ts (tela e entrada
--     automática): estimativa gerencial, confirmar a regra com o contador.
--   * Perfil Compras (papel principal ou adicional): ordens de compra,
--     cotações, necessidades, notas de fornecedor (custo, preço para
--     aprovação, vínculo com a OC), fornecedores e estoque. Aplicar preço
--     direto continua só com quem aprova preços (financeiro/administrador).
--     No produto, o Compras muda só marcadores, mínimo/máximo, prazo de
--     reposição, compra mínima e fornecedor padrão (gatilho).
--   * O técnico (que compra peças) também liga nota e OC e dá baixa na OC
--     pela nota, sem ver o valor das notas.
--   * Tudo grava por funções com checagem de papel e deixa linha na auditoria.
-- Somente acréscimos: tabelas e colunas novas, funções novas, políticas novas
-- e funções existentes trocadas com create or replace (só o trecho do papel).
-- A única troca de regra é a das listas de papéis de usuarios_erp, no mesmo
-- padrão do perfil Marketplaces (já prevendo o papel representante).
-- Sem chave estrangeira nas tabelas novas (como nfe_recebida_itens): as
-- rotinas de limpeza das notas e das OCs continuam funcionando.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfil Compras: papel principal e adicional (a lista já leva o
-- representante, que outro trabalho cria, para um não apagar o outro)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'usuarios_erp_papel_check'
             and (pg_get_constraintdef(oid) not like '%compras%' or pg_get_constraintdef(oid) not like '%representante%')) then
    alter table public.usuarios_erp drop constraint usuarios_erp_papel_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usuarios_erp_papel_check') then
    alter table public.usuarios_erp add constraint usuarios_erp_papel_check
      check (papel in ('admin', 'vendas', 'financeiro', 'tecnico', 'contador', 'expedicao', 'marketplace', 'compras', 'representante'));
  end if;

  if exists (select 1 from pg_constraint where conname = 'usuarios_erp_papeis_extras_validos'
             and pg_get_constraintdef(oid) not like '%compras%') then
    alter table public.usuarios_erp drop constraint usuarios_erp_papeis_extras_validos;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usuarios_erp_papeis_extras_validos') then
    alter table public.usuarios_erp add constraint usuarios_erp_papeis_extras_validos
      check (papeis_extras <@ array['vendas', 'financeiro', 'tecnico', 'expedicao', 'marketplace', 'compras']::text[]);
  end if;

  -- obrigação do código em duas etapas (se existir): aceita os papéis novos
  if exists (select 1 from pg_constraint where conname = 'configuracoes_mfa_papeis_validos'
             and (pg_get_constraintdef(oid) not like '%compras%' or pg_get_constraintdef(oid) not like '%representante%')) then
    alter table public.configuracoes drop constraint configuracoes_mfa_papeis_validos;
    alter table public.configuracoes add constraint configuracoes_mfa_papeis_validos
      check (mfa_papeis <@ array['admin', 'vendas', 'financeiro', 'tecnico', 'contador', 'expedicao', 'marketplace', 'compras', 'representante']::text[]);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.nfe_custos_itens (
  id uuid primary key default gen_random_uuid(),
  nfe_id uuid not null,
  numero int not null,
  produto_id uuid,
  codigo text,
  descricao text,
  quantidade numeric,
  fator numeric not null default 1 check (fator > 0),
  quantidade_erp numeric,
  valor_produto numeric not null default 0,
  frete numeric not null default 0,
  seguro numeric not null default 0,
  outras numeric not null default 0,
  desconto numeric not null default 0,
  ipi numeric not null default 0,
  icms_st numeric not null default 0,
  extra numeric not null default 0,
  credito_icms numeric not null default 0,
  credito_ipi numeric not null default 0,
  credito_pis numeric not null default 0,
  credito_cofins numeric not null default 0,
  descontar_creditos boolean not null default true,
  finalidade text not null default 'revenda' check (finalidade in ('revenda', 'industrializacao', 'consumo')),
  custo_total numeric,
  custo_unitario numeric not null check (custo_unitario > 0),
  custo_anterior numeric,
  custo_aplicado boolean not null default false,
  preco_anterior numeric,
  preco_novo numeric,
  margem numeric,
  preco_modo text check (preco_modo in ('aprovacao', 'direto', 'nenhum')),
  preco_sugestao_id uuid,
  aplicado_por uuid default auth.uid(),
  aplicado_nome text,
  aplicado_em timestamptz not null default now(),
  unique (nfe_id, numero)
);
create index if not exists nfe_custos_itens_produto_idx on public.nfe_custos_itens (produto_id);

create table if not exists public.nfe_oc_vinculos (
  id uuid primary key default gen_random_uuid(),
  nfe_id uuid not null,
  pedido_compra_id uuid not null,
  ativo boolean not null default true,
  ligado_por uuid default auth.uid(),
  ligado_nome text,
  ligado_em timestamptz not null default now(),
  desligado_em timestamptz,
  baixado_em timestamptz,
  baixado_por uuid,
  baixado_nome text,
  unique (nfe_id, pedido_compra_id)
);
create index if not exists nfe_oc_vinculos_pedido_idx on public.nfe_oc_vinculos (pedido_compra_id) where ativo;

create table if not exists public.nfe_oc_baixas (
  id uuid primary key default gen_random_uuid(),
  nfe_id uuid not null,
  pedido_compra_id uuid not null,
  pedido_compra_item_id uuid not null,
  produto_id uuid,
  quantidade numeric(12,3) not null check (quantidade > 0),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  -- a mesma nota nunca baixa duas vezes o mesmo item da OC
  unique (nfe_id, pedido_compra_item_id)
);
create index if not exists nfe_oc_baixas_pedido_idx on public.nfe_oc_baixas (pedido_compra_id);

-- sugestão de preço que nasceu de uma nota de fornecedor
alter table public.preco_sugestoes add column if not exists nfe_id uuid;

-- leitura pelas telas; gravação só pelas funções abaixo
alter table public.nfe_custos_itens enable row level security;
alter table public.nfe_oc_vinculos enable row level security;
alter table public.nfe_oc_baixas enable row level security;
do $$ begin
  create policy nfe_custos_itens_select on public.nfe_custos_itens for select to authenticated using (public.tem_papel('financeiro', 'compras'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy nfe_oc_vinculos_select on public.nfe_oc_vinculos for select to authenticated using (public.tem_papel('financeiro', 'compras', 'tecnico'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy nfe_oc_baixas_select on public.nfe_oc_baixas for select to authenticated using (public.tem_papel('financeiro', 'compras', 'tecnico'));
exception when duplicate_object then null; end $$;
revoke all on public.nfe_custos_itens from anon, authenticated;
revoke all on public.nfe_oc_vinculos from anon, authenticated;
revoke all on public.nfe_oc_baixas from anon, authenticated;
grant select on public.nfe_custos_itens to authenticated;
grant select on public.nfe_oc_vinculos to authenticated;
grant select on public.nfe_oc_baixas to authenticated;

-- ---------------------------------------------------------------------
-- Apoio
-- ---------------------------------------------------------------------
-- número de um campo do JSON (texto vazio ou inválido = nulo)
create or replace function public.nf_num(p jsonb, k text)
returns numeric language plpgsql immutable set search_path = public as $$
begin
  return nullif(btrim(coalesce(p->>k, '')), '')::numeric;
exception when others then
  return null;
end $$;

-- linha no histórico (auditoria) de uma ação feita pelas funções desta tela
create or replace function public.nf_auditar(p_tabela text, p_registro uuid, p_campo text, p_texto text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria (tabela, registro_id, acao, usuario, usuario_nome, campos, antes, depois, motivo, origem)
  values (p_tabela, p_registro::text, 'update', auth.uid(), (select nome from public.usuarios_erp where user_id = auth.uid()),
          array[p_campo], null, jsonb_build_object(p_campo, left(coalesce(p_texto, ''), 500)), p_motivo, 'usuario');
end $$;

-- "NF 1234 · Fornecedor"
create or replace function public.nf_rotulo(p_nfe uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'NF ' || coalesce(nullif(ltrim(substr(n.chave, 26, 9), '0'), ''), '?') || ' · ' || coalesce(nullif(btrim(n.emitente_nome), ''), 'fornecedor')
    from public.nfe_recebidas n where n.id = p_nfe;
$$;

-- Fornecedores da mesma "família": o próprio cadastro, o mesmo CNPJ, a mesma raiz de CNPJ (filial), a mesma marca
-- (matriz) e o cadastro repetido já unificado. Serve para achar as OC de uma nota e as notas de uma OC.
create or replace function public.nf_fornecedores_familia(p_fornecedor uuid, p_cnpj text)
returns setof uuid language sql stable security definer set search_path = public as $$
  with doc as (select regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g') as c),
       base as (select f.id, f.matriz_id, f.unificado_em from public.fornecedores f where f.id = p_fornecedor)
  select f.id
    from public.fornecedores f, doc
   where f.id = p_fornecedor
      or (doc.c <> '' and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = doc.c)
      or (length(doc.c) = 14 and length(regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g')) = 14
          and left(regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g'), 8) = left(doc.c, 8))
      or exists (select 1 from base b
                  where f.matriz_id = b.id or f.id = b.matriz_id or (b.matriz_id is not null and f.matriz_id = b.matriz_id)
                     or f.unificado_em = b.id or f.id = b.unificado_em);
$$;

-- ---------------------------------------------------------------------
-- Núcleo: custo e preço pela nota
-- p_itens: [{ numero, codigo, descricao, produto_id, quantidade, fator, quantidade_erp, valor_produto, frete, seguro,
--             outras, desconto, ipi, icms_st, extra, credito_icms, credito_ipi, credito_pis, credito_cofins,
--             custo_total, custo_unitario, atualizar_custo, preco_novo, margem }]
-- p_opcoes: { finalidade, descontar_creditos, modo_preco: aprovacao | direto | nenhum }
-- ---------------------------------------------------------------------
create or replace function public.nf_custos_core(p_nfe uuid, p_itens jsonb, p_opcoes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nfe public.nfe_recebidas;
  v jsonb;
  p public.produtos;
  v_prod uuid; v_num int; v_fator numeric; v_custo numeric; v_ant numeric; v_preco numeric; v_margem numeric; v_sug uuid;
  v_atualizar boolean;
  v_modo text := coalesce(nullif(p_opcoes->>'modo_preco', ''), 'aprovacao');
  v_fin text := coalesce(nullif(p_opcoes->>'finalidade', ''), 'revenda');
  v_desc boolean := coalesce((p_opcoes->>'descontar_creditos')::boolean, true);
  v_nome text := (select nome from public.usuarios_erp where user_id = auth.uid());
  v_rotulo text;
  n_itens int := 0; n_custos int := 0; n_aprovar int := 0; n_aprovados int := 0;
begin
  if v_modo not in ('aprovacao', 'direto', 'nenhum') then raise exception 'escolha o que fazer com o preço: mandar para aprovação, aplicar já ou só o custo'; end if;
  if v_fin not in ('revenda', 'industrializacao', 'consumo') then raise exception 'finalidade da compra inválida'; end if;
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then raise exception 'lista de itens inválida'; end if;
  select * into v_nfe from public.nfe_recebidas where id = p_nfe;
  if not found or v_nfe.excluida_em is not null then raise exception 'nota não encontrada'; end if;
  if v_nfe.situacao = 'cancelada' then raise exception 'nota cancelada: o custo não muda por ela'; end if;
  v_rotulo := public.nf_rotulo(p_nfe);

  for v in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_prod := nullif(v->>'produto_id', '')::uuid;
    continue when v_prod is null;
    v_sug := null;
    v_num := public.nf_num(v, 'numero')::int;
    if v_num is null then raise exception 'item da nota sem número'; end if;
    select * into p from public.produtos where id = v_prod for update;
    if not found or p.unificado_em is not null then
      raise exception 'produto não encontrado para o item "%"', coalesce(v->>'descricao', v->>'codigo', v_num::text);
    end if;
    v_fator := coalesce(public.nf_num(v, 'fator'), 1);
    v_custo := public.nf_num(v, 'custo_unitario');
    v_preco := round(public.nf_num(v, 'preco_novo'), 2);
    v_margem := public.nf_num(v, 'margem');
    v_atualizar := coalesce((v->>'atualizar_custo')::boolean, true);
    if v_fator <= 0 then raise exception 'fator de conversão inválido em "%"', p.descricao; end if;
    if v_custo is null or v_custo <= 0 or v_custo >= 1e9 then raise exception 'custo inválido em "%"', p.descricao; end if;
    if v_preco is not null and (v_preco <= 0 or v_preco >= 1e9) then raise exception 'preço inválido em "%"', p.descricao; end if;
    if v_margem is not null and (v_margem <= -1000 or v_margem >= 100) then raise exception 'margem inválida em "%"', p.descricao; end if;
    v_ant := p.preco_custo;

    insert into public.nfe_custos_itens (
      nfe_id, numero, produto_id, codigo, descricao, quantidade, fator, quantidade_erp, valor_produto, frete, seguro, outras, desconto,
      ipi, icms_st, extra, credito_icms, credito_ipi, credito_pis, credito_cofins, descontar_creditos, finalidade, custo_total,
      custo_unitario, custo_anterior, custo_aplicado, preco_anterior, preco_novo, margem, preco_modo, aplicado_por, aplicado_nome, aplicado_em)
    values (
      p_nfe, v_num, v_prod, left(v->>'codigo', 60), left(v->>'descricao', 300), public.nf_num(v, 'quantidade'), v_fator,
      public.nf_num(v, 'quantidade_erp'), coalesce(public.nf_num(v, 'valor_produto'), 0), coalesce(public.nf_num(v, 'frete'), 0),
      coalesce(public.nf_num(v, 'seguro'), 0), coalesce(public.nf_num(v, 'outras'), 0), coalesce(public.nf_num(v, 'desconto'), 0),
      coalesce(public.nf_num(v, 'ipi'), 0), coalesce(public.nf_num(v, 'icms_st'), 0), coalesce(public.nf_num(v, 'extra'), 0),
      coalesce(public.nf_num(v, 'credito_icms'), 0), coalesce(public.nf_num(v, 'credito_ipi'), 0), coalesce(public.nf_num(v, 'credito_pis'), 0),
      coalesce(public.nf_num(v, 'credito_cofins'), 0), v_desc, v_fin, public.nf_num(v, 'custo_total'), round(v_custo, 4), v_ant,
      false, p.preco_venda, v_preco, v_margem, v_modo, auth.uid(), v_nome, now())
    on conflict (nfe_id, numero) do update set
      produto_id = excluded.produto_id, codigo = excluded.codigo, descricao = excluded.descricao, quantidade = excluded.quantidade,
      fator = excluded.fator, quantidade_erp = excluded.quantidade_erp, valor_produto = excluded.valor_produto, frete = excluded.frete,
      seguro = excluded.seguro, outras = excluded.outras, desconto = excluded.desconto, ipi = excluded.ipi, icms_st = excluded.icms_st,
      extra = excluded.extra, credito_icms = excluded.credito_icms, credito_ipi = excluded.credito_ipi, credito_pis = excluded.credito_pis,
      credito_cofins = excluded.credito_cofins, descontar_creditos = excluded.descontar_creditos, finalidade = excluded.finalidade,
      custo_total = excluded.custo_total, custo_unitario = excluded.custo_unitario, custo_anterior = excluded.custo_anterior,
      preco_anterior = excluded.preco_anterior, preco_novo = excluded.preco_novo, margem = excluded.margem, preco_modo = excluded.preco_modo,
      aplicado_por = excluded.aplicado_por, aplicado_nome = excluded.aplicado_nome, aplicado_em = excluded.aplicado_em;

    -- custo do produto: o histórico (auditoria) guarda de qual nota veio; a formação de preço confere a margem sozinha
    if v_atualizar then
      if round(v_custo, 2) <= 0 then raise exception 'o custo de "%" fica abaixo de 1 centavo: confira o fator de conversão', p.descricao; end if;
      if round(v_custo, 2) is distinct from p.preco_custo then
        update public.produtos
           set preco_custo = round(v_custo, 2),
               motivo_alteracao = left(format('Custo pela %s (%s)', v_rotulo,
                 case when v_desc then 'custo líquido, sem os créditos de impostos' else 'custo cheio, com os impostos' end), 500)
         where id = v_prod;
      end if;
      n_custos := n_custos + 1;
    end if;

    if v_modo <> 'nenhum' and v_preco is not null then
      -- o preço escolhido na tela substitui a sugestão automática (a mesma fila de aprovação de Produtos → Preços)
      select * into p from public.produtos where id = v_prod;
      update public.preco_sugestoes set status = 'substituida', decidido_em = now() where produto_id = v_prod and status = 'pendente';
      insert into public.preco_sugestoes (produto_id, origem, custo_anterior, custo_novo, preco_atual, preco_sugerido, margem_alvo, nfe_id)
      values (v_prod, 'custo', case when v_atualizar and v_ant is distinct from p.preco_custo then v_ant end, p.preco_custo,
              coalesce(p.preco_venda, 0), v_preco, round(coalesce(v_margem, public.margem_alvo_produto(p)), 2), p_nfe)
      returning id into v_sug;
      if v_modo = 'direto' then
        -- mesma regra da tela de aprovação: só o financeiro ou o administrador
        perform public.decidir_precos(array[v_sug], true, array[v_preco]);
        n_aprovados := n_aprovados + 1;
      else
        n_aprovar := n_aprovar + 1;
      end if;
    else
      -- sem preço escolhido: a sugestão que a formação de preço criou (se o preço saiu da faixa) passa a citar a nota
      update public.preco_sugestoes set nfe_id = p_nfe
       where produto_id = v_prod and status = 'pendente' and nfe_id is null
      returning id into v_sug;
    end if;

    update public.nfe_custos_itens
       set custo_aplicado = custo_aplicado or v_atualizar, preco_sugestao_id = coalesce(v_sug, preco_sugestao_id)
     where nfe_id = p_nfe and numero = v_num;
    n_itens := n_itens + 1;
  end loop;

  if n_aprovar > 0 then
    begin
      if not exists (select 1 from public.notificacoes where titulo = 'Preços para revisar' and created_at > now() - interval '10 minutes') then
        perform public.notificar('outro', 'Preços para revisar',
          'Preços novos pela nota de fornecedor esperam aprovação.', '/estoque?aba=precos', array['financeiro']);
      end if;
    exception when others then
      raise warning 'aviso de preços: %', sqlerrm;
    end;
  end if;
  return jsonb_build_object('itens', n_itens, 'custos', n_custos, 'para_aprovar', n_aprovar, 'aprovados', n_aprovados);
end $$;

-- ---------------------------------------------------------------------
-- Núcleo: baixa das quantidades recebidas na ordem de compra
-- p_baixas: [{ item_id, quantidade }] (quantidade na unidade do ERP)
-- Não mexe no estoque (o estoque entra pela nota). Não deixa a mesma nota
-- receber duas vezes na mesma OC nem passar do que falta receber.
-- ---------------------------------------------------------------------
create or replace function public.nf_baixa_oc_core(p_nfe uuid, p_baixas jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  it public.pedido_compra_itens;
  pc public.pedidos_compra;
  lig public.nfe_oc_vinculos;
  v_q numeric;
  v_ocs uuid[] := '{}';
  v_oc uuid;
  v_status text;
  v_num bigint;
  v_rotulo text := public.nf_rotulo(p_nfe);
  v_nome text := (select nome from public.usuarios_erp where user_id = auth.uid());
  n int := 0;
begin
  if jsonb_typeof(coalesce(p_baixas, '[]'::jsonb)) <> 'array' then raise exception 'lista de baixas inválida'; end if;
  for v in select * from jsonb_array_elements(coalesce(p_baixas, '[]'::jsonb)) loop
    v_q := round(coalesce(public.nf_num(v, 'quantidade'), 0), 3);
    continue when v_q <= 0;
    select * into it from public.pedido_compra_itens where id = nullif(v->>'item_id', '')::uuid for update;
    if not found then raise exception 'item da ordem de compra não encontrado'; end if;
    select * into pc from public.pedidos_compra where id = it.pedido_compra_id for update;
    select * into lig from public.nfe_oc_vinculos where nfe_id = p_nfe and pedido_compra_id = pc.id and ativo;
    if not found then raise exception 'ligue a nota à ordem de compra #% antes de dar baixa', pc.numero; end if;
    if lig.baixado_em is not null then
      raise exception 'esta nota já foi recebida na ordem de compra #%', pc.numero;
    end if;
    if pc.excluida_em is not null or pc.status not in ('enviado', 'parcial') then
      raise exception 'a ordem de compra #% não está aberta para receber (situação: %)', pc.numero, pc.status;
    end if;
    if exists (select 1 from public.nfe_oc_baixas where nfe_id = p_nfe and pedido_compra_item_id = it.id) then
      raise exception 'esta nota já deu baixa em "%" na ordem de compra #%', it.descricao, pc.numero;
    end if;
    if it.quantidade_recebida + v_q > it.quantidade + 0.0005 then
      raise exception 'a baixa de "%" passa do que falta receber na ordem #% (faltam %)', it.descricao, pc.numero,
        trim_scale(greatest(it.quantidade - it.quantidade_recebida, 0));
    end if;
    update public.pedido_compra_itens set quantidade_recebida = quantidade_recebida + v_q where id = it.id;
    insert into public.nfe_oc_baixas (nfe_id, pedido_compra_id, pedido_compra_item_id, produto_id, quantidade)
    values (p_nfe, pc.id, it.id, it.produto_id, v_q);
    if not (pc.id = any (v_ocs)) then v_ocs := v_ocs || pc.id; end if;
    n := n + 1;
  end loop;

  foreach v_oc in array v_ocs loop
    v_status := case when exists (select 1 from public.pedido_compra_itens where pedido_compra_id = v_oc and quantidade_recebida < quantidade)
                     then 'parcial' else 'recebido' end;
    update public.pedidos_compra
       set status = v_status, recebido_em = case when v_status = 'recebido' then now() else recebido_em end
     where id = v_oc
    returning numero into v_num;
    update public.nfe_oc_vinculos set baixado_em = now(), baixado_por = auth.uid(), baixado_nome = v_nome
     where nfe_id = p_nfe and pedido_compra_id = v_oc;
    perform public.nf_auditar('pedidos_compra', v_oc, 'recebido_pela_nota',
      format('%s: %s', v_rotulo, case when v_status = 'recebido' then 'ordem recebida por completo' else 'recebida em parte' end));
    perform public.nf_auditar('nfe_recebidas', p_nfe, 'recebido_pela_nota', format('baixa na ordem de compra #%s (%s)', v_num,
      case when v_status = 'recebido' then 'recebida por completo' else 'recebida em parte' end));
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Funções chamadas pela tela
-- ---------------------------------------------------------------------

-- Atualiza o custo (e manda o preço para aprovação ou aplica já) dos itens marcados. Serve também para nota
-- que já entrou no estoque (ex.: a entrada automática, que usa só o valor unitário).
create or replace function public.aplicar_custos_nota(p_nfe uuid, p_itens jsonb, p_opcoes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r jsonb;
begin
  -- financeiro e compras (aplicar preço direto: decidir_precos ainda exige quem aprova preços)
  perform public.exigir_papel('financeiro', 'compras');
  perform set_config('erp.acao_usuario', 'on', true);
  perform 1 from public.nfe_recebidas where id = p_nfe for update;
  v_r := public.nf_custos_core(p_nfe, p_itens, p_opcoes);
  if (v_r->>'itens')::int = 0 then raise exception 'nenhum item ligado a produto'; end if;
  perform public.nf_auditar('nfe_recebidas', p_nfe, 'custos_nota',
    format('%s item(ns): %s custo(s) atualizado(s), %s preço(s) para aprovar, %s preço(s) aplicado(s)',
      v_r->>'itens', v_r->>'custos', v_r->>'para_aprovar', v_r->>'aprovados'));
  return v_r;
end $$;

-- Liga (ou desliga) a nota a uma ordem de compra. Desligar só antes da baixa.
create or replace function public.ligar_nota_oc(p_nfe uuid, p_pedido uuid, p_ligar boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_nfe public.nfe_recebidas;
  pc public.pedidos_compra;
  lig public.nfe_oc_vinculos;
  v_nome text := (select nome from public.usuarios_erp where user_id = auth.uid());
begin
  -- o técnico, que compra peças, também liga (pela OC)
  perform public.exigir_papel('financeiro', 'compras', 'tecnico');
  perform set_config('erp.acao_usuario', 'on', true);
  select * into v_nfe from public.nfe_recebidas where id = p_nfe;
  if not found or v_nfe.excluida_em is not null then raise exception 'nota não encontrada'; end if;
  select * into pc from public.pedidos_compra where id = p_pedido for update;
  if not found or pc.excluida_em is not null then raise exception 'ordem de compra não encontrada'; end if;
  select * into lig from public.nfe_oc_vinculos where nfe_id = p_nfe and pedido_compra_id = p_pedido;

  if coalesce(p_ligar, true) then
    if v_nfe.situacao = 'cancelada' then raise exception 'nota cancelada não se liga a ordem de compra'; end if;
    if pc.status not in ('enviado', 'parcial', 'recebido') then
      raise exception 'só ordem de compra confirmada com o fornecedor (a #% está %)', pc.numero,
        case pc.status when 'cotacao' then 'em cotação' when 'cancelado' then 'cancelada' else pc.status end;
    end if;
    if lig.id is not null and lig.ativo then return; end if;
    insert into public.nfe_oc_vinculos (nfe_id, pedido_compra_id, ativo, ligado_por, ligado_nome, ligado_em, desligado_em)
    values (p_nfe, p_pedido, true, auth.uid(), v_nome, now(), null)
    on conflict (nfe_id, pedido_compra_id) do update
      set ativo = true, ligado_por = excluded.ligado_por, ligado_nome = excluded.ligado_nome, ligado_em = now(), desligado_em = null;
    perform public.nf_auditar('nfe_recebidas', p_nfe, 'oc_ligada', format('ordem de compra #%s', pc.numero));
    perform public.nf_auditar('pedidos_compra', p_pedido, 'oc_ligada', public.nf_rotulo(p_nfe));
  else
    if lig.id is null or not lig.ativo then return; end if;
    if lig.baixado_em is not null then
      raise exception 'a nota já deu baixa na ordem de compra #%: não dá para desligar', pc.numero;
    end if;
    update public.nfe_oc_vinculos set ativo = false, desligado_em = now() where id = lig.id;
    perform public.nf_auditar('nfe_recebidas', p_nfe, 'oc_desligada', format('ordem de compra #%s', pc.numero));
    perform public.nf_auditar('pedidos_compra', p_pedido, 'oc_desligada', public.nf_rotulo(p_nfe));
  end if;
end $$;

-- Baixa na OC de uma nota que já entrou no estoque (ex.: pela entrada automática).
create or replace function public.baixar_oc_pela_nota(p_nfe uuid, p_baixas jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_nfe public.nfe_recebidas; n int;
begin
  perform public.exigir_papel('financeiro', 'compras', 'tecnico');
  perform set_config('erp.acao_usuario', 'on', true);
  select * into v_nfe from public.nfe_recebidas where id = p_nfe for update;
  if not found or v_nfe.excluida_em is not null then raise exception 'nota não encontrada'; end if;
  if v_nfe.situacao = 'cancelada' then raise exception 'nota cancelada'; end if;
  if not v_nfe.estoque_lancado then
    raise exception 'dê entrada no estoque pela nota (aba Itens e custos): a baixa da ordem de compra vai junto';
  end if;
  n := public.nf_baixa_oc_core(p_nfe, p_baixas);
  if n = 0 then raise exception 'nada para baixar'; end if;
  return n;
end $$;

-- Entrada completa: estoque (com o vínculo item → produto e o fator), custo e preço dos itens marcados e baixa
-- nas ordens de compra ligadas. Tudo ou nada.
-- p_itens: como em lancar_estoque_nfe ({ codigo, descricao, produto_id, quantidade, valor_unitario, fator });
-- p_custos e p_opcoes: como em aplicar_custos_nota; p_baixas: como em baixar_oc_pela_nota.
create or replace function public.confirmar_entrada_nota(p_nfe uuid, p_itens jsonb, p_custos jsonb default '[]'::jsonb,
  p_opcoes jsonb default '{}'::jsonb, p_baixas jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nfe public.nfe_recebidas;
  v_itens jsonb;
  v_n int;
  v_c jsonb := '{}'::jsonb;
  v_b int := 0;
begin
  perform public.exigir_papel('financeiro', 'compras');
  perform set_config('erp.acao_usuario', 'on', true);
  select * into v_nfe from public.nfe_recebidas where id = p_nfe for update;
  if not found or v_nfe.excluida_em is not null then raise exception 'nota não encontrada'; end if;
  if v_nfe.estoque_lancado then raise exception 'o estoque desta nota já foi lançado'; end if;
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then raise exception 'lista de itens inválida'; end if;
  -- o custo vai pela conta completa (p_custos), não pelo valor unitário da nota
  select coalesce(jsonb_agg(e || jsonb_build_object('atualizar_custo', false)), '[]'::jsonb) into v_itens
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;
  v_n := public.lancar_estoque_nfe_core(p_nfe, v_itens);
  if jsonb_array_length(coalesce(p_custos, '[]'::jsonb)) > 0 then
    v_c := public.nf_custos_core(p_nfe, p_custos, p_opcoes);
  end if;
  if jsonb_array_length(coalesce(p_baixas, '[]'::jsonb)) > 0 then
    v_b := public.nf_baixa_oc_core(p_nfe, p_baixas);
  end if;
  perform public.nf_auditar('nfe_recebidas', p_nfe, 'entrada_nota',
    format('%s item(ns) no estoque, %s custo(s) atualizado(s), %s item(ns) baixado(s) em ordem de compra',
      v_n, coalesce(v_c->>'custos', '0'), v_b));
  return jsonb_build_object('itens', v_n, 'baixas', v_b, 'custos', coalesce((v_c->>'custos')::int, 0),
    'para_aprovar', coalesce((v_c->>'para_aprovar')::int, 0), 'aprovados', coalesce((v_c->>'aprovados')::int, 0));
end $$;

-- Ordens de compra para a nota: as já ligadas e as abertas (enviado/parcial) do mesmo fornecedor — mesmo cadastro,
-- mesmo CNPJ, mesma raiz de CNPJ (filial), mesma marca (matriz) ou cadastro repetido unificado — com os itens.
create or replace function public.ocs_para_nota(p_nfe uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_nfe public.nfe_recebidas;
  v_r jsonb;
begin
  if not public.tem_papel('financeiro', 'compras', 'tecnico') then raise exception 'sem permissão'; end if;
  select * into v_nfe from public.nfe_recebidas where id = p_nfe;
  if not found then return '[]'::jsonb; end if;
  with fam as (
    select x as id from public.nf_fornecedores_familia(v_nfe.fornecedor_id, v_nfe.emitente_cnpj) x
  ), ocs as (
    select pc.id, pc.numero, pc.status, pc.created_at, pc.previsao_entrega, pc.valor_total, pc.fornecedor_id,
           coalesce(l.ativo, false) as ligada, case when l.ativo then l.baixado_em end as baixado_em
      from public.pedidos_compra pc
      left join public.nfe_oc_vinculos l on l.pedido_compra_id = pc.id and l.nfe_id = p_nfe
     where pc.excluida_em is null
       and (coalesce(l.ativo, false) or (pc.status in ('enviado', 'parcial') and pc.fornecedor_id in (select id from fam)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'numero', o.numero, 'status', o.status, 'created_at', o.created_at, 'previsao_entrega', o.previsao_entrega,
           'valor_total', o.valor_total, 'ligada', o.ligada, 'baixado_em', o.baixado_em,
           'mesmo_fornecedor', o.fornecedor_id in (select id from fam),
           'fornecedor', (select coalesce(nullif(btrim(f.nome_fantasia), ''), f.nome) from public.fornecedores f where f.id = o.fornecedor_id),
           'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'produto_id', i.produto_id, 'descricao', i.descricao,
                                'quantidade', i.quantidade, 'quantidade_recebida', i.quantidade_recebida, 'custo_unitario', i.custo_unitario)
                                order by i.descricao)
                               from public.pedido_compra_itens i where i.pedido_compra_id = o.id), '[]'::jsonb)
         ) order by o.numero), '[]'::jsonb)
    into v_r
    from ocs o;
  return v_r;
end $$;

-- Notas de fornecedor para uma ordem de compra (vistas da OC): as já ligadas e as do mesmo fornecedor desde 30 dias
-- antes do pedido, com os itens ligados ao produto (pelo custo gravado da nota, pelo código do fornecedor ou pelo
-- código de barras) e o fator. O técnico, que compra peças, liga e dá baixa sem ver o valor das notas.
create or replace function public.notas_para_oc(p_pedido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pc public.pedidos_compra;
  v_cnpj text;
  v_precos boolean := public.tem_papel('financeiro', 'compras');
  v_r jsonb;
begin
  if not public.tem_papel('financeiro', 'compras', 'tecnico') then raise exception 'sem permissão'; end if;
  select * into pc from public.pedidos_compra where id = p_pedido;
  if not found then return '[]'::jsonb; end if;
  select f.cnpj into v_cnpj from public.fornecedores f where f.id = pc.fornecedor_id;
  v_cnpj := regexp_replace(coalesce(v_cnpj, ''), '\D', '', 'g');
  with fam as (
    select x as id from public.nf_fornecedores_familia(pc.fornecedor_id, v_cnpj) x
  ), notas as (
    select n.id, n.chave, n.emitente_nome, n.data_emissao, n.valor_total, n.estoque_lancado, n.fornecedor_id,
           coalesce(l.ativo, false) as ligada, case when l.ativo then l.baixado_em end as baixado_em
      from public.nfe_recebidas n
      left join public.nfe_oc_vinculos l on l.nfe_id = n.id and l.pedido_compra_id = p_pedido
     where n.excluida_em is null
       and (coalesce(l.ativo, false)
            or (n.situacao <> 'cancelada' and coalesce(n.finalidade, 'normal') <> 'devolucao'
                and n.data_emissao >= coalesce(pc.enviado_em, pc.created_at) - interval '30 days'
                and (n.fornecedor_id in (select id from fam)
                     or (v_cnpj <> '' and regexp_replace(coalesce(n.emitente_cnpj, ''), '\D', '', 'g') = v_cnpj))))
     order by coalesce(l.ativo, false) desc, n.data_emissao desc
     limit 40
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', nt.id, 'numero', ltrim(substr(nt.chave, 26, 9), '0'), 'emitente', nt.emitente_nome, 'data_emissao', nt.data_emissao,
           'valor_total', case when v_precos then nt.valor_total end, 'estoque_lancado', nt.estoque_lancado,
           'ligada', nt.ligada, 'baixado_em', nt.baixado_em,
           'itens', coalesce((select jsonb_agg(jsonb_build_object(
                        'numero', i.numero, 'codigo', i.codigo, 'descricao', i.descricao, 'unidade', i.unidade, 'quantidade', i.quantidade,
                        'valor_unitario', case when v_precos then i.valor_unitario end,
                        'produto_id', coalesce(ci.produto_id, pf.produto_id, pe.id),
                        'fator', coalesce(ci.fator, pf.fator_conversao, 1)) order by i.numero)
                       from public.nfe_recebida_itens i
                       left join public.nfe_custos_itens ci on ci.nfe_id = i.nfe_id and ci.numero = i.numero
                       left join public.produto_fornecedor pf on pf.fornecedor_id = nt.fornecedor_id and pf.codigo_fornecedor = btrim(i.codigo)
                       left join lateral (select p.id from public.produtos p
                                           where i.ean is not null and p.codigo_barras = i.ean and p.ativo and p.unificado_em is null
                                           limit 1) pe on true
                      where i.nfe_id = nt.id), '[]'::jsonb)
         ) order by nt.ligada desc, nt.data_emissao desc), '[]'::jsonb)
    into v_r
    from notas nt;
  return v_r;
end $$;

-- ---------------------------------------------------------------------
-- Entrada automática (Edge Functions nfe-processar, focus-webhook e
-- nfe-recebidas-sync, com a chave de serviço): estoque + custo completo
-- pela nota (conta em _shared/nota-custo.ts), tudo ou nada. O preço segue
-- a formação de preço de sempre (sugestão quando sai da faixa).
-- ---------------------------------------------------------------------
create or replace function public.entrada_automatica_nota(p_nfe uuid, p_itens jsonb, p_custos jsonb default '[]'::jsonb,
  p_opcoes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_itens jsonb;
  v_n int;
  v_c jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then raise exception 'lista de itens inválida'; end if;
  -- o custo vai pela conta completa (p_custos), não pelo valor unitário da nota
  select coalesce(jsonb_agg(e || jsonb_build_object('atualizar_custo', false)), '[]'::jsonb) into v_itens
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;
  v_n := public.lancar_estoque_nfe_core(p_nfe, v_itens);
  if jsonb_typeof(p_custos) = 'array' and jsonb_array_length(p_custos) > 0 then
    v_c := public.nf_custos_core(p_nfe, p_custos, coalesce(p_opcoes, '{}'::jsonb) || jsonb_build_object('modo_preco', 'nenhum'));
  end if;
  return jsonb_build_object('itens', v_n, 'custos', coalesce((v_c->>'custos')::int, 0));
end $$;

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
revoke execute on function public.nf_num(jsonb, text) from public, anon;
grant execute on function public.nf_num(jsonb, text) to authenticated;
revoke execute on function public.nf_auditar(text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.nf_rotulo(uuid) from public, anon, authenticated;
revoke execute on function public.nf_custos_core(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.nf_baixa_oc_core(uuid, jsonb) from public, anon, authenticated;

revoke execute on function public.aplicar_custos_nota(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.ligar_nota_oc(uuid, uuid, boolean) from public, anon;
revoke execute on function public.baixar_oc_pela_nota(uuid, jsonb) from public, anon;
revoke execute on function public.confirmar_entrada_nota(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.ocs_para_nota(uuid) from public, anon;
revoke execute on function public.notas_para_oc(uuid) from public, anon;
revoke execute on function public.nf_fornecedores_familia(uuid, text) from public, anon, authenticated;
revoke execute on function public.entrada_automatica_nota(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.entrada_automatica_nota(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.aplicar_custos_nota(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.ligar_nota_oc(uuid, uuid, boolean) to authenticated;
grant execute on function public.baixar_oc_pela_nota(uuid, jsonb) to authenticated;
grant execute on function public.confirmar_entrada_nota(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.ocs_para_nota(uuid) to authenticated;
grant execute on function public.notas_para_oc(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Perfil Compras: acesso de compra igual ao do financeiro e do técnico
-- (políticas novas; as de hoje ficam como estão)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  -- ler, incluir e alterar: ordens de compra, cotações, fornecedores do produto e o código do fornecedor
  foreach t in array array['pedidos_compra', 'pedido_compra_itens', 'cotacoes', 'cotacao_fornecedores', 'cotacao_itens',
                           'cotacao_respostas', 'fornecimentos', 'produto_fornecedor'] loop
    continue when to_regclass('public.' || t) is null;
    begin
      execute format('create policy compras_select on public.%I for select to authenticated using (public.tem_papel(''compras''))', t);
    exception when duplicate_object then null; end;
    begin
      execute format('create policy compras_insert on public.%I for insert to authenticated with check (public.tem_papel(''compras''))', t);
    exception when duplicate_object then null; end;
    begin
      execute format('create policy compras_update on public.%I for update to authenticated using (public.tem_papel(''compras'')) with check (public.tem_papel(''compras''))', t);
    exception when duplicate_object then null; end;
  end loop;

  -- cadastros que o Compras mantém: fornecedores e marcadores; produto novo pela nota ou pela conferência dos itens
  foreach t in array array['fornecedores', 'marcadores', 'produtos'] loop
    continue when to_regclass('public.' || t) is null;
    begin
      execute format('create policy compras_insert on public.%I for insert to authenticated with check (public.tem_papel(''compras''))', t);
    exception when duplicate_object then null; end;
    begin
      execute format('create policy compras_update on public.%I for update to authenticated using (public.tem_papel(''compras'')) with check (public.tem_papel(''compras''))', t);
    exception when duplicate_object then null; end;
  end loop;

  -- só leitura: notas de fornecedor (os itens seguem a nota), sugestões de preço e o que entra na conta das
  -- necessidades de compra (vendas aprovadas e OS abertas)
  foreach t in array array['nfe_recebidas', 'preco_sugestoes', 'pedidos', 'pedido_itens', 'ordens_servico', 'os_itens'] loop
    continue when to_regclass('public.' || t) is null;
    begin
      execute format('create policy compras_select on public.%I for select to authenticated using (public.tem_papel(''compras''))', t);
    exception when duplicate_object then null; end;
  end loop;

  -- histórico de alterações (auditoria) das telas do Compras: notas de fornecedor, OC, fornecedores e produtos
  begin
    create policy compras_select on public.auditoria for select to authenticated
      using (public.tem_papel('compras') and tabela in ('nfe_recebidas', 'pedidos_compra', 'fornecedores', 'produtos'));
  exception when duplicate_object then null; end;
end $$;

-- No produto, quem é só do Compras muda marcadores, estoque mínimo e máximo, prazo de reposição, compra mínima e
-- fornecedor padrão. Custo vem pela nota (funções acima) e preço pela aprovação. Produto novo entra sem preço de
-- venda e sem estoque (o estoque entra pela nota).
create or replace function public.trg_produto_compras()
returns trigger language plpgsql set search_path = public as $f$
declare
  v_livres text[] := array['marcadores', 'estoque_minimo', 'estoque_maximo', 'prazo_reposicao_dias', 'compra_minima',
                           'fornecedor_padrao_id', 'motivo_alteracao'];
begin
  if current_user not in ('authenticated', 'anon') or public.tem_papel('financeiro') or public.tem_papel('marketplace')
     or not public.tem_papel('compras') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.preco_venda, 0) <> 0 or coalesce(new.estoque_atual, 0) <> 0 then
      raise exception 'o perfil Compras cadastra o produto sem preço de venda e sem estoque: o preço passa pela aprovação e o estoque entra pela nota';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - v_livres) is distinct from (to_jsonb(old) - v_livres) then
    raise exception 'o perfil Compras muda no produto só marcadores, estoque mínimo e máximo, prazo de reposição, compra mínima e fornecedor padrão; o resto fica com o financeiro';
  end if;
  return new;
end $f$;

do $$ begin
  -- "aa_" para rodar antes dos outros gatilhos (que ajustam o cadastro)
  create trigger aa_produto_compras before insert or update on public.produtos
    for each row execute function public.trg_produto_compras();
exception when duplicate_object then null; end $$;

-- Funções que já existem: só o trecho que confere o papel ganha o Compras (create or replace com o resto igual).
-- Se a função tiver mudado e o trecho não for achado, ela fica como está e sai um aviso.
create or replace function pg_temp.nf_trocar(p_funcao text, p_de text[], p_para text[], p_feito text[])
returns void language plpgsql as $f$
declare v text; v0 text; i int;
begin
  if to_regprocedure(p_funcao) is null then
    raise warning 'perfil Compras: a função % não existe (ficou como está)', p_funcao;
    return;
  end if;
  v := pg_get_functiondef(to_regprocedure(p_funcao));
  v0 := v;
  for i in 1 .. coalesce(array_length(p_de, 1), 0) loop
    continue when v ~ p_feito[i];      -- já trocado (a migração rodou antes)
    if v !~ p_de[i] then
      raise warning 'perfil Compras: trecho não achado em % (ficou como está): %', p_funcao, p_de[i];
      return;
    end if;
    v := regexp_replace(v, p_de[i], p_para[i]);   -- só a primeira ocorrência
  end loop;
  if v <> v0 then execute v; end if;
end $f$;

do $$
declare
  f text;
  -- tem_papel('financeiro', 'tecnico') → com o Compras
  ft_de text := 'tem_papel\(''financeiro'', ''tecnico''\)';
  ft_para text := 'tem_papel(''financeiro'', ''tecnico'', ''compras'')';
  ft_feito text := 'tem_papel\(''financeiro'', ''tecnico'', ''compras''\)';
  -- tem_algum_papel(array['financeiro', 'tecnico']) → com o Compras
  fa_de text := 'tem_algum_papel\(array\[''financeiro'', ''tecnico''\]\)';
  fa_para text := 'tem_algum_papel(array[''financeiro'', ''tecnico'', ''compras''])';
  fa_feito text := 'tem_algum_papel\(array\[''financeiro'', ''tecnico'', ''compras''\]\)';
  -- exigir_papel('financeiro') → com o Compras
  fe_de text := 'exigir_papel\(''financeiro''\);';
  fe_para text := 'exigir_papel(''financeiro'', ''compras'');';
  fe_feito text := 'exigir_papel\(''financeiro'', ''compras''\);';
begin
  -- cotações, fornecedores do produto e últimas compras
  foreach f in array array['public.cotacao_gerar_pedidos(uuid,jsonb)', 'public.cotacao_marcar_enviada(uuid[])',
                           'public.fornecimentos_reprocessar(integer,integer)'] loop
    perform pg_temp.nf_trocar(f, array[ft_de], array[ft_para], array[ft_feito]);
  end loop;
  perform pg_temp.nf_trocar('public.ultimas_compras(uuid,text,integer)',
    array[ft_de, 'v_notas boolean := public\.tem_papel\(''financeiro''\);'],
    array[ft_para, 'v_notas boolean := public.tem_papel(''financeiro'', ''compras'');'],
    array[ft_feito, 'v_notas boolean := public\.tem_papel\(''financeiro'', ''compras''\);']);

  -- conferir itens das notas, sugestor de NCM e histórico de custos (que lê as notas)
  foreach f in array array['public.indexar_itens_nfe(integer)', 'public.itens_notas_fornecedor(uuid,date)',
                           'public.ligar_itens_fornecedor(jsonb)', 'public.sugerir_ncm(uuid)'] loop
    perform pg_temp.nf_trocar(f, array[fa_de], array[fa_para], array[fa_feito]);
  end loop;
  perform pg_temp.nf_trocar('public.historico_custos(uuid)',
    array[fa_de, 'where public\.tem_papel\(''financeiro''\) and n\.excluida_em'],
    array[fa_para, 'where public.tem_papel(''financeiro'', ''compras'') and n.excluida_em'],
    array[fa_feito, 'tem_papel\(''financeiro'', ''compras''\) and n\.excluida_em']);

  -- entrada no estoque pela nota, receber a OC, observação e marcadores das notas de fornecedor
  -- e o cadastro de fornecedores: agrupar filiais na marca e unificar repetidos (nada é apagado)
  foreach f in array array['public.lancar_estoque_nfe(uuid,jsonb)', 'public.receber_pedido_compra(uuid,jsonb,boolean,date)',
                           'public.anotar_nota(text,uuid,text)', 'public.marcar_notas(text,uuid[],uuid[],uuid[])',
                           'public.agrupar_fornecedores(uuid,uuid[],text)', 'public.unificar_fornecedores(uuid,uuid[],text)'] loop
    perform pg_temp.nf_trocar(f, array[fe_de], array[fe_para], array[fe_feito]);
  end loop;

  -- excluir e restaurar OC: Compras entra; a OP continua só com financeiro e técnico
  foreach f in array array['public.excluir_documento(text,uuid,text)', 'public.restaurar_documento(text,uuid)'] loop
    perform pg_temp.nf_trocar(f,
      array['exigir_papel\(''financeiro'', ''tecnico''\);', '(elsif p_tabela = ''ordens_producao'' then)(\s+)(select|update)'],
      array['exigir_papel(''financeiro'', ''tecnico'', ''compras'');', '\1\2perform public.exigir_papel(''financeiro'', ''tecnico'');\2\3'],
      array['exigir_papel\(''financeiro'', ''tecnico'', ''compras''\);', '''ordens_producao'' then\s+perform public\.exigir_papel']);
  end loop;
  perform pg_temp.nf_trocar('public.documentos_excluidos()',
    array['c\.excluida_em is not null and public\.tem_papel\(''financeiro'', ''tecnico''\)'],
    array['c.excluida_em is not null and public.tem_papel(''financeiro'', ''tecnico'', ''compras'')'],
    array['c\.excluida_em is not null and public\.tem_papel\(''financeiro'', ''tecnico'', ''compras''\)']);

  -- documentos anexados às notas de fornecedor
  perform pg_temp.nf_trocar('public.pode_ver_documento(text)',
    array['or public\.tem_papel\(''financeiro''\)\)'],
    array['or public.tem_papel(''financeiro'') or (p_entidade = ''nfe_recebida'' and public.tem_papel(''compras'')))'],
    array['p_entidade = ''nfe_recebida'' and public\.tem_papel\(''compras''\)']);

  -- núcleo da entrada no estoque: quem chama confere o papel (lancar_estoque_nfe, confirmar_entrada_nota) e a
  -- entrada automática usa a chave de serviço (sem usuário); ninguém mais pode chamar o núcleo
  perform pg_temp.nf_trocar('public.lancar_estoque_nfe_core(uuid,jsonb)',
    array['if not public\.is_erp_user\(\) then raise exception ''acesso negado''; end if;'],
    array['null; -- o papel é conferido por quem chama; a entrada automática usa a chave de serviço'],
    array['o papel é conferido por quem chama']);
end $$;
