-- =====================================================================
-- ERP MF Máquinas — schema inicial
-- Módulos: cadastros, estoque, vendas/pedidos, assistência técnica,
-- financeiro (contas a receber/pagar), notas fiscais
-- (emitidas e recebidas de fornecedores).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Usuários do ERP e controle de acesso
-- ---------------------------------------------------------------------
create table public.usuarios_erp (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel text not null default 'vendas'
    check (papel in ('admin', 'vendas', 'financeiro', 'tecnico')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_erp_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuarios_erp
    where user_id = auth.uid() and ativo
  );
$$;

create or replace function public.is_erp_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuarios_erp
    where user_id = auth.uid() and ativo and papel = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Configurações da empresa (linha única, id = 1)
-- ---------------------------------------------------------------------
create table public.configuracoes (
  id int primary key default 1 check (id = 1),
  razao_social text not null default 'MF Máquinas',
  nome_fantasia text default 'MF Máquinas',
  cnpj text,
  inscricao_estadual text,
  uf text,
  municipio text,
  whatsapp text,
  -- Fiscal (valide com o contador!)
  regime_tributario int not null default 1, -- 1 Simples Nacional, 3 Regime Normal
  natureza_operacao text not null default 'Venda de mercadoria',
  cfop_padrao text not null default '5102',
  icms_situacao_padrao text not null default '102', -- CSOSN (Simples) ou CST
  pis_situacao_padrao text not null default '49',
  cofins_situacao_padrao text not null default '49',
  presenca_comprador int not null default 9,
  -- Cobrança
  dias_vencimento_boleto int not null default 3,
  multa_percentual numeric(5,2) not null default 2,
  juros_percentual_mes numeric(5,2) not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.configuracoes (id) values (1);

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa text not null default 'PF' check (tipo_pessoa in ('PF', 'PJ')),
  nome text not null,
  cpf_cnpj text,
  inscricao_estadual text,
  contribuinte_icms int not null default 9, -- 1 contribuinte, 2 isento, 9 não contribuinte
  email text,
  telefone text,
  whatsapp text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  municipio text,
  uf text,
  observacoes text,
  created_at timestamptz not null default now()
);
create unique index clientes_cpf_cnpj_key on public.clientes (cpf_cnpj) where cpf_cnpj is not null and cpf_cnpj <> '';

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  inscricao_estadual text,
  email text,
  telefone text,
  municipio text,
  uf text,
  observacoes text,
  created_at timestamptz not null default now()
);
create unique index fornecedores_cnpj_key on public.fornecedores (cnpj) where cnpj is not null and cnpj <> '';

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  descricao text not null,
  tipo text not null default 'maquina' check (tipo in ('maquina', 'peca', 'acessorio', 'insumo')),
  unidade text not null default 'UN',
  ncm text,
  cest text,
  cfop text,               -- vazio = usa o padrão da configuração
  origem int not null default 0,
  icms_situacao text,      -- vazio = usa o padrão da configuração
  preco_custo numeric(12,2) not null default 0,
  preco_venda numeric(12,2) not null default 0,
  estoque_atual numeric(12,3) not null default 0,
  estoque_minimo numeric(12,3) not null default 0,
  localizacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Estoque
-- ---------------------------------------------------------------------
create table public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  quantidade numeric(12,3) not null check (quantidade <> 0),
  motivo text,
  referencia_tipo text, -- 'pedido' | 'os' | 'nfe_recebida' | 'manual'
  referencia_id uuid,
  numero_serie text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.estoque_movimentos (produto_id, created_at desc);

-- entrada soma, saída subtrai, ajuste usa o sinal informado
create or replace function public.aplicar_movimento_estoque()
returns trigger language plpgsql as $$
begin
  update public.produtos
     set estoque_atual = estoque_atual + case new.tipo
       when 'entrada' then abs(new.quantidade)
       when 'saida' then -abs(new.quantidade)
       else new.quantidade end
   where id = new.produto_id;
  return new;
end $$;

create trigger trg_aplicar_movimento_estoque
after insert on public.estoque_movimentos
for each row execute function public.aplicar_movimento_estoque();

