-- =====================================================================
-- Matriz (SC) e filial (SP), lucro real
--   * cada unidade tem CNPJ, IE, endereço, série da NF-e, dados de pagamento e
--     regras fiscais próprias
--   * pedidos, OS, contas, notas, compras e produção pertencem a uma unidade
--   * estoque separado por unidade; mercadoria passa de uma para a outra
--     por transferência (com NF-e)
-- Os percentuais fiscais abaixo são pontos de partida: confirme com o contador.
-- =====================================================================

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,               -- 'SC', 'SP'
  nome text not null,                        -- 'Matriz SC'
  matriz boolean not null default false,
  ativo boolean not null default true,
  fabrica boolean not null default true,     -- produz máquinas (ordens de produção, IPI)
  assistencia boolean not null default true, -- abre OS
  razao_social text,
  cnpj text,
  inscricao_estadual text,
  inscricao_municipal text,
  logradouro text, numero text, complemento text, bairro text, municipio text, uf text, cep text,
  telefone text, whatsapp text, email text,
  instrucoes_pagamento text,                 -- Pix, banco, agência e conta (vai nos lembretes de vencimento)
  -- NF-e
  serie_nfe int not null default 1,
  regime_tributario int not null default 3,                    -- 3 = regime normal (lucro real)
  natureza_operacao text not null default 'Venda de mercadoria',
  cfop_venda_producao text not null default '5101',           -- máquina fabricada nesta unidade
  cfop_venda_revenda text not null default '5102',            -- peças, acessórios e máquinas vindas da outra unidade
  icms_cst text not null default '00',
  icms_aliquota_interna numeric(5,2) not null default 17,
  icms_reducao_base numeric(5,2) not null default 0,          -- % de redução da base (se houver benefício)
  pis_cst text not null default '01',
  pis_aliquota numeric(5,2) not null default 1.65,
  cofins_cst text not null default '01',
  cofins_aliquota numeric(5,2) not null default 7.60,
  pis_cofins_exclui_icms boolean not null default true,       -- ICMS fora da base (Tema 69 do STF)
  ipi_cst text not null default '50',
  ipi_enquadramento text not null default '999',
  difal_ativo boolean not null default true,                  -- venda interestadual para consumidor final
  -- transferência entre unidades
  transf_icms_cst text not null default '41',                 -- sem ICMS (LC 204/2023); use 00 para destacar o crédito
  transf_pis_cofins_cst text not null default '08',
  transf_destacar_ipi boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index unidades_uma_matriz on public.unidades (matriz) where matriz;

insert into public.unidades (codigo, nome, matriz, razao_social, cnpj, inscricao_estadual, municipio, uf, telefone, whatsapp, email,
                             natureza_operacao, icms_aliquota_interna)
select 'SC', 'Matriz SC', true, razao_social, cnpj, inscricao_estadual, municipio, coalesce(uf, 'SC'), telefone, whatsapp, email,
       natureza_operacao, 17
  from public.configuracoes where id = 1;
insert into public.unidades (codigo, nome, matriz, uf, icms_aliquota_interna, natureza_operacao)
values ('SP', 'Filial SP', false, 'SP', 18, 'Venda de mercadoria');

update public.configuracoes set regime_tributario = 3, icms_situacao_padrao = '00', pis_situacao_padrao = '01', cofins_situacao_padrao = '01';

create or replace function public.unidade_matriz()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.unidades where matriz limit 1;
$$;
grant execute on function public.unidade_matriz() to authenticated;

-- Alíquota interna de ICMS e FCP de cada UF (para o DIFAL). Mantenha atualizada com o contador.
create table public.icms_uf (
  uf text primary key,
  aliquota_interna numeric(5,2) not null,
  fcp numeric(5,2) not null default 0
);
insert into public.icms_uf (uf, aliquota_interna, fcp) values
  ('AC',19,0),('AL',19,1),('AM',20,0),('AP',18,0),('BA',19.5,1),('CE',20,0),('DF',20,0),('ES',17,0),('GO',19,0),
  ('MA',23,0),('MG',18,0),('MS',17,0),('MT',17,0),('PA',19,0),('PB',20,0),('PE',20.5,0),('PI',22.5,0),('PR',19.5,0),
  ('RJ',20,2),('RN',20,0),('RO',19.5,0),('RR',20,0),('RS',17,0),('SC',17,0),('SE',19,1),('SP',18,0),('TO',20,0);

alter table public.produtos add column ipi_aliquota numeric(5,2);   -- da TIPI pelo NCM (vazio = sem IPI)

