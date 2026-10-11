-- =====================================================================
-- Vários fornecedores por produto + pedido de cotação
--   * fornecimentos: quem vende cada produto, o código dele, o último preço (de onde veio e quando),
--     prazo, quantidade mínima e o preferido (o mesmo "fornecedor padrão" do cadastro)
--   * preenchido sozinho: fornecedor padrão, vínculos de código, notas de fornecedor (XML),
--     pedidos de compra e respostas de cotação
--   * cotação: escolhe itens e fornecedores, manda o link por e-mail/WhatsApp, o fornecedor responde
--     online (sem login), o ERP monta o mapa comparativo e gera o pedido de compra do vencedor
-- Somente acréscimos: tabelas novas, funções (create or replace), gatilhos novos.
-- =====================================================================

create table if not exists public.fornecimentos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  codigo_fornecedor text,
  preco numeric(14,4) check (preco >= 0),
  preco_em date,
  preco_origem text check (preco_origem in ('manual', 'nota', 'pedido', 'cotacao')),
  prazo_dias int check (prazo_dias between 0 and 730),
  qtd_minima numeric(12,3) check (qtd_minima >= 0),
  preferido boolean not null default false,
  ativo boolean not null default true,
  observacoes text,
  ultima_compra_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (produto_id, fornecedor_id)
);
create index if not exists fornecimentos_fornecedor on public.fornecimentos (fornecedor_id);