-- ---------------------------------------------------------------------
-- Vendas / pedidos (origem WhatsApp por padrão)
-- ---------------------------------------------------------------------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  cliente_id uuid not null references public.clientes(id),
  origem text not null default 'whatsapp',
  status text not null default 'orcamento'
    check (status in ('orcamento', 'aprovado', 'faturado', 'entregue', 'cancelado')),
  vendedor text,
  forma_pagamento text not null default 'boleto'
    check (forma_pagamento in ('boleto', 'pix', 'cartao', 'dinheiro', 'transferencia')),
  parcelas int not null default 1 check (parcelas between 1 and 24),
  primeiro_vencimento date,
  intervalo_dias int not null default 30,
  modalidade_frete int not null default 9, -- 0 emitente, 1 destinatário, 9 sem frete
  valor_produtos numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  frete numeric(12,2) not null default 0,
  valor_total numeric(12,2) not null default 0,
  observacoes text,
  aprovado_em timestamptz,
  estoque_baixado boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  descricao text not null,
  quantidade numeric(12,3) not null check (quantidade > 0),
  valor_unitario numeric(12,2) not null check (valor_unitario >= 0),
  valor_total numeric(12,2) generated always as (round(quantidade * valor_unitario, 2)) stored,
  numero_serie text
);
create index on public.pedido_itens (pedido_id);

create or replace function public.recalcular_pedido(p_pedido uuid)
returns void language sql as $$
  update public.pedidos p
     set valor_produtos = coalesce((select sum(valor_total) from public.pedido_itens where pedido_id = p.id), 0)
   where p.id = p_pedido;
$$;

create or replace function public.trg_itens_pedido_recalc()
returns trigger language plpgsql as $$
begin
  perform public.recalcular_pedido(coalesce(new.pedido_id, old.pedido_id));
  return null;
end $$;

create trigger trg_pedido_itens_recalc
after insert or update or delete on public.pedido_itens
for each row execute function public.trg_itens_pedido_recalc();

create or replace function public.trg_pedido_total()
returns trigger language plpgsql as $$
begin
  new.valor_total := greatest(new.valor_produtos - new.desconto + new.frete, 0);
  return new;
end $$;

create trigger trg_pedido_total
before insert or update on public.pedidos
for each row execute function public.trg_pedido_total();

-- ---------------------------------------------------------------------
-- Assistência técnica (ordens de serviço)
-- ---------------------------------------------------------------------
create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  cliente_id uuid not null references public.clientes(id),
  produto_id uuid references public.produtos(id),
  equipamento text not null,
  numero_serie text,
  defeito_relatado text not null,
  diagnostico text,
  solucao text,
  status text not null default 'aberta'
    check (status in ('aberta', 'em_diagnostico', 'aguardando_aprovacao', 'aguardando_peca',
                      'em_reparo', 'concluida', 'entregue', 'cancelada')),
  em_garantia boolean not null default false,
  tecnico text,
  valor_mao_obra numeric(12,2) not null default 0,
  valor_pecas numeric(12,2) not null default 0,
  valor_total numeric(12,2) not null default 0,
  data_entrada date not null default current_date,
  previsao date,
  concluida_em timestamptz,
  estoque_baixado boolean not null default false,
  observacoes text,
  created_at timestamptz not null default now()
);

create table public.os_itens (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  descricao text not null,
  quantidade numeric(12,3) not null check (quantidade > 0),
  valor_unitario numeric(12,2) not null default 0,
  valor_total numeric(12,2) generated always as (round(quantidade * valor_unitario, 2)) stored
);
create index on public.os_itens (os_id);

create or replace function public.trg_os_itens_recalc()
returns trigger language plpgsql as $$
begin
  update public.ordens_servico o
     set valor_pecas = coalesce((select sum(valor_total) from public.os_itens where os_id = o.id), 0)
   where o.id = coalesce(new.os_id, old.os_id);
  return null;
end $$;

create trigger trg_os_itens_recalc
after insert or update or delete on public.os_itens
for each row execute function public.trg_os_itens_recalc();

create or replace function public.trg_os_total()
returns trigger language plpgsql as $$
begin
  new.valor_total := case when new.em_garantia then 0 else new.valor_mao_obra + new.valor_pecas end;
  return new;
end $$;

create trigger trg_os_total
before insert or update on public.ordens_servico
for each row execute function public.trg_os_total();

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create table public.contas_receber (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  cliente_id uuid references public.clientes(id),
  pedido_id uuid references public.pedidos(id) on delete set null,
  os_id uuid references public.ordens_servico(id) on delete set null,
  parcela int not null default 1,
  total_parcelas int not null default 1,
  valor numeric(12,2) not null check (valor > 0),
  vencimento date not null,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  forma_pagamento text not null default 'boleto',
  data_pagamento date,
  valor_pago numeric(12,2),
  created_at timestamptz not null default now()
);
create index on public.contas_receber (vencimento) where status = 'aberto';

