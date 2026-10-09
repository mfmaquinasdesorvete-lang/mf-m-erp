-- =====================================================================
-- Contas a pagar: decisão de pagamento por conta e pagamento em lote.
--   * cada conta em aberto pode receber uma decisão: "pagar" (aprovada, paga no vencimento ou hoje se já
--     venceu), "agendado" (pagar em tal dia) ou "nao_pagar" (segurada, com motivo); sem decisão = a decidir
--   * quem decidiu e quando ficam na conta e no histórico (auditoria)
--   * pagar_em_lote registra o pagamento de várias contas de uma vez (mesma data e mesma conta bancária),
--     pelo mesmo caminho da baixa individual (baixar_conta)
-- =====================================================================
alter table public.contas_pagar add column if not exists decisao text;
alter table public.contas_pagar add column if not exists pagar_em date;
alter table public.contas_pagar add column if not exists decisao_motivo text;
alter table public.contas_pagar add column if not exists decisao_por uuid;
alter table public.contas_pagar add column if not exists decisao_por_nome text;
alter table public.contas_pagar add column if not exists decisao_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contas_pagar_decisao_valida') then
    alter table public.contas_pagar add constraint contas_pagar_decisao_valida check (
      (decisao is null and pagar_em is null)
      or (decisao = 'pagar' and pagar_em is not null)
      or (decisao = 'agendado' and pagar_em is not null)
      or (decisao = 'nao_pagar' and pagar_em is null and char_length(btrim(coalesce(decisao_motivo, ''))) >= 3));
  end if;
end $$;
create index if not exists contas_pagar_pagar_em on public.contas_pagar (pagar_em) where status = 'aberto' and pagar_em is not null;

-- ---------------------------------------------------------------------
-- p_acao: 'pagar' | 'agendar' (com p_data) | 'nao_pagar' (com p_motivo) | 'limpar' (volta a "a decidir")
-- Só mexe nas contas em aberto; devolve quantas mudaram.
create or replace function public.programar_pagamento(p_ids uuid[], p_acao text, p_data date default null, p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  c record; n int := 0; v_nome text; v_motivo text := nullif(btrim(p_motivo), ''); v_data date; v_texto text;
begin
  perform public.exigir_papel('financeiro');
  if p_acao not in ('pagar', 'agendar', 'nao_pagar', 'limpar') then raise exception 'ação inválida'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'escolha ao menos uma conta'; end if;
  if p_acao = 'agendar' and p_data is null then raise exception 'escolha o dia do pagamento'; end if;
  if p_acao = 'agendar' and p_data < current_date then raise exception 'o dia do pagamento não pode ser no passado'; end if;
  if p_acao = 'nao_pagar' and char_length(coalesce(v_motivo, '')) < 3 then raise exception 'diga por que não vai pagar (fica no histórico)'; end if;
  select nullif(btrim(u.nome), '') into v_nome from usuarios_erp u where u.user_id = auth.uid();
  perform set_config('erp.acao_usuario', 'on', true);

  for c in select * from contas_pagar where id = any (p_ids) and status = 'aberto' order by vencimento for update loop
    v_data := case p_acao when 'pagar' then greatest(c.vencimento, current_date) when 'agendar' then p_data end;
    v_texto := case p_acao
      when 'pagar' then 'Aprovada para pagar em ' || to_char(v_data, 'DD/MM/YYYY')
      when 'agendar' then 'Agendada para pagar em ' || to_char(v_data, 'DD/MM/YYYY')
      when 'nao_pagar' then 'Não pagar: ' || v_motivo
      else 'Decisão de pagamento desfeita (volta a "a decidir")' end;
    update contas_pagar set
      decisao = case p_acao when 'pagar' then 'pagar' when 'agendar' then 'agendado' when 'nao_pagar' then 'nao_pagar' end,
      pagar_em = v_data,
      decisao_motivo = case when p_acao = 'limpar' then null else v_motivo end,
      decisao_por = case when p_acao = 'limpar' then null else auth.uid() end,
      decisao_por_nome = case when p_acao = 'limpar' then null else v_nome end,
      decisao_em = case when p_acao = 'limpar' then null else now() end,
      motivo_alteracao = left(v_texto || coalesce(' (' || v_nome || ')', ''), 500)
    where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.programar_pagamento(uuid[], text, date, text) from public, anon;
grant execute on function public.programar_pagamento(uuid[], text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- Paga várias contas de uma vez (valor cheio de cada uma), na mesma data e saindo da mesma conta bancária.
-- Contas marcadas "não pagar" só entram se p_incluir_nao_pagar; contas de outra unidade que a do banco são
-- recusadas (mesma regra da baixa individual).
create or replace function public.pagar_em_lote(p_ids uuid[], p_data date, p_conta_bancaria uuid default null,
  p_incluir_nao_pagar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
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
    if c.status <> 'aberto' or (c.decisao = 'nao_pagar' and not p_incluir_nao_pagar) then
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
revoke execute on function public.pagar_em_lote(uuid[], date, uuid, boolean) from public, anon;
grant execute on function public.pagar_em_lote(uuid[], date, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- O restante de um pagamento parcial nasce "a decidir" (não herda a decisão da conta original)
create or replace function public.trg_restante_sem_decisao()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.conta_origem_id is not null then
    new.decisao := null; new.pagar_em := null; new.decisao_motivo := null;
    new.decisao_por := null; new.decisao_por_nome := null; new.decisao_em := null;
  end if;
  return new;
end $$;
create or replace trigger trg_restante_sem_decisao before insert on public.contas_pagar
  for each row execute function public.trg_restante_sem_decisao();