alter table public.fornecimentos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecimentos' and policyname = 'erp_select') then
    create policy "erp_select" on public.fornecimentos for select to authenticated using (public.tem_papel('financeiro', 'tecnico', 'vendas'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecimentos' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.fornecimentos for insert to authenticated with check (public.tem_papel('financeiro', 'tecnico'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecimentos' and policyname = 'erp_update') then
    create policy "erp_update" on public.fornecimentos for update to authenticated
      using (public.tem_papel('financeiro', 'tecnico')) with check (public.tem_papel('financeiro', 'tecnico'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecimentos' and policyname = 'erp_delete') then
    create policy "erp_delete" on public.fornecimentos for delete to authenticated using (public.is_erp_admin());
  end if;
end $$;

-- Registra (ou atualiza) quem vende o produto. O preço só troca se a informação for mais nova.
create or replace function public.fornecimento_registrar(
  p_produto uuid, p_fornecedor uuid, p_preco numeric default null, p_data date default null,
  p_origem text default null, p_codigo text default null, p_prazo int default null, p_compra boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_produto is null or p_fornecedor is null then return; end if;
  if p_preco is not null and (p_preco < 0 or p_preco > 1e9) then p_preco := null; end if;
  insert into fornecimentos as f (produto_id, fornecedor_id, codigo_fornecedor, preco, preco_em, preco_origem, prazo_dias, ultima_compra_em)
  values (p_produto, p_fornecedor, nullif(left(btrim(coalesce(p_codigo, '')), 60), ''), p_preco,
          case when p_preco is not null then coalesce(p_data, current_date) end, case when p_preco is not null then p_origem end,
          case when p_prazo between 0 and 730 then p_prazo end, case when p_compra then coalesce(p_data, current_date) end)
  on conflict (produto_id, fornecedor_id) do update set
    codigo_fornecedor = coalesce(f.codigo_fornecedor, excluded.codigo_fornecedor),
    preco = case when excluded.preco is not null and (f.preco_em is null or excluded.preco_em >= f.preco_em) then excluded.preco else f.preco end,
    preco_origem = case when excluded.preco is not null and (f.preco_em is null or excluded.preco_em >= f.preco_em) then excluded.preco_origem else f.preco_origem end,
    preco_em = case when excluded.preco is not null and (f.preco_em is null or excluded.preco_em >= f.preco_em) then excluded.preco_em else f.preco_em end,
    prazo_dias = coalesce(excluded.prazo_dias, f.prazo_dias),
    ultima_compra_em = greatest(f.ultima_compra_em, excluded.ultima_compra_em),
    updated_at = now();
end $$;

-- Itens de uma nota de fornecedor (XML) → produto pelo vínculo de código (com o fator de conversão),
-- pelo EAN ou pelo código do fabricante / SKU. Devolve quantos itens reconheceu.
create or replace function public.fornecimentos_da_nfe(p_nfe uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ns text[] := array[array['n', 'http://www.portalfiscal.inf.br/nfe']];
  v_forn uuid; v_data date; v_txt text; v_xml xml; r record; v_prod uuid; v_fator numeric; n int := 0;
begin
  select fornecedor_id, data_emissao::date, xml into v_forn, v_data, v_txt from nfe_recebidas where id = p_nfe and excluida_em is null;
  if v_forn is null or v_txt is null then return 0; end if;
  begin
    v_xml := v_txt::xml;
  exception when others then return 0;
  end;
  for r in
    select (xpath('/n:prod/n:cProd/text()', pr, v_ns))[1]::text as cprod,
           (xpath('/n:prod/n:cEAN/text()', pr, v_ns))[1]::text as cean,
           (xpath('/n:prod/n:vUnCom/text()', pr, v_ns))[1]::text as vun
      from unnest(xpath('//n:det/n:prod', v_xml, v_ns)) pr
  loop
    v_prod := null; v_fator := 1;
    select pf.produto_id, pf.fator_conversao into v_prod, v_fator
      from produto_fornecedor pf
     where pf.fornecedor_id = v_forn and upper(regexp_replace(pf.codigo_fornecedor, '\s', '', 'g')) = upper(regexp_replace(coalesce(r.cprod, ''), '\s', '', 'g'))
     limit 1;
    if v_prod is null and r.cean ~ '^\d{8,14}$' then
      select id into v_prod from produtos where codigo_barras = r.cean and ativo and unificado_em is null limit 1;
    end if;
    if v_prod is null and length(btrim(coalesce(r.cprod, ''))) >= 4 then
      select id into v_prod from produtos
       where ativo and unificado_em is null
         and upper(regexp_replace(r.cprod, '\s', '', 'g')) in (upper(regexp_replace(coalesce(codigo_fabricante, ''), '\s', '', 'g')), upper(regexp_replace(coalesce(sku, ''), '\s', '', 'g')))
       limit 1;
    end if;
    continue when v_prod is null;
    perform fornecimento_registrar(v_prod, v_forn,
      case when r.vun ~ '^\d+(\.\d+)?$' then round(r.vun::numeric / coalesce(nullif(v_fator, 0), 1), 4) end,
      v_data, 'nota', r.cprod, null, true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Reprocessa as notas de fornecedor (botão "Atualizar pelas notas" e carga inicial em lotes)
create or replace function public.fornecimentos_reprocessar(p_limite int default 300, p_pular int default 0)
returns int language plpgsql security definer set search_path = public as $$
declare v uuid; n int := 0;
begin
  if not public.tem_papel('financeiro', 'tecnico') then raise exception 'sem permissão'; end if;
  for v in select id from nfe_recebidas where xml is not null and excluida_em is null and fornecedor_id is not null
            order by data_emissao, id offset greatest(p_pular, 0) limit least(greatest(p_limite, 1), 2000) loop
    n := n + public.fornecimentos_da_nfe(v);
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Gatilhos que mantêm a lista de fornecedores em dia
-- ---------------------------------------------------------------------
create or replace function public.trg_nfe_recebida_fornecimentos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.xml is null or new.fornecedor_id is null or new.excluida_em is not null then return null; end if;
  if tg_op = 'UPDATE' and new.xml is not distinct from old.xml and new.fornecedor_id is not distinct from old.fornecedor_id then return null; end if;
  begin
    perform public.fornecimentos_da_nfe(new.id);
  exception when others then
    raise warning 'fornecedores do produto (nota %): %', new.id, sqlerrm;   -- nunca trava a entrada da nota
  end;
  return null;
end $$;

-- código do fornecedor ligado a um produto: entra na lista e busca o último preço nas notas dele com esse código
create or replace function public.trg_produto_fornecedor_fornecimentos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  begin
    perform public.fornecimento_registrar(new.produto_id, new.fornecedor_id, null, null, null, new.codigo_fornecedor);
    for v in select id from nfe_recebidas
              where fornecedor_id = new.fornecedor_id and excluida_em is null
                and xml like '%<cProd>' || replace(replace(new.codigo_fornecedor, '%', ''), '_', '\_') || '</cProd>%'
              order by data_emissao desc limit 20 loop
      perform public.fornecimentos_da_nfe(v);
    end loop;
  exception when others then
    raise warning 'fornecedores do produto (vínculo %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- fornecedor padrão do cadastro = preferido na lista
create or replace function public.trg_produto_fornecedor_padrao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fornecedor_padrao_id is null or (tg_op = 'UPDATE' and new.fornecedor_padrao_id is not distinct from old.fornecedor_padrao_id) then return null; end if;
  perform public.fornecimento_registrar(new.id, new.fornecedor_padrao_id);
  update fornecimentos set preferido = true, updated_at = now()
   where produto_id = new.id and fornecedor_id = new.fornecedor_padrao_id and not preferido;
  return null;
end $$;

-- marcou um preferido: os outros deixam de ser e o cadastro do produto acompanha
create or replace function public.trg_fornecimento_preferido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.preferido or (tg_op = 'UPDATE' and old.preferido) then return null; end if;
  update fornecimentos set preferido = false, updated_at = now() where produto_id = new.produto_id and id <> new.id and preferido;
  update produtos set fornecedor_padrao_id = new.fornecedor_id
   where id = new.produto_id and fornecedor_padrao_id is distinct from new.fornecedor_id and unificado_em is null;
  return null;
end $$;

-- unificação de produtos: se o principal já tem o mesmo fornecedor, junta as informações em vez de dar erro
create or replace function public.trg_fornecimento_unificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare e fornecimentos;
begin
  if new.produto_id is not distinct from old.produto_id then return new; end if;
  select * into e from fornecimentos where produto_id = new.produto_id and fornecedor_id = new.fornecedor_id and id <> new.id;
  if e.id is null then return new; end if;
  update fornecimentos set
    codigo_fornecedor = coalesce(e.codigo_fornecedor, new.codigo_fornecedor),
    preco = case when new.preco is not null and (e.preco_em is null or new.preco_em > e.preco_em) then new.preco else e.preco end,
    preco_origem = case when new.preco is not null and (e.preco_em is null or new.preco_em > e.preco_em) then new.preco_origem else e.preco_origem end,
    preco_em = case when new.preco is not null and (e.preco_em is null or new.preco_em > e.preco_em) then new.preco_em else e.preco_em end,
    prazo_dias = coalesce(e.prazo_dias, new.prazo_dias), qtd_minima = coalesce(e.qtd_minima, new.qtd_minima),
    ultima_compra_em = greatest(e.ultima_compra_em, new.ultima_compra_em), updated_at = now()
   where id = e.id;
  return null;   -- o registro antigo fica no cadastro arquivado
end $$;

-- unificação de produtos: duas sugestões de preço pendentes não cabem no mesmo produto
create or replace function public.trg_preco_sugestao_unificar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.produto_id is distinct from old.produto_id and new.status = 'pendente'
     and exists (select 1 from preco_sugestoes where produto_id = new.produto_id and status = 'pendente' and id <> new.id) then
    new.status := 'substituida';
    new.decidido_em := now();
  end if;
  return new;
end $$;

-- pedido de compra confirmado: preço e prazo combinados; recebido: data da última compra
create or replace function public.trg_pedido_compra_fornecimentos()
returns trigger language plpgsql security definer set search_path = public as $$
declare i record;
begin
  if new.fornecedor_id is null or new.status is not distinct from old.status then return null; end if;
  if new.status not in ('enviado', 'parcial', 'recebido') then return null; end if;
  begin
    for i in select produto_id, custo_unitario from pedido_compra_itens where pedido_compra_id = new.id loop
      perform public.fornecimento_registrar(i.produto_id, new.fornecedor_id,
        case when old.status = 'cotacao' and i.custo_unitario > 0 then i.custo_unitario end, current_date, 'pedido', null,
        case when old.status = 'cotacao' and new.previsao_entrega is not null then greatest(new.previsao_entrega - current_date, 0) end,
        new.status in ('parcial', 'recebido'));
    end loop;
  exception when others then
    raise warning 'fornecedores do produto (pedido de compra %): %', new.numero, sqlerrm;
  end;
  return null;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_nfe_recebida_fornecimentos' and tgrelid = 'public.nfe_recebidas'::regclass) then
    create trigger trg_nfe_recebida_fornecimentos after insert or update of xml, fornecedor_id on public.nfe_recebidas
      for each row execute function public.trg_nfe_recebida_fornecimentos();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_produto_fornecedor_fornecimentos' and tgrelid = 'public.produto_fornecedor'::regclass) then
    create trigger trg_produto_fornecedor_fornecimentos after insert or update of produto_id, codigo_fornecedor on public.produto_fornecedor
      for each row execute function public.trg_produto_fornecedor_fornecimentos();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_produto_fornecedor_padrao' and tgrelid = 'public.produtos'::regclass) then
    create trigger trg_produto_fornecedor_padrao after insert or update of fornecedor_padrao_id on public.produtos
      for each row execute function public.trg_produto_fornecedor_padrao();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_fornecimento_preferido' and tgrelid = 'public.fornecimentos'::regclass) then
    create trigger trg_fornecimento_preferido after insert or update of preferido on public.fornecimentos
      for each row execute function public.trg_fornecimento_preferido();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_fornecimento_unificar' and tgrelid = 'public.fornecimentos'::regclass) then
    create trigger trg_fornecimento_unificar before update of produto_id on public.fornecimentos
      for each row execute function public.trg_fornecimento_unificar();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_preco_sugestao_unificar' and tgrelid = 'public.preco_sugestoes'::regclass) then
    create trigger trg_preco_sugestao_unificar before update of produto_id on public.preco_sugestoes
      for each row execute function public.trg_preco_sugestao_unificar();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_pedido_compra_fornecimentos' and tgrelid = 'public.pedidos_compra'::regclass) then
    create trigger trg_pedido_compra_fornecimentos after update of status on public.pedidos_compra
      for each row execute function public.trg_pedido_compra_fornecimentos();
  end if;
end $$;

-- carga inicial: fornecedor padrão (preferido), vínculos de código e pedidos de compra confirmados.
-- As notas de fornecedor (XML) entram por public.fornecimentos_reprocessar, em lotes.
insert into public.fornecimentos (produto_id, fornecedor_id, preferido)
select id, fornecedor_padrao_id, true from public.produtos where fornecedor_padrao_id is not null and unificado_em is null
on conflict (produto_id, fornecedor_id) do nothing;

insert into public.fornecimentos (produto_id, fornecedor_id, codigo_fornecedor)
select distinct on (produto_id, fornecedor_id) produto_id, fornecedor_id, codigo_fornecedor from public.produto_fornecedor
order by produto_id, fornecedor_id, created_at desc
on conflict (produto_id, fornecedor_id) do update set codigo_fornecedor = coalesce(public.fornecimentos.codigo_fornecedor, excluded.codigo_fornecedor);

do $$
declare i record;
begin
  for i in select pc.fornecedor_id, pc.status, coalesce(pc.enviado_em, pc.created_at)::date as quando, it.produto_id, it.custo_unitario
             from public.pedidos_compra pc join public.pedido_compra_itens it on it.pedido_compra_id = pc.id
            where pc.fornecedor_id is not null and pc.status in ('enviado', 'parcial', 'recebido') loop
    perform public.fornecimento_registrar(i.produto_id, i.fornecedor_id, nullif(i.custo_unitario, 0), i.quando, 'pedido', null, null, i.status <> 'enviado');
  end loop;
end $$;

-- =====================================================================
-- Cotação de compra
-- =====================================================================
create table if not exists public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  titulo text,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'encerrada', 'cancelada')),
  prazo_resposta date,
  entrega_desejada date,
  observacoes text,
  unidade_id uuid references public.unidades(id),
  criado_por uuid default auth.uid(),
  enviada_em timestamptz,
  encerrada_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.cotacoes(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  descricao text not null,
  quantidade numeric(12,3) not null check (quantidade > 0),
  unidade text,
  observacao text,
  ordem int not null default 0
);
create index if not exists cotacao_itens_cotacao on public.cotacao_itens (cotacao_id);

create table if not exists public.cotacao_fornecedores (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.cotacoes(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id),
  token uuid not null unique default gen_random_uuid(),
  email text,
  status text not null default 'pendente' check (status in ('pendente', 'enviada', 'vista', 'respondida', 'recusou')),
  enviado_em timestamptz,
  visto_em timestamptz,
  respondido_em timestamptz,
  respondido_por text,
  condicao_pagamento text,
  prazo_entrega_dias int check (prazo_entrega_dias between 0 and 730),
  frete numeric(12,2) check (frete >= 0),
  frete_tipo text check (frete_tipo in ('CIF', 'FOB')),
  validade date,
  observacoes text,
  pedido_compra_id uuid references public.pedidos_compra(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cotacao_id, fornecedor_id)
);

create table if not exists public.cotacao_respostas (
  id uuid primary key default gen_random_uuid(),
  cotacao_fornecedor_id uuid not null references public.cotacao_fornecedores(id) on delete cascade,
  cotacao_item_id uuid not null references public.cotacao_itens(id) on delete cascade,
  preco_unitario numeric(14,4) check (preco_unitario >= 0),
  prazo_dias int check (prazo_dias between 0 and 730),
  disponivel boolean not null default true,
  observacao text,
  vencedor boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (cotacao_fornecedor_id, cotacao_item_id)
);

do $$
declare t text;
begin
  foreach t in array array['cotacoes', 'cotacao_itens', 'cotacao_fornecedores', 'cotacao_respostas'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_select') then
      execute format('create policy "erp_select" on public.%I for select to authenticated using (public.tem_papel(''financeiro'', ''tecnico''))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_insert') then
      execute format('create policy "erp_insert" on public.%I for insert to authenticated with check (public.tem_papel(''financeiro'', ''tecnico''))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_update') then
      execute format('create policy "erp_update" on public.%I for update to authenticated using (public.tem_papel(''financeiro'', ''tecnico'')) with check (public.tem_papel(''financeiro'', ''tecnico''))', t);
    end if;
    -- itens e fornecedores saem enquanto a cotação é rascunho; a cotação em si só é cancelada
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_delete') then
      if t = 'cotacoes' then
        execute format('create policy "erp_delete" on public.%I for delete to authenticated using (public.is_erp_admin())', t);
      else
        execute format('create policy "erp_delete" on public.%I for delete to authenticated using (public.tem_papel(''financeiro'', ''tecnico''))', t);
      end if;
    end if;
  end loop;
end $$;

-- Marca como enviada (e-mail ou WhatsApp)
create or replace function public.cotacao_marcar_enviada(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.tem_papel('financeiro', 'tecnico') then raise exception 'sem permissão'; end if;
  update cotacao_fornecedores cf set status = 'enviada', enviado_em = now()
   where cf.id = any(p_ids) and cf.status = 'pendente'
     and exists (select 1 from cotacoes c where c.id = cf.cotacao_id and c.status in ('rascunho', 'enviada'));
  get diagnostics n = row_count;
  update cotacao_fornecedores set enviado_em = now() where id = any(p_ids) and status <> 'pendente';
  update cotacoes set status = 'enviada', enviada_em = coalesce(enviada_em, now())
   where status = 'rascunho' and id in (select cotacao_id from cotacao_fornecedores where id = any(p_ids));
  return n;
end $$;

-- O que o fornecedor vê pelo link (/cotacao/<código>), sem login
create or replace function public.cotacao_publica(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cf cotacao_fornecedores; c cotacoes; v_cfg configuracoes;
begin
  select * into cf from cotacao_fornecedores where token = p_token;
  if not found then return null; end if;
  select * into c from cotacoes where id = cf.cotacao_id;
  if c.status = 'rascunho' then return null; end if;
  select * into v_cfg from configuracoes where id = 1;
  if cf.status in ('pendente', 'enviada') and c.status = 'enviada' then
    update cotacao_fornecedores set status = 'vista', visto_em = now() where id = cf.id;
    cf.status := 'vista';
  end if;
  return jsonb_build_object(
    'numero', c.numero, 'titulo', c.titulo, 'status', c.status, 'situacao', cf.status,
    'prazo_resposta', c.prazo_resposta, 'entrega_desejada', c.entrega_desejada, 'observacoes', c.observacoes,
    'fornecedor', (select coalesce(nullif(nome_fantasia, ''), nome) from fornecedores where id = cf.fornecedor_id),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'quantidade', i.quantidade, 'unidade', coalesce(i.unidade, p.unidade), 'observacao', i.observacao,
        'codigo_fabricante', p.codigo_fabricante, 'marca', p.marca, 'modelo', p.modelo,
        'seu_codigo', (select f.codigo_fornecedor from fornecimentos f where f.produto_id = i.produto_id and f.fornecedor_id = cf.fornecedor_id),
        'preco_unitario', r.preco_unitario, 'prazo_dias', r.prazo_dias, 'disponivel', coalesce(r.disponivel, true), 'obs_resposta', r.observacao)
        order by i.ordem, i.descricao)
      from cotacao_itens i left join produtos p on p.id = i.produto_id
      left join cotacao_respostas r on r.cotacao_item_id = i.id and r.cotacao_fornecedor_id = cf.id
      where i.cotacao_id = c.id), '[]'::jsonb),
    'condicao_pagamento', cf.condicao_pagamento, 'prazo_entrega_dias', cf.prazo_entrega_dias, 'frete', cf.frete, 'frete_tipo', cf.frete_tipo,
    'validade', cf.validade, 'obs_fornecedor', cf.observacoes, 'respondido_por', cf.respondido_por, 'respondido_em', cf.respondido_em,
    'empresa', jsonb_build_object('nome', coalesce(v_cfg.nome_fantasia, v_cfg.razao_social), 'razao_social', v_cfg.razao_social, 'cnpj', v_cfg.cnpj,
      'whatsapp', v_cfg.whatsapp, 'telefone', v_cfg.telefone, 'email', v_cfg.email, 'municipio', v_cfg.municipio, 'uf', v_cfg.uf),
    'cor', coalesce(v_cfg.proposta_cor, '#0EA5E9'));
end $$;

-- Resposta do fornecedor: preços por item + condições. Pode corrigir enquanto a cotação estiver aberta.
create or replace function public.cotacao_responder(p_token uuid, p_itens jsonb, p_dados jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare cf cotacao_fornecedores; c cotacoes; e jsonb; v_item cotacao_itens; v_preco numeric; v_prazo int; v_nome text; n int := 0; v_forn text;
begin
  select * into cf from cotacao_fornecedores where token = p_token for update;
  if not found then raise exception 'cotação não encontrada'; end if;
  select * into c from cotacoes where id = cf.cotacao_id;
  if c.status <> 'enviada' then raise exception 'esta cotação já foi encerrada: fale com o comprador'; end if;
  v_nome := left(btrim(coalesce(p_dados ->> 'respondido_por', '')), 120);
  if v_nome = '' then raise exception 'informe o seu nome'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 500 then raise exception 'itens inválidos'; end if;

  for e in select * from jsonb_array_elements(p_itens) loop
    select * into v_item from cotacao_itens where id = (e ->> 'item_id')::uuid and cotacao_id = c.id;
    continue when v_item.id is null;
    v_preco := case when (e ->> 'preco_unitario') ~ '^\d{1,9}(\.\d{1,4})?$' then (e ->> 'preco_unitario')::numeric end;
    v_prazo := case when (e ->> 'prazo_dias') ~ '^\d{1,3}$' then least((e ->> 'prazo_dias')::int, 730) end;
    insert into cotacao_respostas (cotacao_fornecedor_id, cotacao_item_id, preco_unitario, prazo_dias, disponivel, observacao, updated_at)
    values (cf.id, v_item.id, v_preco, v_prazo, coalesce((e ->> 'disponivel')::boolean, true) and v_preco is not null,
            nullif(left(btrim(coalesce(e ->> 'observacao', '')), 300), ''), now())
    on conflict (cotacao_fornecedor_id, cotacao_item_id) do update set
      preco_unitario = excluded.preco_unitario, prazo_dias = excluded.prazo_dias, disponivel = excluded.disponivel,
      observacao = excluded.observacao, updated_at = now();
    if v_preco is not null then
      perform fornecimento_registrar(v_item.produto_id, cf.fornecedor_id, v_preco, current_date, 'cotacao', null, v_prazo);
      n := n + 1;
    end if;
  end loop;
  if n = 0 then raise exception 'informe o preço de ao menos um item (ou use "Não vamos cotar")'; end if;

  update cotacao_fornecedores set
    status = 'respondida', respondido_em = now(), respondido_por = v_nome,
    condicao_pagamento = nullif(left(btrim(coalesce(p_dados ->> 'condicao_pagamento', '')), 200), ''),
    prazo_entrega_dias = case when (p_dados ->> 'prazo_entrega_dias') ~ '^\d{1,3}$' then least((p_dados ->> 'prazo_entrega_dias')::int, 730) end,
    frete = case when (p_dados ->> 'frete') ~ '^\d{1,9}(\.\d{1,2})?$' then (p_dados ->> 'frete')::numeric end,
    frete_tipo = case when p_dados ->> 'frete_tipo' in ('CIF', 'FOB') then p_dados ->> 'frete_tipo' end,
    validade = case when (p_dados ->> 'validade') ~ '^\d{4}-\d{2}-\d{2}$' then (p_dados ->> 'validade')::date end,
    observacoes = nullif(left(btrim(coalesce(p_dados ->> 'observacoes', '')), 1000), '')
   where id = cf.id;
  v_forn := (select coalesce(nullif(nome_fantasia, ''), nome) from fornecedores where id = cf.fornecedor_id);
  perform notificar('outro', 'Cotação nº ' || c.numero || ' respondida', v_forn || ' mandou os preços. Confira o mapa comparativo.',
    '/producao?aba=cotacoes', array['financeiro', 'tecnico'], c.unidade_id);
  return 'respondida';
end $$;

create or replace function public.cotacao_recusar(p_token uuid, p_nome text, p_motivo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare cf cotacao_fornecedores; c cotacoes;
begin
  select * into cf from cotacao_fornecedores where token = p_token for update;
  if not found then raise exception 'cotação não encontrada'; end if;
  select * into c from cotacoes where id = cf.cotacao_id;
  if c.status <> 'enviada' then raise exception 'esta cotação já foi encerrada'; end if;
  if btrim(coalesce(p_nome, '')) = '' then raise exception 'informe o seu nome'; end if;
  update cotacao_fornecedores set status = 'recusou', respondido_em = now(), respondido_por = left(btrim(p_nome), 120),
         observacoes = nullif(left(btrim(coalesce(p_motivo, '')), 1000), '')
   where id = cf.id;
  perform notificar('outro', 'Cotação nº ' || c.numero || ': fornecedor não vai cotar',
    (select coalesce(nullif(nome_fantasia, ''), nome) from fornecedores where id = cf.fornecedor_id) || coalesce(' · ' || left(p_motivo, 80), ''),
    '/producao?aba=cotacoes', array['financeiro', 'tecnico'], c.unidade_id);
  return 'recusou';
end $$;

-- Vencedores escolhidos no mapa → um pedido de compra por fornecedor (em "cotação", para conferir e confirmar)
create or replace function public.cotacao_gerar_pedidos(p_cotacao uuid, p_escolhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c cotacoes; cf record; v_pc uuid; v_num bigint; v_saida jsonb := '[]'::jsonb; v_prazo int;
  v_itens uuid[]; v_cfs uuid[];
begin
  if not public.tem_papel('financeiro', 'tecnico') then raise exception 'sem permissão'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found then raise exception 'cotação não encontrada'; end if;
  if c.status in ('encerrada', 'cancelada') then raise exception 'esta cotação já foi encerrada'; end if;

  select array_agg((e ->> 'item_id')::uuid), array_agg((e ->> 'cotacao_fornecedor_id')::uuid)
    into v_itens, v_cfs
    from jsonb_array_elements(case when jsonb_typeof(p_escolhas) = 'array' then p_escolhas else '[]'::jsonb end) e;
  if v_itens is null then raise exception 'escolha o fornecedor de ao menos um item'; end if;
  if exists (select 1 from unnest(v_itens, v_cfs) s(item_id, cf_id)
              left join cotacao_itens i on i.id = s.item_id
              left join cotacao_respostas r on r.cotacao_item_id = s.item_id and r.cotacao_fornecedor_id = s.cf_id
              where i.cotacao_id is distinct from c.id or r.preco_unitario is null or not r.disponivel) then
    raise exception 'há item escolhido sem preço desse fornecedor';
  end if;

  for cf in select x.* from cotacao_fornecedores x where x.cotacao_id = c.id and x.id = any(v_cfs) order by x.created_at loop
    select max(r.prazo_dias) into v_prazo
      from unnest(v_itens, v_cfs) s(item_id, cf_id) join cotacao_respostas r on r.cotacao_item_id = s.item_id and r.cotacao_fornecedor_id = s.cf_id
     where s.cf_id = cf.id;
    insert into pedidos_compra (fornecedor_id, status, previsao_entrega, condicao_pagamento, frete, observacoes, unidade_id)
    values (cf.fornecedor_id, 'cotacao', current_date + coalesce(cf.prazo_entrega_dias, v_prazo, 15), cf.condicao_pagamento, coalesce(cf.frete, 0),
            left('Vencedor da cotação nº ' || c.numero || coalesce(' · frete ' || cf.frete_tipo, '') || coalesce(' · proposta válida até ' || to_char(cf.validade, 'DD/MM/YYYY'), ''), 500),
            c.unidade_id)
    returning id, numero into v_pc, v_num;
    insert into pedido_compra_itens (pedido_compra_id, produto_id, descricao, quantidade, custo_unitario)
    select v_pc, i.produto_id, i.descricao, i.quantidade, round(r.preco_unitario, 2)
      from unnest(v_itens, v_cfs) s(item_id, cf_id) join cotacao_itens i on i.id = s.item_id
      join cotacao_respostas r on r.cotacao_item_id = s.item_id and r.cotacao_fornecedor_id = s.cf_id
     where s.cf_id = cf.id order by i.ordem;
    update cotacao_respostas r set vencedor = true
      from unnest(v_itens, v_cfs) s(item_id, cf_id)
     where s.cf_id = cf.id and r.cotacao_fornecedor_id = cf.id and r.cotacao_item_id = s.item_id;
    update cotacao_fornecedores set pedido_compra_id = v_pc where id = cf.id;
    v_saida := v_saida || jsonb_build_object('pedido_id', v_pc, 'numero', v_num, 'fornecedor', (select nome from fornecedores where id = cf.fornecedor_id));
  end loop;
  update cotacoes set status = 'encerrada', encerrada_em = now() where id = c.id;
  return v_saida;
end $$;

revoke execute on function public.fornecimento_registrar(uuid, uuid, numeric, date, text, text, int, boolean) from public, anon, authenticated;
revoke execute on function public.fornecimentos_da_nfe(uuid) from public, anon, authenticated;
revoke execute on function public.trg_nfe_recebida_fornecimentos() from public, anon, authenticated;
revoke execute on function public.trg_produto_fornecedor_fornecimentos() from public, anon, authenticated;
revoke execute on function public.trg_produto_fornecedor_padrao() from public, anon, authenticated;
revoke execute on function public.trg_fornecimento_preferido() from public, anon, authenticated;
revoke execute on function public.trg_fornecimento_unificar() from public, anon, authenticated;
revoke execute on function public.trg_preco_sugestao_unificar() from public, anon, authenticated;
revoke execute on function public.trg_pedido_compra_fornecimentos() from public, anon, authenticated;
revoke execute on function public.fornecimentos_reprocessar(int, int) from public, anon;
revoke execute on function public.cotacao_marcar_enviada(uuid[]) from public, anon;
revoke execute on function public.cotacao_gerar_pedidos(uuid, jsonb) from public, anon;
revoke execute on function public.cotacao_publica(uuid) from public;
revoke execute on function public.cotacao_responder(uuid, jsonb, jsonb) from public;
revoke execute on function public.cotacao_recusar(uuid, text, text) from public;
grant execute on function public.fornecimentos_reprocessar(int, int) to authenticated;
grant execute on function public.cotacao_marcar_enviada(uuid[]) to authenticated;
grant execute on function public.cotacao_gerar_pedidos(uuid, jsonb) to authenticated;
grant execute on function public.cotacao_publica(uuid) to anon, authenticated;
grant execute on function public.cotacao_responder(uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.cotacao_recusar(uuid, text, text) to anon, authenticated;
