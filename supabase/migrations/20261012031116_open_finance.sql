-- Extrato automático pelo Open Finance (Pluggy): o banco manda os lançamentos sozinho, sem importar arquivo.
--  * o financeiro conecta a conta do banco pelo ERP (janela da Pluggy, com o consentimento do Open Finance);
--  * cada conta do banco fica ligada a uma conta bancária do ERP (openfinance_conexoes);
--  * a função openfinance busca os lançamentos novos (de 4 em 4 horas, quando a Pluggy avisa e no botão
--    "Atualizar agora"), grava em extrato_lancamentos (repetidos são ignorados) e já concilia o que for certo;
--  * as chaves da Pluggy ficam no cofre do Supabase (Vault), gravadas pela própria função: o navegador não lê.

create table if not exists public.openfinance_conexoes (
  id uuid primary key default gen_random_uuid(),
  provedor text not null default 'pluggy',
  item_id text not null,                      -- conexão (consentimento) no provedor
  conta_externa_id text not null,             -- conta no provedor
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  instituicao text,
  conta_externa_nome text,
  status text not null default 'ativa',
  status_provedor text,                       -- UPDATED, LOGIN_ERROR, OUTDATED, WAITING_USER_INPUT…
  erro text,
  desde date not null default (current_date - 30),
  sincronizado_em timestamptz,
  ultimas_novas int not null default 0,
  saldo numeric(14,2),
  saldo_em timestamptz,
  consentimento_ate timestamptz,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'openfinance_conexoes_status_valido') then
    alter table public.openfinance_conexoes add constraint openfinance_conexoes_status_valido check (status in ('ativa', 'erro', 'desligada'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'openfinance_conexoes_provedor_valido') then
    alter table public.openfinance_conexoes add constraint openfinance_conexoes_provedor_valido check (provedor in ('pluggy'));
  end if;
end $$;
create unique index if not exists openfinance_conexoes_conta_ativa on public.openfinance_conexoes (conta_bancaria_id) where status <> 'desligada';
create index if not exists openfinance_conexoes_item_idx on public.openfinance_conexoes (item_id);

alter table public.openfinance_conexoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'openfinance_conexoes' and policyname = 'of_select') then
    create policy of_select on public.openfinance_conexoes for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
  end if;
end $$;
-- gravação só pela função openfinance (service role)
revoke insert, update, delete on public.openfinance_conexoes from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.openfinance_conexoes'::regclass) then
    create trigger zz_auditoria before insert or update or delete on public.openfinance_conexoes for each row execute function public.trg_auditoria();
  end if;
end $$;

-- De onde veio a linha do extrato: arquivo importado (OFX/CSV) ou Open Finance
alter table public.extrato_lancamentos add column if not exists origem text not null default 'arquivo';
alter table public.extrato_lancamentos add column if not exists conexao_id uuid references public.openfinance_conexoes(id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'extrato_lancamentos_origem_valida') then
    alter table public.extrato_lancamentos add constraint extrato_lancamentos_origem_valida check (origem in ('arquivo', 'openfinance'));
  end if;
end $$;

-- Conciliação automática sem conferir o usuário (chamada pela importação do Open Finance, no servidor).
-- conciliar_automatico (tela) continua exigindo o papel financeiro e usa esta.
create or replace function public.conciliar_automatico_interno(p_conta uuid)
returns int language plpgsql security definer set search_path = public as $$
declare l record; v_unid uuid; v_ids uuid[]; n int := 0;
begin
  select unidade_id into v_unid from contas_bancarias where id = p_conta;
  for l in select * from extrato_lancamentos where conta_bancaria_id = p_conta and status = 'pendente' order by data loop
    if l.valor > 0 then
      select array_agg(c.id) into v_ids from contas_receber c
       where c.unidade_id = v_unid
         and not exists (select 1 from extrato_lancamentos x where x.conta_receber_id = c.id and x.status = 'conciliado')
         and ((c.status = 'aberto' and c.valor = l.valor and c.vencimento between l.data - 10 and l.data + 10)
           or (c.status = 'pago' and coalesce(c.valor_pago, c.valor) = l.valor and c.data_pagamento between l.data - 3 and l.data + 3
               and (c.conta_bancaria_id is null or c.conta_bancaria_id = p_conta)));
      if cardinality(v_ids) = 1 then
        begin perform vincular_lancamento(l.id, 'receber', v_ids[1]); n := n + 1;
        exception when others then null; end;
      end if;
    else
      select array_agg(c.id) into v_ids from contas_pagar c
       where c.unidade_id = v_unid
         and not exists (select 1 from extrato_lancamentos x where x.conta_pagar_id = c.id and x.status = 'conciliado')
         and ((c.status = 'aberto' and c.valor = -l.valor and c.vencimento between l.data - 10 and l.data + 10)
           or (c.status = 'pago' and coalesce(c.valor_pago, c.valor) = -l.valor and c.data_pagamento between l.data - 3 and l.data + 3
               and (c.conta_bancaria_id is null or c.conta_bancaria_id = p_conta)));
      if cardinality(v_ids) = 1 then
        begin perform vincular_lancamento(l.id, 'pagar', v_ids[1]); n := n + 1;
        exception when others then null; end;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.conciliar_automatico_interno(uuid) from public, anon, authenticated;