-- ---------------------------------------------------------------------
-- Unidade em cada documento
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pedidos', 'ordens_servico', 'contas_receber', 'contas_pagar', 'notas_fiscais',
                           'nfe_recebidas', 'estoque_movimentos', 'ordens_producao', 'pedidos_compra', 'equipamentos'] loop
    execute format('alter table public.%I add column unidade_id uuid references public.unidades(id)', t);
    execute format('update public.%I set unidade_id = public.unidade_matriz()', t);
    execute format('create index on public.%I (unidade_id)', t);
  end loop;
end $$;

alter table public.usuarios_erp add column unidade_id uuid references public.unidades(id);  -- unidade padrão da pessoa

-- Preenche a unidade pelo documento de origem; sem origem, usa a matriz
create or replace function public.trg_unidade_documento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.unidade_id is not null then return new; end if;
  case tg_table_name
    when 'contas_receber' then
      new.unidade_id := coalesce((select unidade_id from pedidos where id = new.pedido_id),
                                 (select unidade_id from ordens_servico where id = new.os_id));
    when 'contas_pagar' then
      new.unidade_id := (select unidade_id from nfe_recebidas where id = new.nfe_recebida_id);
    when 'notas_fiscais' then
      new.unidade_id := (select unidade_id from pedidos where id = new.pedido_id);
    when 'equipamentos' then
      new.unidade_id := (select unidade_id from pedidos where id = new.pedido_id);
    when 'estoque_movimentos' then
      new.unidade_id := case new.referencia_tipo
        when 'pedido' then (select unidade_id from pedidos where id = new.referencia_id)
        when 'os' then (select unidade_id from ordens_servico where id = new.referencia_id)
        when 'nfe_recebida' then (select unidade_id from nfe_recebidas where id = new.referencia_id)
        when 'pedido_compra' then (select unidade_id from pedidos_compra where id = new.referencia_id)
        when 'producao' then (select unidade_id from ordens_producao where id = new.referencia_id)
        else null end;
    else null;
  end case;
  -- sem documento de origem: unidade escolhida pela pessoa no ERP; por último, a matriz
  new.unidade_id := coalesce(new.unidade_id,
    (select unidade_id from usuarios_erp where user_id = auth.uid()), public.unidade_matriz());
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['pedidos', 'ordens_servico', 'contas_receber', 'contas_pagar', 'notas_fiscais',
                           'nfe_recebidas', 'estoque_movimentos', 'ordens_producao', 'pedidos_compra', 'equipamentos'] loop
    execute format('create trigger trg_unidade_documento before insert on public.%I for each row execute function public.trg_unidade_documento()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Estoque por unidade (produtos.estoque_atual continua sendo o total)
-- ---------------------------------------------------------------------
create table public.estoque_unidade (
  produto_id uuid not null references public.produtos(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id),
  quantidade numeric(12,3) not null default 0,
  primary key (produto_id, unidade_id)
);
insert into public.estoque_unidade (produto_id, unidade_id, quantidade)
select id, public.unidade_matriz(), estoque_atual from public.produtos where estoque_atual <> 0;

create or replace function public.aplicar_movimento_estoque()
returns trigger language plpgsql as $$
declare d numeric := case new.tipo when 'entrada' then abs(new.quantidade) when 'saida' then -abs(new.quantidade) else new.quantidade end;
begin
  update public.produtos set estoque_atual = estoque_atual + d where id = new.produto_id;
  insert into public.estoque_unidade (produto_id, unidade_id, quantidade) values (new.produto_id, new.unidade_id, d)
  on conflict (produto_id, unidade_id) do update set quantidade = public.estoque_unidade.quantidade + excluded.quantidade;
  return new;
end $$;

create or replace function public.estoque_na_unidade(p_produto uuid, p_unidade uuid)
returns numeric language sql stable as $$
  select coalesce((select quantidade from public.estoque_unidade where produto_id = p_produto and unidade_id = p_unidade), 0);
$$;

-- Necessidade de peças: estoque, reservas e compras da unidade da OP
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
  public.estoque_na_unidade(c.componente_id, op.unidade_id)::numeric(12,3) as estoque_atual,
  coalesce((
    select sum(c2.quantidade * op2.quantidade)
      from public.ordens_producao op2
      join public.produto_componentes c2 on c2.produto_id = op2.produto_id and c2.componente_id = c.componente_id
     where op2.status in ('planejada', 'em_producao') and op2.id <> op.id and op2.created_at < op.created_at
       and op2.unidade_id = op.unidade_id
  ), 0) as reservado_outras_op,
  coalesce((
    select sum(i.quantidade - i.quantidade_recebida)
      from public.pedido_compra_itens i
      join public.pedidos_compra pc on pc.id = i.pedido_compra_id
     where i.produto_id = c.componente_id and pc.status in ('cotacao', 'enviado', 'parcial') and pc.unidade_id = op.unidade_id
  ), 0) as a_caminho
from public.ordens_producao op
join public.produto_componentes c on c.produto_id = op.produto_id
join public.produtos p on p.id = c.componente_id;

-- Produção confere as peças no estoque da própria unidade
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

  select string_agg(p.descricao || ' (falta ' || trim_scale(c.quantidade * v_op.quantidade - public.estoque_na_unidade(p.id, v_op.unidade_id)) || ')', ', ')
    into v_faltas
    from public.produto_componentes c join public.produtos p on p.id = c.componente_id
   where c.produto_id = v_op.produto_id and public.estoque_na_unidade(p.id, v_op.unidade_id) < c.quantidade * v_op.quantidade;
  if v_faltas is not null then raise exception 'peças insuficientes no estoque desta unidade: %', v_faltas; end if;

  for v_c in select * from public.produto_componentes where produto_id = v_op.produto_id loop
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
    values (v_c.componente_id, 'saida', v_c.quantidade * v_op.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.unidade_id);
  end loop;
  insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
  values (v_op.produto_id, 'entrada', v_op.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.numeros_serie, v_op.unidade_id);

  update public.produtos set preco_custo = (
    select coalesce(sum(c.quantidade * p.preco_custo), 0)
      from public.produto_componentes c join public.produtos p on p.id = c.componente_id
     where c.produto_id = v_op.produto_id)
   where id = v_op.produto_id;

  update public.ordens_producao set status = 'concluida', concluida_em = now() where id = p_ordem;
end $$;

-- Conta a pagar do recebimento de compra fica na unidade da compra
create or replace function public.trg_conta_pagar_compra()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.documento like 'PC %' then
    new.unidade_id := coalesce(
      (select unidade_id from pedidos_compra where numero::text = substr(new.documento, 4) limit 1), new.unidade_id);
  end if;
  return new;
end $$;
create trigger trg_conta_pagar_compra before insert on public.contas_pagar
for each row execute function public.trg_conta_pagar_compra();

-- ---------------------------------------------------------------------
-- Transferências entre unidades
-- ---------------------------------------------------------------------
create table public.transferencias (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  origem_id uuid not null references public.unidades(id),
  destino_id uuid not null references public.unidades(id),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'recebida', 'cancelada')),
  observacoes text,
  enviada_em timestamptz,
  recebida_em timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (origem_id <> destino_id)
);

