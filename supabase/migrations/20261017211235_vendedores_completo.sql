-- =====================================================================
-- Vendedor completo como no Tiny (e melhor)
--  * vendedores ganha nome fantasia, código, tipo de pessoa, contribuinte, endereço (CEP, rua, número, complemento,
--    bairro, cidade, UF), telefone, unidade (depósito), observações, terceirizado, "exige NF" e "ignorar linhas";
--  * liberacao_faturamento_pct: no vendedor por recebimento, a parte da comissão liberada na aprovação do pedido
--    (ex.: 50% no faturamento e o resto conforme as parcelas são pagas, como no Tiny); vazio = tudo no recebimento;
--  * ignorar_linhas: a comissão desse vendedor não segue as linhas de produto (vale o % dele e as regras dele);
--  * exige_nf (terceirizado): a conta a pagar da comissão leva a chave Pix do vendedor e só pode ser paga com o nº
--    da NF dele no documento.
-- Somente acréscimos; nenhum dado muda.
-- =====================================================================

set local lock_timeout = '10s';

alter table public.vendedores
  add column if not exists nome_fantasia text,
  add column if not exists codigo text,
  add column if not exists tipo_pessoa text,
  add column if not exists contribuinte text,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists municipio text,
  add column if not exists uf text,
  add column if not exists telefone text,
  add column if not exists unidade_id uuid references public.unidades(id) on delete set null,
  add column if not exists observacoes text,
  add column if not exists terceirizado boolean not null default false,
  add column if not exists exige_nf boolean not null default false,
  add column if not exists liberacao_faturamento_pct numeric,
  add column if not exists ignorar_linhas boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vendedores_tipo_pessoa_check') then
    alter table public.vendedores add constraint vendedores_tipo_pessoa_check check (tipo_pessoa is null or tipo_pessoa in ('fisica', 'juridica'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vendedores_contribuinte_check') then
    alter table public.vendedores add constraint vendedores_contribuinte_check check (contribuinte is null or contribuinte in ('nao_informado', 'contribuinte', 'isento', 'nao_contribuinte'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vendedores_liberacao_check') then
    alter table public.vendedores add constraint vendedores_liberacao_check check (liberacao_faturamento_pct is null or liberacao_faturamento_pct between 0 and 100);
  end if;
end $$;

comment on column public.vendedores.liberacao_faturamento_pct is 'Vendedor por recebimento: % da comissão liberado na aprovação do pedido; o resto sai conforme as parcelas são pagas (vazio = tudo no recebimento)';
comment on column public.vendedores.ignorar_linhas is 'A comissão não segue as linhas de produto (vale o % do vendedor e as regras por categoria dele)';
comment on column public.vendedores.terceirizado is 'Vendedor ou representante de fora (não é funcionário)';
comment on column public.vendedores.exige_nf is 'A comissão só é paga com a NF do vendedor (nº no documento da conta a pagar)';
comment on column public.vendedores.unidade_id is 'Unidade (depósito) de onde o vendedor vende';

create index if not exists vendedores_unidade_idx on public.vendedores (unidade_id) where unidade_id is not null;

-- ---------------------------------------------------------------------
-- Comissão: parte na aprovação e parte no recebimento
-- ---------------------------------------------------------------------
create or replace function public.lancar_comissao(p_pedido uuid, p_valor numeric, p_conta uuid, p_descricao text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_ped pedidos; v_vend vendedores; v_base numeric; v_pct numeric; v_parte numeric := 1; v_desc text := p_descricao;
begin
  select * into v_ped from pedidos where id = p_pedido;
  if v_ped.vendedor_id is null then return; end if;
  select * into v_vend from vendedores where id = v_ped.vendedor_id;
  v_pct := coalesce(v_ped.comissao_percentual, public.comissao_percentual_pedido(p_pedido), v_vend.percentual);
  if v_pct <= 0 or v_ped.valor_total <= 0 then return; end if;
  -- vendedor por recebimento com parte liberada no faturamento: a aprovação lança essa parte e cada parcela paga o resto
  if v_vend.base = 'recebimento' and coalesce(v_vend.liberacao_faturamento_pct, 0) > 0 then
    if p_conta is null then
      v_parte := v_vend.liberacao_faturamento_pct / 100;
      v_desc := p_descricao || ' · ' || trim_scale(v_vend.liberacao_faturamento_pct) || '% no faturamento';
    else
      v_parte := (100 - v_vend.liberacao_faturamento_pct) / 100;
      v_desc := p_descricao || ' · ' || trim_scale(100 - v_vend.liberacao_faturamento_pct) || '% no recebimento';
    end if;
    if v_parte <= 0 then return; end if;
  end if;
  v_base := round(p_valor * v_parte * case when v_vend.descontar_frete then greatest(v_ped.valor_total - v_ped.frete, 0) / v_ped.valor_total else 1 end, 2);
  insert into comissoes (vendedor_id, pedido_id, conta_receber_id, descricao, base, percentual, valor)
  values (v_vend.id, p_pedido, p_conta, v_desc, v_base, round(v_pct, 2), round(v_base * v_pct / 100, 2))
  on conflict (conta_receber_id) do nothing;
end $function$;

-- parte do faturamento: lançada quando o orçamento é aprovado (a aprovação já lança tudo do vendedor por faturamento)
create or replace function public.trg_comissao_liberacao_aprovacao()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.status = 'aprovado' and old.status = 'orcamento' and new.vendedor_id is not null
     and exists (select 1 from vendedores v where v.id = new.vendedor_id and v.base = 'recebimento' and coalesce(v.liberacao_faturamento_pct, 0) > 0)
     and not exists (select 1 from comissoes c where c.pedido_id = new.id and c.conta_receber_id is null and c.status <> 'cancelada') then
    perform public.lancar_comissao(new.id, new.valor_total, null, 'Pedido #' || new.numero);
  end if;
  return new;
end $function$;

create or replace trigger trg_comissao_liberacao_aprovacao after update of status on public.pedidos
  for each row execute function public.trg_comissao_liberacao_aprovacao();

create or replace function public.recalcular_comissoes_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_ped pedidos; v_vend vendedores; v_c record;
begin
  select * into v_ped from pedidos where id = p_pedido;
  update comissoes set status = 'cancelada', conta_receber_id = null
   where pedido_id = p_pedido and status = 'a_pagar' and conta_pagar_id is null;
  if v_ped.vendedor_id is null or v_ped.status not in ('aprovado', 'faturado', 'entregue') then return; end if;
  select * into v_vend from vendedores where id = v_ped.vendedor_id;
  if v_vend.base = 'faturamento' or coalesce(v_vend.liberacao_faturamento_pct, 0) > 0 then
    if not exists (select 1 from comissoes where pedido_id = p_pedido and conta_receber_id is null and status <> 'cancelada') then
      perform public.lancar_comissao(p_pedido, v_ped.valor_total, null, 'Pedido #' || v_ped.numero);
    end if;
  end if;
  if v_vend.base = 'recebimento' then
    for v_c in select id, coalesce(valor_pago, valor) as v, descricao from contas_receber where pedido_id = p_pedido and status = 'pago' loop
      if not exists (select 1 from comissoes where conta_receber_id = v_c.id) then
        perform public.lancar_comissao(p_pedido, v_c.v, v_c.id, coalesce(v_c.descricao, 'Parcela'));
      end if;
    end loop;
  end if;
end $function$;

-- ---------------------------------------------------------------------
-- Linhas de produto: o vendedor pode ficar fora delas
-- ---------------------------------------------------------------------
create or replace function public.comissao_percentual_produto(p_vendedor uuid, p_produto uuid, p_desconto numeric, p_padrao numeric)
returns numeric language sql stable security definer set search_path to 'public' as $function$
  with pr as (select categoria, linha_id from produtos where id = p_produto),
  c as (select lower(btrim(coalesce((select categoria from pr), ''))) as cat,
               lower(btrim(split_part(coalesce((select categoria from pr), ''), ' > ', 1))) as mae),
  v as (select coalesce((select ignorar_linhas from vendedores where id = p_vendedor), false) as sem_linhas)
  select coalesce(
    (select r.percentual from comissao_regras r, c where r.ativo and c.cat <> '' and r.vendedor_id = p_vendedor and lower(btrim(r.categoria)) = c.cat),
    (select r.percentual from comissao_regras r, c where r.ativo and c.mae <> '' and r.vendedor_id = p_vendedor and lower(btrim(r.categoria)) = c.mae),
    case when (select sem_linhas from v) then null else public.comissao_percentual_linha((select linha_id from pr), p_desconto) end,
    (select r.percentual from comissao_regras r, c where r.ativo and c.cat <> '' and r.vendedor_id is null and not (select sem_linhas from v) and lower(btrim(r.categoria)) = c.cat),
    (select r.percentual from comissao_regras r, c where r.ativo and c.mae <> '' and r.vendedor_id is null and not (select sem_linhas from v) and lower(btrim(r.categoria)) = c.mae),
    p_padrao);
$function$;

-- ---------------------------------------------------------------------
-- Pagamento da comissão: chave Pix do vendedor e NF do terceirizado
-- ---------------------------------------------------------------------
create or replace function public.gerar_pagamento_comissoes(p_ids uuid[], p_vencimento date)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_conta uuid; v_vend vendedores; v_vend_id uuid; v_total numeric; v_n int; v_unid uuid;
begin
  perform public.exigir_papel('financeiro');
  select min(vendedor_id::text)::uuid, sum(valor), count(*) into v_vend_id, v_total, v_n
    from comissoes where id = any(p_ids) and status = 'a_pagar' and conta_pagar_id is null;
  if v_total is null or v_total <= 0 then raise exception 'nenhuma comissão a pagar selecionada'; end if;
  if (select count(distinct vendedor_id) from comissoes where id = any(p_ids)) > 1 then raise exception 'escolha comissões de um vendedor por vez'; end if;
  select * into v_vend from vendedores where id = v_vend_id;
  select case when count(distinct p.unidade_id) = 1 then min(p.unidade_id::text)::uuid else coalesce(v_vend.unidade_id, public.unidade_matriz()) end into v_unid
    from comissoes c join pedidos p on p.id = c.pedido_id where c.id = any(p_ids);
  insert into contas_pagar (descricao, categoria, valor, vencimento, unidade_id, observacoes, chave_pix)
  values ('Comissão ' || v_vend.nome || ' (' || v_n || ' lançamento' || case when v_n > 1 then 's' else '' end || ')', 'comissoes', v_total,
          coalesce(p_vencimento, current_date), v_unid,
          'Gerado pelo ERP a partir das comissões' || case when v_vend.exige_nf then ' · terceirizado: pagar só com a NF do vendedor (nº no documento)' else '' end,
          nullif(btrim(v_vend.pix), ''))
  returning id into v_conta;
  update comissoes set conta_pagar_id = v_conta where id = any(p_ids) and status = 'a_pagar' and conta_pagar_id is null;
  return v_conta;
end $function$;

-- conta de comissão de vendedor que exige NF e ainda sem o nº da NF no documento
create or replace function public.comissao_sem_nf(p_conta uuid, p_documento text)
returns boolean language sql stable set search_path to 'public' as $function$
  select coalesce(btrim(p_documento), '') = ''
     and exists (select 1 from comissoes c join vendedores v on v.id = c.vendedor_id where c.conta_pagar_id = p_conta and v.exige_nf);
$function$;
revoke all on function public.comissao_sem_nf(uuid, text) from public, anon;
grant execute on function public.comissao_sem_nf(uuid, text) to authenticated, service_role;

-- vale para o pagamento feito pela pessoa (tela ou baixar_conta); a conciliação do extrato, que registra o que já saiu
-- do banco, não é travada
create or replace function public.trg_comissao_exige_nf()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.status = 'pago' and old.status is distinct from 'pago'
     and (current_user in ('authenticated', 'anon') or coalesce(current_setting('erp.acao_usuario', true), '') = 'on')
     and public.comissao_sem_nf(new.id, new.documento) then
    raise exception 'comissão de vendedor terceirizado: informe o nº da NF dele no documento da conta antes de pagar';
  end if;
  return new;
end $function$;

create or replace trigger trg_comissao_exige_nf before update of status on public.contas_pagar
  for each row execute function public.trg_comissao_exige_nf();

-- pagamento em lote: a comissão sem a NF do terceirizado fica de fora (conta como pulada), sem parar o lote
create or replace function public.pagar_em_lote(p_ids uuid[], p_data date, p_conta_bancaria uuid default null::uuid, p_incluir_nao_pagar boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  c record; b contas_bancarias; n int := 0; v_total numeric := 0; v_puladas int := 0;
begin
  perform public.exigir_papel('financeiro');
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'escolha ao menos uma conta'; end if;
  if p_data is null then raise exception 'informe a data do pagamento'; end if;
  if p_conta_bancaria is not null then
    select * into b from contas_bancarias where id = p_conta_bancaria and ativo;
    if b.id is null then raise exception 'conta bancária não encontrada'; end if;
  end if;

  for c in select * from contas_pagar where id = any (p_ids) order by vencimento for update loop
    if c.status <> 'aberto' or (c.decisao = 'nao_pagar' and not p_incluir_nao_pagar)
       or (c.fornecedor_id is not null and public.fornecedor_bloqueio(c.fornecedor_id) is not null)
       or public.comissao_sem_nf(c.id, c.documento) then
      v_puladas := v_puladas + 1;
      continue;
    end if;
    if b.id is not null and c.unidade_id is not null and b.unidade_id is distinct from c.unidade_id then
      raise exception '"%" é de outra unidade que a conta bancária %: pague essa num lote separado', c.descricao, b.nome;
    end if;
    perform public.baixar_conta('contas_pagar', c.id, p_data, c.valor, p_conta_bancaria, null);
    n := n + 1;
    v_total := v_total + c.valor;
  end loop;
  return jsonb_build_object('pagas', n, 'total', round(v_total, 2), 'puladas', v_puladas);
end $function$;
