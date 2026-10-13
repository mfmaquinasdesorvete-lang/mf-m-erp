-- Fornecedor marcado como golpe (boleto falso que chega todo mês): nenhuma conta dele é paga.
-- Só acrescenta (colunas, funções e gatilhos); não apaga nada.
--   * fornecedores.bloqueado + motivo; quem e quando são gravados pelo banco. Bloquear: quem edita fornecedores
--     (financeiro). Tirar o bloqueio: só o administrador. O histórico fica na auditoria (zz_auditoria).
--   * contas a pagar do fornecedor bloqueado entram (e ficam) como "não pagar"; o banco recusa aprovar,
--     agendar ou dar baixa. Cancelar continua permitido. Contas antigas já pagas importadas do Tiny entram normalmente.
--   * pagar_em_lote pula as contas de fornecedor bloqueado mesmo com "incluir as não pagar".

alter table public.fornecedores
  add column if not exists bloqueado boolean not null default false,
  add column if not exists bloqueio_motivo text,
  add column if not exists bloqueado_em timestamptz,
  add column if not exists bloqueado_por_nome text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fornecedores_bloqueio_motivo') then
    alter table public.fornecedores add constraint fornecedores_bloqueio_motivo
      check (not bloqueado or char_length(btrim(coalesce(bloqueio_motivo, ''))) >= 3);
  end if;
end $$;

-- Motivo do bloqueio do fornecedor; nulo = pode pagar.
create or replace function public.fornecedor_bloqueio(p_fornecedor uuid)
returns text language sql stable security definer set search_path = public as $$
  select f.bloqueio_motivo from fornecedores f where f.id = p_fornecedor and f.bloqueado
$$;
revoke execute on function public.fornecedor_bloqueio(uuid) from public, anon;
grant execute on function public.fornecedor_bloqueio(uuid) to authenticated;

-- Antes de gravar o fornecedor: motivo obrigatório, quem/quando pelo banco, desbloqueio só do administrador.
create or replace function public.trg_fornecedor_bloqueio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if new.bloqueado and (tg_op = 'INSERT' or not old.bloqueado) then
    if char_length(btrim(coalesce(new.bloqueio_motivo, ''))) < 3 then
      raise exception 'diga o motivo do bloqueio (ex.: boleto falso que chega todo mês)';
    end if;
    select nullif(btrim(u.nome), '') into v_nome from usuarios_erp u where u.user_id = auth.uid();
    new.bloqueio_motivo := btrim(new.bloqueio_motivo);
    new.bloqueado_em := now();
    -- sem usuário (manutenção pelo SQL), aceita o nome informado
    new.bloqueado_por_nome := coalesce(v_nome, case when auth.uid() is null then nullif(btrim(new.bloqueado_por_nome), '') end, 'ERP');
  elsif tg_op = 'UPDATE' and old.bloqueado and not new.bloqueado then
    if auth.uid() is not null and not public.is_erp_admin() then
      raise exception 'só o administrador tira o bloqueio de um fornecedor marcado como golpe';
    end if;
    new.bloqueio_motivo := null;
    new.bloqueado_em := null;
    new.bloqueado_por_nome := null;
  elsif new.bloqueado then
    -- continua bloqueado: pode corrigir o motivo; quem/quando não mudam
    if char_length(btrim(coalesce(new.bloqueio_motivo, ''))) < 3 then
      raise exception 'diga o motivo do bloqueio (ex.: boleto falso que chega todo mês)';
    end if;
    new.bloqueado_em := old.bloqueado_em;
    new.bloqueado_por_nome := old.bloqueado_por_nome;
  else
    new.bloqueio_motivo := null;
    new.bloqueado_em := null;
    new.bloqueado_por_nome := null;
  end if;
  return new;
end $$;

