-- =====================================================================
-- Produção (ficha técnica + ordens de produção), pedidos de compra de
-- peças (com cotação), frete (transportadoras e cotações) e lembretes
-- de manutenção.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cadastros de apoio
-- ---------------------------------------------------------------------
alter table public.produtos
  add column fornecedor_padrao_id uuid references public.fornecedores(id) on delete set null,
  add column peso_kg numeric(10,3),
  add column altura_cm numeric(8,1),
  add column largura_cm numeric(8,1),
  add column profundidade_cm numeric(8,1);

alter table public.fornecedores add column whatsapp text;

create table public.transportadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  contato text,
  whatsapp text,
  telefone text,
  email text,
  regioes text,           -- onde atende (texto livre: "SP, MG, GO")
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Ficha técnica: quais peças/insumos formam cada máquina
-- ---------------------------------------------------------------------
create table public.produto_componentes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,     -- a máquina
  componente_id uuid not null references public.produtos(id) on delete restrict, -- a peça
  quantidade numeric(12,3) not null check (quantidade > 0),
  unique (produto_id, componente_id),
  check (produto_id <> componente_id)
);

-- ---------------------------------------------------------------------
-- Ordens de produção
-- ---------------------------------------------------------------------
create table public.ordens_producao (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  produto_id uuid not null references public.produtos(id),
  quantidade numeric(12,3) not null check (quantidade > 0),
  status text not null default 'planejada'
    check (status in ('planejada', 'em_producao', 'concluida', 'cancelada')),
  previsao date,
  responsavel text,
  numeros_serie text,     -- séries das máquinas montadas, separadas por vírgula
  observacoes text,
  concluida_em timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pedidos de compra (peças para produção e reposição)
-- ---------------------------------------------------------------------
create table public.pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  fornecedor_id uuid references public.fornecedores(id),
  ordem_producao_id uuid references public.ordens_producao(id) on delete set null,
  status text not null default 'cotacao'
    check (status in ('cotacao', 'enviado', 'parcial', 'recebido', 'cancelado')),
  previsao_entrega date,
  condicao_pagamento text,
  frete numeric(12,2) not null default 0,
  valor_total numeric(12,2) not null default 0,
  observacoes text,
  enviado_em timestamptz,
  recebido_em timestamptz,
  created_at timestamptz not null default now()
);

create table public.pedido_compra_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_compra_id uuid not null references public.pedidos_compra(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  descricao text not null,
  quantidade numeric(12,3) not null check (quantidade > 0),
  custo_unitario numeric(12,2) not null default 0,
  quantidade_recebida numeric(12,3) not null default 0
);
create index on public.pedido_compra_itens (pedido_compra_id);

create or replace function public.trg_pedido_compra_total()
returns trigger language plpgsql as $$
begin
  update public.pedidos_compra pc
     set valor_total = coalesce((select sum(round(quantidade * custo_unitario, 2)) from public.pedido_compra_itens where pedido_compra_id = pc.id), 0) + pc.frete
   where pc.id = coalesce(new.pedido_compra_id, old.pedido_compra_id);
  return null;
end $$;

create trigger trg_pedido_compra_itens_total
after insert or update or delete on public.pedido_compra_itens
for each row execute function public.trg_pedido_compra_total();

create or replace function public.trg_pedido_compra_frete()
returns trigger language plpgsql as $$
begin
  new.valor_total := coalesce((select sum(round(quantidade * custo_unitario, 2)) from public.pedido_compra_itens where pedido_compra_id = new.id), 0) + new.frete;
  return new;
end $$;

create trigger trg_pedido_compra_frete
before update of frete on public.pedidos_compra
for each row execute function public.trg_pedido_compra_frete();

-- Necessidade de peças de uma OP: o que a ficha técnica pede x o que há em estoque
-- (descontando o que já está reservado por outras OPs em aberto e o que já foi pedido aos fornecedores).
create or replace view public.necessidade_producao
with (security_invoker = true) as
select
  op.id as ordem_id,
  c.componente_id,
  p.descricao,
  p.unidade,
  p.fornecedor_padrao_id,
  p.preco_custo,
  c.quantidade * op.quantidade as necessario,
  p.estoque_atual,
  coalesce((
    select sum(c2.quantidade * op2.quantidade)
      from public.ordens_producao op2
      join public.produto_componentes c2 on c2.produto_id = op2.produto_id and c2.componente_id = c.componente_id
     where op2.status in ('planejada', 'em_producao') and op2.id <> op.id and op2.created_at < op.created_at
  ), 0) as reservado_outras_op,
  coalesce((
    select sum(i.quantidade - i.quantidade_recebida)
      from public.pedido_compra_itens i
      join public.pedidos_compra pc on pc.id = i.pedido_compra_id
     where i.produto_id = c.componente_id and pc.status in ('cotacao', 'enviado', 'parcial')
  ), 0) as a_caminho