create table public.transferencia_itens (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references public.transferencias(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  descricao text not null,
  quantidade numeric(12,3) not null check (quantidade > 0),
  custo_unitario numeric(12,2) not null default 0,   -- valor na NF-e de transferência (custo)
  numero_serie text
);
create index on public.transferencia_itens (transferencia_id);

alter table public.notas_fiscais add column transferencia_id uuid references public.transferencias(id);

-- Envia: confere e baixa o estoque da origem (a mercadoria fica "em trânsito")
create or replace function public.enviar_transferencia(p_transf uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transferencias; v_i record; v_faltas text;
begin
  perform public.exigir_papel('financeiro', 'tecnico');
  select * into v_t from transferencias where id = p_transf for update;
  if not found then raise exception 'transferência não encontrada'; end if;
  if v_t.status <> 'rascunho' then raise exception 'só rascunhos podem ser enviados'; end if;
  if not exists (select 1 from transferencia_itens where transferencia_id = p_transf) then raise exception 'transferência sem itens'; end if;

  select string_agg(i.descricao || ' (tem ' || trim_scale(public.estoque_na_unidade(i.produto_id, v_t.origem_id)) || ')', ', ') into v_faltas
    from (select produto_id, min(descricao) descricao, sum(quantidade) q from transferencia_itens where transferencia_id = p_transf group by produto_id) i
   where public.estoque_na_unidade(i.produto_id, v_t.origem_id) < i.q;
  if v_faltas is not null then raise exception 'estoque insuficiente na origem: %', v_faltas; end if;

  for v_i in select * from transferencia_itens where transferencia_id = p_transf loop
    insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
    values (v_i.produto_id, 'saida', v_i.quantidade, 'Transferência #' || v_t.numero || ' (envio)', 'transferencia', p_transf, v_i.numero_serie, v_t.origem_id);
  end loop;
  update transferencias set status = 'enviada', enviada_em = now() where id = p_transf;
end $$;

-- Recebe: entrada no estoque do destino
create or replace function public.receber_transferencia(p_transf uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transferencias; v_i record;
begin
  perform public.exigir_papel('financeiro', 'tecnico');
  select * into v_t from transferencias where id = p_transf for update;
  if not found then raise exception 'transferência não encontrada'; end if;
  if v_t.status <> 'enviada' then raise exception 'só transferências enviadas podem ser recebidas'; end if;
  for v_i in select * from transferencia_itens where transferencia_id = p_transf loop
    insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
    values (v_i.produto_id, 'entrada', v_i.quantidade, 'Transferência #' || v_t.numero || ' (recebimento)', 'transferencia', p_transf, v_i.numero_serie, v_t.destino_id);
  end loop;
  update transferencias set status = 'recebida', recebida_em = now() where id = p_transf;
end $$;

-- Cancela: se já saiu, devolve ao estoque da origem
create or replace function public.cancelar_transferencia(p_transf uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transferencias; v_i record;
begin
  perform public.exigir_papel('financeiro', 'tecnico');
  select * into v_t from transferencias where id = p_transf for update;
  if not found then raise exception 'transferência não encontrada'; end if;
  if v_t.status in ('recebida', 'cancelada') then raise exception 'transferência já finalizada'; end if;
  if exists (select 1 from notas_fiscais where transferencia_id = p_transf and status = 'autorizada') then
    raise exception 'cancele a NF-e da transferência antes';
  end if;
  if v_t.status = 'enviada' then
    for v_i in select * from transferencia_itens where transferencia_id = p_transf loop
      insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
      values (v_i.produto_id, 'entrada', v_i.quantidade, 'Transferência #' || v_t.numero || ' (cancelada)', 'transferencia', p_transf, v_i.numero_serie, v_t.origem_id);
    end loop;
  end if;
  update transferencias set status = 'cancelada' where id = p_transf;
end $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
alter table public.unidades enable row level security;
create policy "erp_select" on public.unidades for select to authenticated using (public.is_erp_user());
create policy "erp_insert" on public.unidades for insert to authenticated with check (public.is_erp_admin());
create policy "erp_update" on public.unidades for update to authenticated using (public.is_erp_admin()) with check (public.is_erp_admin());

alter table public.icms_uf enable row level security;
create policy "erp_select" on public.icms_uf for select to authenticated using (public.is_erp_user());
create policy "erp_update" on public.icms_uf for update to authenticated using (public.is_erp_admin()) with check (public.is_erp_admin());

alter table public.estoque_unidade enable row level security;
create policy "erp_select" on public.estoque_unidade for select to authenticated using (public.is_erp_user());

alter table public.transferencias enable row level security;
create policy "erp_select" on public.transferencias for select to authenticated using (public.is_erp_user());
create policy "erp_insert" on public.transferencias for insert to authenticated with check (public.tem_papel('financeiro', 'tecnico'));
create policy "erp_update" on public.transferencias for update to authenticated
  using (public.tem_papel('financeiro', 'tecnico') and status = 'rascunho') with check (public.tem_papel('financeiro', 'tecnico'));
create policy "erp_delete" on public.transferencias for delete to authenticated using (public.tem_papel('financeiro', 'tecnico') and status = 'rascunho');

alter table public.transferencia_itens enable row level security;
create policy "erp_select" on public.transferencia_itens for select to authenticated using (public.is_erp_user());
create policy "erp_insert" on public.transferencia_itens for insert to authenticated with check (
  public.tem_papel('financeiro', 'tecnico') and exists (select 1 from public.transferencias t where t.id = transferencia_id and t.status = 'rascunho'));
create policy "erp_update" on public.transferencia_itens for update to authenticated using (
  public.tem_papel('financeiro', 'tecnico') and exists (select 1 from public.transferencias t where t.id = transferencia_id and t.status = 'rascunho'));
create policy "erp_delete" on public.transferencia_itens for delete to authenticated using (
  public.tem_papel('financeiro', 'tecnico') and exists (select 1 from public.transferencias t where t.id = transferencia_id and t.status = 'rascunho'));

revoke execute on function public.enviar_transferencia(uuid) from public, anon;
revoke execute on function public.receber_transferencia(uuid) from public, anon;
revoke execute on function public.cancelar_transferencia(uuid) from public, anon;
grant execute on function public.enviar_transferencia(uuid) to authenticated;
grant execute on function public.receber_transferencia(uuid) to authenticated;
grant execute on function public.cancelar_transferencia(uuid) to authenticated;


-- Unidade em que a pessoa está trabalhando (o seletor do ERP grava aqui)
create or replace function public.definir_minha_unidade(p_unidade uuid)
returns void language sql security definer set search_path = public as $$
  update public.usuarios_erp set unidade_id = p_unidade
   where user_id = auth.uid() and (p_unidade is null or exists (select 1 from public.unidades where id = p_unidade and ativo));
$$;
revoke execute on function public.definir_minha_unidade(uuid) from public, anon;
grant execute on function public.definir_minha_unidade(uuid) to authenticated;