-- Depois de gravar: leva o bloqueio (ou a retirada) às contas em aberto do fornecedor.
create or replace function public.trg_fornecedor_bloqueio_contas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.bloqueado = old.bloqueado and new.bloqueio_motivo is not distinct from old.bloqueio_motivo then
    return null;
  end if;
  if tg_op = 'INSERT' and not new.bloqueado then return null; end if;
  perform set_config('erp.acao_usuario', 'on', true);

  if new.bloqueado then
    update contas_pagar set
      decisao = 'nao_pagar', pagar_em = null,
      decisao_motivo = left('Fornecedor bloqueado (golpe): ' || new.bloqueio_motivo, 500),
      decisao_por = null, decisao_por_nome = 'ERP (fornecedor bloqueado)', decisao_em = now(),
      motivo_alteracao = 'Fornecedor marcado como golpe: não pagar'
     where fornecedor_id = new.id and status = 'aberto'
       and (decisao is distinct from 'nao_pagar' or decisao_por_nome = 'ERP (fornecedor bloqueado)');
  else
    -- bloqueio retirado: o que o ERP tinha segurado volta para "a decidir"
    update contas_pagar set
      decisao = null, pagar_em = null, decisao_motivo = null, decisao_por = null, decisao_por_nome = null, decisao_em = null,
      motivo_alteracao = 'Bloqueio do fornecedor retirado: volta para a decidir'
     where fornecedor_id = new.id and status = 'aberto' and decisao_por_nome = 'ERP (fornecedor bloqueado)';
  end if;
  return null;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_fornecedor_bloqueio' and tgrelid = 'public.fornecedores'::regclass) then
    create trigger trg_fornecedor_bloqueio before insert or update on public.fornecedores
      for each row execute function public.trg_fornecedor_bloqueio();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_fornecedor_bloqueio_contas' and tgrelid = 'public.fornecedores'::regclass) then
    create trigger trg_fornecedor_bloqueio_contas after insert or update of bloqueado, bloqueio_motivo on public.fornecedores
      for each row execute function public.trg_fornecedor_bloqueio_contas();
  end if;
end $$;

-- Conta a pagar de fornecedor bloqueado: entra como "não pagar" e não pode ser aprovada, agendada nem paga.
-- O nome "trg_zz_..." faz este gatilho rodar depois de trg_restante_sem_decisao e antes de zz_auditoria.
create or replace function public.trg_conta_fornecedor_bloqueado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if new.fornecedor_id is null then return new; end if;
  v_motivo := public.fornecedor_bloqueio(new.fornecedor_id);
  if v_motivo is null then return new; end if;

  if new.status = 'pago' and (case when tg_op = 'INSERT' then new.id_externo is null else old.status is distinct from 'pago' end) then
    raise exception '"%" é de um fornecedor marcado como golpe (%): não pode ser paga. Se for engano, o administrador tira o bloqueio no cadastro do fornecedor.',
      new.descricao, v_motivo;
  end if;

  if new.status = 'aberto' then
    if tg_op = 'UPDATE' and new.decisao in ('pagar', 'agendado') and new.decisao is distinct from old.decisao then
      raise exception '"%" é de um fornecedor marcado como golpe (%): não pode ser aprovada nem agendada. Se for engano, o administrador tira o bloqueio no cadastro do fornecedor.',
        new.descricao, v_motivo;
    end if;
    if new.decisao is distinct from 'nao_pagar' then
      new.decisao := 'nao_pagar';
      new.pagar_em := null;
      new.decisao_motivo := left('Fornecedor bloqueado (golpe): ' || v_motivo, 500);
      new.decisao_por := null;
      new.decisao_por_nome := 'ERP (fornecedor bloqueado)';
      new.decisao_em := now();
    end if;
  end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_zz_fornecedor_bloqueado' and tgrelid = 'public.contas_pagar'::regclass) then
    create trigger trg_zz_fornecedor_bloqueado before insert or update on public.contas_pagar
      for each row execute function public.trg_conta_fornecedor_bloqueado();
  end if;
end $$;

-- Pagamento em lote: igual ao anterior, mas pula conta de fornecedor bloqueado mesmo com "incluir as não pagar".
create or replace function public.pagar_em_lote(p_ids uuid[], p_data date, p_conta_bancaria uuid default null, p_incluir_nao_pagar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
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
       or (c.fornecedor_id is not null and public.fornecedor_bloqueio(c.fornecedor_id) is not null) then
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
end $$;