from public.ordens_producao op
join public.produto_componentes c on c.produto_id = op.produto_id
join public.produtos p on p.id = c.componente_id;

-- Recebe (total ou parcial) um pedido de compra: entrada no estoque e atualização do custo.
-- p_itens: [{ item_id, quantidade }]  (quantidade recebida agora)
create or replace function public.receber_pedido_compra(p_pedido uuid, p_itens jsonb, p_gerar_conta boolean default false, p_vencimento date default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_pc public.pedidos_compra;
  v_it jsonb;
  v_item public.pedido_compra_itens;
  v_qtd numeric;
  v_valor numeric := 0;
  v_status text;
begin
  perform public.exigir_papel('financeiro');
  select * into v_pc from public.pedidos_compra where id = p_pedido for update;
  if not found then raise exception 'pedido de compra não encontrado'; end if;
  if v_pc.status in ('recebido', 'cancelado') then raise exception 'pedido já finalizado'; end if;

  for v_it in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_it->>'quantidade')::numeric, 0);
    continue when v_qtd <= 0;
    select * into v_item from public.pedido_compra_itens where id = (v_it->>'item_id')::uuid and pedido_compra_id = p_pedido for update;
    if not found then raise exception 'item inválido'; end if;
    if v_item.quantidade_recebida + v_qtd > v_item.quantidade then
      raise exception 'quantidade recebida maior que a pedida em %', v_item.descricao;
    end if;
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
    values (v_item.produto_id, 'entrada', v_qtd, 'Pedido de compra #' || v_pc.numero, 'pedido_compra', p_pedido);
    if v_item.custo_unitario > 0 then
      update public.produtos set preco_custo = v_item.custo_unitario where id = v_item.produto_id;
    end if;
    update public.pedido_compra_itens set quantidade_recebida = quantidade_recebida + v_qtd where id = v_item.id;
    v_valor := v_valor + round(v_qtd * v_item.custo_unitario, 2);
  end loop;

  v_status := case when exists (select 1 from public.pedido_compra_itens where pedido_compra_id = p_pedido and quantidade_recebida < quantidade)
                   then 'parcial' else 'recebido' end;
  update public.pedidos_compra
     set status = v_status, recebido_em = case when v_status = 'recebido' then now() else recebido_em end
   where id = p_pedido;

  if p_gerar_conta and v_valor > 0 then
    insert into public.contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento)
    values ('Pedido de compra #' || v_pc.numero, v_pc.fornecedor_id, 'fornecedores', 'PC ' || v_pc.numero,
            v_valor + case when v_status = 'recebido' then v_pc.frete else 0 end, coalesce(p_vencimento, current_date + 30));
  end if;
  return v_status;
end $$;

-- Conclui a OP: confere e baixa as peças da ficha técnica e dá entrada nas máquinas montadas.
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
  if not exists (select 1 from public.produto_componentes where produto_id = v_op.produto_id) then
    raise exception 'cadastre a ficha técnica da máquina antes de concluir a produção';
  end if;

  select string_agg(p.descricao || ' (falta ' || (c.quantidade * v_op.quantidade - p.estoque_atual) || ')', ', ')
    into v_faltas
    from public.produto_componentes c join public.produtos p on p.id = c.componente_id
   where c.produto_id = v_op.produto_id and p.estoque_atual < c.quantidade * v_op.quantidade;
  if v_faltas is not null then raise exception 'peças insuficientes no estoque: %', v_faltas; end if;

  for v_c in select * from public.produto_componentes where produto_id = v_op.produto_id loop
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
    values (v_c.componente_id, 'saida', v_c.quantidade * v_op.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem);
  end loop;
  insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
  values (v_op.produto_id, 'entrada', v_op.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.numeros_serie);

  -- custo da máquina = soma do custo atual das peças da ficha técnica
  update public.produtos set preco_custo = (
    select coalesce(sum(c.quantidade * p.preco_custo), 0)
      from public.produto_componentes c join public.produtos p on p.id = c.componente_id
     where c.produto_id = v_op.produto_id)
   where id = v_op.produto_id;

  update public.ordens_producao set status = 'concluida', concluida_em = now() where id = p_ordem;
end $$;