create table public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  fornecedor_id uuid references public.fornecedores(id),
  categoria text not null default 'fornecedores',
  documento text,
  valor numeric(12,2) not null check (valor > 0),
  vencimento date not null,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  data_pagamento date,
  valor_pago numeric(12,2),
  nfe_recebida_id uuid,
  observacoes text,
  created_at timestamptz not null default now()
);
create index on public.contas_pagar (vencimento) where status = 'aberto';

-- ---------------------------------------------------------------------
-- Notas fiscais emitidas (NF-e modelo 55)
-- ---------------------------------------------------------------------
create table public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id),
  referencia text not null unique,
  status text not null default 'processando'
    check (status in ('processando', 'autorizada', 'erro', 'cancelada')),
  numero text,
  serie text,
  chave text,
  valor_total numeric(12,2),
  xml_url text,
  danfe_url text,
  mensagem text,
  payload jsonb,
  resposta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- NF-e recebidas de fornecedores (Manifestação do Destinatário)
-- ---------------------------------------------------------------------
create table public.nfe_recebidas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  emitente_nome text,
  emitente_cnpj text,
  valor_total numeric(12,2),
  data_emissao timestamptz,
  situacao text,          -- autorizada | cancelada | denegada
  manifestacao text,      -- ciencia | confirmacao | desconhecimento | nao_realizada
  nfe_completa boolean not null default false,
  versao bigint,
  fornecedor_id uuid references public.fornecedores(id),
  conta_pagar_id uuid references public.contas_pagar(id) on delete set null,
  dados jsonb,
  created_at timestamptz not null default now()
);

alter table public.contas_pagar
  add constraint contas_pagar_nfe_fk foreign key (nfe_recebida_id)
  references public.nfe_recebidas(id) on delete set null;