grant execute on function public.conciliar_automatico_interno(uuid) to service_role;

create or replace function public.conciliar_automatico(p_conta uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  return public.conciliar_automatico_interno(p_conta);
end $$;

-- Grava os lançamentos que vieram do banco (repetidos são ignorados) e concilia o que for certo.
-- p_linhas: [{ data, valor, descricao, documento, identificador }]. Só a função openfinance chama.
create or replace function public.importar_extrato_openfinance(p_conexao uuid, p_linhas jsonb, p_saldo numeric default null,
  p_saldo_em timestamptz default null, p_status_provedor text default null, p_consentimento timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c openfinance_conexoes; v_novas int := 0; v_auto int := 0; v_banco text; v_unid uuid;
begin
  select * into c from openfinance_conexoes where id = p_conexao for update;
  if c.id is null or c.status = 'desligada' then raise exception 'conexão não encontrada'; end if;
  if jsonb_typeof(p_linhas) = 'array' and jsonb_array_length(p_linhas) > 0 then
    with novas as (
      insert into extrato_lancamentos (conta_bancaria_id, data, valor, descricao, documento, identificador, origem, conexao_id)
      select c.conta_bancaria_id, (e->>'data')::date, round((e->>'valor')::numeric, 2), left(e->>'descricao', 300), left(e->>'documento', 60),
             e->>'identificador', 'openfinance', c.id
        from jsonb_array_elements(p_linhas) e
       where coalesce((e->>'valor')::numeric, 0) <> 0 and coalesce(e->>'identificador', '') <> '' and (e->>'data')::date >= c.desde
      on conflict (conta_bancaria_id, identificador) do nothing
      returning 1)
    select count(*) into v_novas from novas;
  end if;
  if v_novas > 0 then v_auto := public.conciliar_automatico_interno(c.conta_bancaria_id); end if;
  update openfinance_conexoes set status = 'ativa', erro = null, sincronizado_em = now(), ultimas_novas = v_novas,
         saldo = coalesce(p_saldo, saldo), saldo_em = case when p_saldo is not null then coalesce(p_saldo_em, now()) else saldo_em end,
         status_provedor = coalesce(p_status_provedor, status_provedor), consentimento_ate = coalesce(p_consentimento, consentimento_ate)
   where id = c.id;
  if v_novas - v_auto > 0 then
    select nome, unidade_id into v_banco, v_unid from contas_bancarias where id = c.conta_bancaria_id;
    perform public.notificar('pagamento', 'Extrato ' || coalesce(v_banco, 'do banco') || ': ' || (v_novas - v_auto) || ' lançamento(s) para conciliar',
      case when v_auto > 0 then v_auto || ' já conciliado(s) sozinho(s)' else 'chegaram pelo Open Finance' end, '/conciliacao', '{financeiro}', v_unid);
  end if;
  return jsonb_build_object('novas', v_novas, 'conciliadas', v_auto);
end $$;
revoke execute on function public.importar_extrato_openfinance(uuid, jsonb, numeric, timestamptz, text, timestamptz) from public, anon, authenticated;
grant execute on function public.importar_extrato_openfinance(uuid, jsonb, numeric, timestamptz, text, timestamptz) to service_role;

-- Chaves da Pluggy no cofre (Vault). Gravar e ler só pela função openfinance (service role).
create or replace function public.openfinance_guardar_chaves(p_client_id text, p_client_secret text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_client_id), '') = '' or coalesce(btrim(p_client_secret), '') = '' then raise exception 'informe as duas chaves'; end if;
  select id into v_id from vault.secrets where name = 'pluggy_client_id';
  if v_id is null then perform vault.create_secret(btrim(p_client_id), 'pluggy_client_id', 'Pluggy (Open Finance): Client ID');
  else perform vault.update_secret(v_id, btrim(p_client_id)); end if;
  v_id := null;
  select id into v_id from vault.secrets where name = 'pluggy_client_secret';
  if v_id is null then perform vault.create_secret(btrim(p_client_secret), 'pluggy_client_secret', 'Pluggy (Open Finance): Client Secret');
  else perform vault.update_secret(v_id, btrim(p_client_secret)); end if;
end $$;
revoke execute on function public.openfinance_guardar_chaves(text, text) from public, anon, authenticated;
grant execute on function public.openfinance_guardar_chaves(text, text) to service_role;

create or replace function public.openfinance_chaves()
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select jsonb_build_object(
    'client_id', (select decrypted_secret from vault.decrypted_secrets where name = 'pluggy_client_id'),
    'client_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pluggy_client_secret'));
$$;
revoke execute on function public.openfinance_chaves() from public, anon, authenticated;
grant execute on function public.openfinance_chaves() to service_role;

-- De 4 em 4 horas busca os lançamentos novos das contas conectadas
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'erp-openfinance') then
    perform cron.schedule('erp-openfinance', '17 */4 * * *', $c$ select public.chamar_funcao('openfinance', '{"acao":"sincronizar"}'::jsonb, 120000)
      where exists (select 1 from public.openfinance_conexoes where status <> 'desligada') $c$);
  end if;
end $$;