-- ---------------------------------------------------------------------
-- Frete das vendas: cotações e envio
-- ---------------------------------------------------------------------
create table public.cotacoes_frete (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  transportadora_id uuid references public.transportadoras(id),
  transportadora_nome text,      -- quando não cadastrada (ex.: Correios, motoboy)
  valor numeric(12,2) not null check (valor >= 0),
  prazo_dias int,
  observacoes text,
  escolhida boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.cotacoes_frete (pedido_id);

alter table public.pedidos
  add column transportadora_id uuid references public.transportadoras(id),
  add column codigo_rastreio text,
  add column enviado_em date,
  add column volumes int,
  add column peso_total_kg numeric(10,3);

-- Escolher uma cotação aplica transportadora e valor do frete ao pedido (enquanto orçamento).
create or replace function public.escolher_cotacao_frete(p_cotacao uuid, p_cobrar_cliente boolean default true)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_c public.cotacoes_frete;
  v_ped public.pedidos;
begin
  perform public.exigir_papel('vendas');
  select * into v_c from public.cotacoes_frete where id = p_cotacao;
  if not found then raise exception 'cotação não encontrada'; end if;
  select * into v_ped from public.pedidos where id = v_c.pedido_id for update;
  update public.cotacoes_frete set escolhida = (id = p_cotacao) where pedido_id = v_c.pedido_id;
  update public.pedidos
     set transportadora_id = v_c.transportadora_id,
         frete = case when v_ped.status = 'orcamento' and p_cobrar_cliente then v_c.valor else frete end,
         modalidade_frete = case when p_cobrar_cliente then 0 else modalidade_frete end
   where id = v_c.pedido_id;
end $$;

-- ---------------------------------------------------------------------
-- Lembretes de manutenção (registro de cada contato com o cliente)
-- ---------------------------------------------------------------------
create table public.contatos_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  equipamento_id uuid references public.equipamentos(id) on delete cascade,
  tipo text not null default 'preventiva' check (tipo in ('preventiva', 'garantia', 'pos_venda', 'cobranca', 'outro')),
  canal text not null default 'whatsapp',
  resultado text,               -- ex.: "agendou para 12/11", "não respondeu"
  proximo_contato date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.contatos_cliente (equipamento_id, created_at desc);

alter table public.equipamentos add column preventiva_agendada date;

-- Fila de lembretes: preventiva vencida ou nos próximos 15 dias, sem contato nos últimos 7 dias
create or replace view public.lembretes_manutencao
with (security_invoker = true) as
select e.*, c.nome as cliente_nome, c.whatsapp as cliente_whatsapp,
       (select max(created_at)::date from public.contatos_cliente cc where cc.equipamento_id = e.id) as ultimo_lembrete
  from public.equipamentos e
  join public.clientes c on c.id = e.cliente_id
 where e.proxima_preventiva is not null
   and e.proxima_preventiva <= current_date + 15
   and (e.preventiva_agendada is null or e.preventiva_agendada < current_date)
   and not exists (
     select 1 from public.contatos_cliente cc
      where cc.equipamento_id = e.id
        and (cc.created_at > now() - interval '7 days' or cc.proximo_contato > current_date)
   );

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- tabela, quem lê (null = todos do ERP), quem grava, quem apaga (null = só admin)
  for r in select * from (values
    ('transportadoras',     null,                         '{vendas,financeiro}', null),
    ('produto_componentes', null,                         '{financeiro,tecnico}', '{financeiro,tecnico}'),
    ('ordens_producao',     null,                         '{financeiro,tecnico}', null),
    ('pedidos_compra',      '{financeiro,tecnico}',       '{financeiro,tecnico}', null),
    ('pedido_compra_itens', '{financeiro,tecnico}',       '{financeiro,tecnico}', '{financeiro,tecnico}'),
    ('cotacoes_frete',      '{vendas,financeiro}',        '{vendas}',             '{vendas}'),
    ('contatos_cliente',    null,                         '{vendas,financeiro,tecnico}', null)
  ) as t(tabela, leitura, escrita, exclusao) loop
    execute format('alter table public.%I enable row level security', r.tabela);
    execute format('create policy "erp_select" on public.%I for select to authenticated using (%s)', r.tabela,
      case when r.leitura is null then 'public.is_erp_user()' else format('public.tem_papel(variadic %L::text[])', r.leitura) end);
    execute format('create policy "erp_insert" on public.%I for insert to authenticated with check (public.tem_papel(variadic %L::text[]))', r.tabela, r.escrita);
    execute format('create policy "erp_update" on public.%I for update to authenticated using (public.tem_papel(variadic %L::text[])) with check (public.tem_papel(variadic %L::text[]))', r.tabela, r.escrita, r.escrita);
    execute format('create policy "erp_delete" on public.%I for delete to authenticated using (%s)', r.tabela,
      case when r.exclusao is null then 'public.is_erp_admin()' else format('public.tem_papel(variadic %L::text[])', r.exclusao) end);
  end loop;
end $$;

revoke execute on function public.receber_pedido_compra(uuid, jsonb, boolean, date) from public, anon;
revoke execute on function public.concluir_producao(uuid) from public, anon;
revoke execute on function public.escolher_cotacao_frete(uuid, boolean) from public, anon;
grant execute on function public.receber_pedido_compra(uuid, jsonb, boolean, date) to authenticated;
grant execute on function public.concluir_producao(uuid) to authenticated;
grant execute on function public.escolher_cotacao_frete(uuid, boolean) to authenticated;