create table public.sync_estado (
  chave text primary key,
  valor text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Regras de negócio (RPC)
-- ---------------------------------------------------------------------

-- Aprova o pedido: baixa estoque e gera as parcelas em contas a receber.
create or replace function public.aprovar_pedido(p_pedido uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ped public.pedidos;
  v_item record;
  v_parcela int;
  v_valor_parcela numeric(12,2);
  v_primeiro date;
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;

  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status <> 'orcamento' then raise exception 'só orçamentos podem ser aprovados'; end if;
  if v_ped.valor_total <= 0 then raise exception 'pedido sem itens'; end if;

  for v_item in select * from public.pedido_itens where pedido_id = p_pedido loop
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
    values (v_item.produto_id, 'saida', v_item.quantidade, 'Pedido #' || v_ped.numero, 'pedido', p_pedido, v_item.numero_serie);
  end loop;

  v_primeiro := coalesce(v_ped.primeiro_vencimento,
    current_date + (select dias_vencimento_boleto from public.configuracoes where id = 1));

  for v_parcela in 1..v_ped.parcelas loop
    v_valor_parcela := round(v_ped.valor_total / v_ped.parcelas, 2);
    if v_parcela = v_ped.parcelas then
      v_valor_parcela := v_ped.valor_total - round(v_ped.valor_total / v_ped.parcelas, 2) * (v_ped.parcelas - 1);
    end if;
    insert into public.contas_receber (descricao, cliente_id, pedido_id, parcela, total_parcelas, valor, vencimento, forma_pagamento)
    values ('Pedido #' || v_ped.numero || ' - parcela ' || v_parcela || '/' || v_ped.parcelas,
            v_ped.cliente_id, p_pedido, v_parcela, v_ped.parcelas, v_valor_parcela,
            v_primeiro + (v_parcela - 1) * v_ped.intervalo_dias, v_ped.forma_pagamento);
  end loop;

  update public.pedidos set status = 'aprovado', aprovado_em = now(), estoque_baixado = true where id = p_pedido;
end $$;

-- Cancela o pedido: devolve estoque e cancela parcelas em aberto sem boleto pago.
create or replace function public.cancelar_pedido(p_pedido uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ped public.pedidos;
  v_item record;
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;

  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status = 'cancelado' then return; end if;
  if exists (select 1 from public.notas_fiscais where pedido_id = p_pedido and status = 'autorizada') then
    raise exception 'pedido possui NF-e autorizada; cancele a nota antes';
  end if;
  if exists (select 1 from public.contas_receber where pedido_id = p_pedido and status = 'pago') then
    raise exception 'pedido possui parcelas pagas; estorne antes de cancelar';
  end if;

  if v_ped.estoque_baixado then
    for v_item in select * from public.pedido_itens where pedido_id = p_pedido loop
      insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
      values (v_item.produto_id, 'entrada', v_item.quantidade, 'Cancelamento pedido #' || v_ped.numero, 'pedido', p_pedido, v_item.numero_serie);
    end loop;
  end if;

  update public.contas_receber set status = 'cancelado' where pedido_id = p_pedido and status = 'aberto';
  update public.pedidos set status = 'cancelado', estoque_baixado = false where id = p_pedido;
end $$;

-- Conclui a OS: baixa as peças do estoque e gera a cobrança (se fora da garantia).
create or replace function public.concluir_os(p_os uuid, p_vencimento date default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_os public.ordens_servico;
  v_item record;
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;

  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if v_os.status in ('concluida', 'entregue', 'cancelada') then raise exception 'OS já finalizada'; end if;

  if not v_os.estoque_baixado then
    for v_item in select * from public.os_itens where os_id = p_os loop
      insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
      values (v_item.produto_id, 'saida', v_item.quantidade, 'OS #' || v_os.numero, 'os', p_os, null);
    end loop;
  end if;

  if v_os.valor_total > 0 then
    insert into public.contas_receber (descricao, cliente_id, os_id, valor, vencimento, forma_pagamento)
    values ('Assistência técnica OS #' || v_os.numero, v_os.cliente_id, p_os, v_os.valor_total,
            coalesce(p_vencimento, current_date + (select dias_vencimento_boleto from public.configuracoes where id = 1)),
            'boleto');
  end if;

  update public.ordens_servico
     set status = 'concluida', concluida_em = now(), estoque_baixado = true
   where id = p_os;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security: somente usuários cadastrados em usuarios_erp
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'configuracoes', 'clientes', 'fornecedores', 'produtos', 'estoque_movimentos',
    'pedidos', 'pedido_itens', 'ordens_servico', 'os_itens', 'contas_receber',
    'contas_pagar', 'notas_fiscais', 'nfe_recebidas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "erp_select" on public.%I for select to authenticated using (public.is_erp_user())', t);
    execute format('create policy "erp_insert" on public.%I for insert to authenticated with check (public.is_erp_user())', t);
    execute format('create policy "erp_update" on public.%I for update to authenticated using (public.is_erp_user()) with check (public.is_erp_user())', t);
    execute format('create policy "erp_delete" on public.%I for delete to authenticated using (public.is_erp_admin())', t);
  end loop;
end $$;

-- Itens de pedido/OS são regravados ao editar: qualquer usuário do ERP pode remover.
drop policy "erp_delete" on public.pedido_itens;
drop policy "erp_delete" on public.os_itens;
create policy "erp_delete" on public.pedido_itens for delete to authenticated using (
  public.is_erp_user() and exists (select 1 from public.pedidos p where p.id = pedido_id and p.status = 'orcamento')
);
create policy "erp_delete" on public.os_itens for delete to authenticated using (
  public.is_erp_user() and exists (
    select 1 from public.ordens_servico o where o.id = os_id and o.status not in ('concluida', 'entregue', 'cancelada')
  )
);

-- Movimentos de estoque são um histórico: não se altera nem se apaga.
drop policy "erp_update" on public.estoque_movimentos;
drop policy "erp_delete" on public.estoque_movimentos;

-- Notas fiscais são gravadas só pelas Edge Functions (service role).
drop policy "erp_insert" on public.notas_fiscais;
drop policy "erp_update" on public.notas_fiscais;
drop policy "erp_delete" on public.notas_fiscais;

alter table public.usuarios_erp enable row level security;
create policy "usuarios_select" on public.usuarios_erp for select to authenticated using (public.is_erp_user());
create policy "usuarios_admin" on public.usuarios_erp for all to authenticated
  using (public.is_erp_admin()) with check (public.is_erp_admin());

alter table public.sync_estado enable row level security;
-- (sem políticas: acesso apenas via service role)

revoke execute on function public.aprovar_pedido(uuid) from public, anon;
revoke execute on function public.cancelar_pedido(uuid) from public, anon;
revoke execute on function public.concluir_os(uuid, date) from public, anon;
grant execute on function public.aprovar_pedido(uuid) to authenticated;
grant execute on function public.cancelar_pedido(uuid) to authenticated;
grant execute on function public.concluir_os(uuid, date) to authenticated;
