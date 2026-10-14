-- =====================================================================
-- Banco Inter (API PJ): extrato e saldo automáticos das contas ligadas ao app do Inter
--  * inter_conexoes: uma por conta bancária do ERP (situação, saldo, validade do certificado);
--  * Client ID, Client Secret, certificado (.crt) e chave (.key) do app ficam no cofre (Vault), gravados só pela
--    função inter: o navegador nunca lê;
--  * a função inter busca o extrato completo (cada transação tem código próprio no Inter) de 4 em 4 horas e no
--    botão "Atualizar agora", grava em extrato_lancamentos (repetidos são ignorados) e já concilia o que for certo.
-- Somente acréscimos (a regra de origem das linhas do extrato passa a aceitar também 'inter').
-- =====================================================================

create table if not exists public.inter_conexoes (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  conta_corrente text,                        -- só quando o app do Inter enxerga mais de uma conta (cabeçalho x-conta-corrente)
  status text not null default 'ativa',
  erro text,
  desde date not null default (current_date - 30),
  sincronizado_em timestamptz,
  ultimas_novas int not null default 0,
  saldo numeric(14,2),
  saldo_em timestamptz,
  certificado_validade timestamptz,           -- o certificado do app do Inter vence (em geral 1 ano): avisar antes
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inter_conexoes_status_valido') then
    alter table public.inter_conexoes add constraint inter_conexoes_status_valido check (status in ('ativa', 'erro', 'desligada'));
  end if;
end $$;
create unique index if not exists inter_conexoes_conta_ativa on public.inter_conexoes (conta_bancaria_id) where status <> 'desligada';

alter table public.inter_conexoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'inter_conexoes' and policyname = 'inter_select') then
    create policy inter_select on public.inter_conexoes for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
  end if;
end $$;
-- gravação só pela função inter (service role)
revoke insert, update, delete on public.inter_conexoes from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.inter_conexoes'::regclass) then
    create trigger zz_auditoria before insert or update or delete on public.inter_conexoes for each row execute function public.trg_auditoria();
  end if;
end $$;

-- Linhas do extrato que vieram do Inter
alter table public.extrato_lancamentos add column if not exists inter_conexao_id uuid references public.inter_conexoes(id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'extrato_lancamentos_origem_valida' and pg_get_constraintdef(oid) like '%inter%') then
    alter table public.extrato_lancamentos drop constraint if exists extrato_lancamentos_origem_valida,
      add constraint extrato_lancamentos_origem_valida check (origem in ('arquivo', 'openfinance', 'inter'));
  end if;
end $$;

-- Grava os lançamentos que vieram do Inter (repetidos são ignorados) e concilia o que for certo. Só a função inter chama.
-- p_linhas: [{ data, valor, descricao, documento, identificador }]
create or replace function public.importar_extrato_inter(p_conexao uuid, p_linhas jsonb, p_saldo numeric default null, p_saldo_em timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c inter_conexoes; v_novas int := 0; v_auto int := 0; v_banco text; v_unid uuid;
begin
  select * into c from inter_conexoes where id = p_conexao for update;
  if c.id is null or c.status = 'desligada' then raise exception 'conexão do Inter não encontrada'; end if;
  if jsonb_typeof(p_linhas) = 'array' and jsonb_array_length(p_linhas) > 0 then
    with novas as (
      insert into extrato_lancamentos (conta_bancaria_id, data, valor, descricao, documento, identificador, origem, inter_conexao_id)
      select c.conta_bancaria_id, (e->>'data')::date, round((e->>'valor')::numeric, 2), left(e->>'descricao', 300), left(e->>'documento', 60),
             e->>'identificador', 'inter', c.id
        from jsonb_array_elements(p_linhas) e
       where coalesce((e->>'valor')::numeric, 0) <> 0 and coalesce(e->>'identificador', '') <> '' and (e->>'data')::date >= c.desde
      on conflict (conta_bancaria_id, identificador) do nothing
      returning 1)
    select count(*) into v_novas from novas;
  end if;
  if v_novas > 0 then v_auto := public.conciliar_automatico_interno(c.conta_bancaria_id); end if;
  update inter_conexoes set status = 'ativa', erro = null, sincronizado_em = now(), ultimas_novas = v_novas,
         saldo = coalesce(p_saldo, saldo), saldo_em = case when p_saldo is not null then coalesce(p_saldo_em, now()) else saldo_em end
   where id = c.id;
  if v_novas - v_auto > 0 then
    select nome, unidade_id into v_banco, v_unid from contas_bancarias where id = c.conta_bancaria_id;
    perform public.notificar('pagamento', 'Extrato ' || coalesce(v_banco, 'do Inter') || ': ' || (v_novas - v_auto) || ' lançamento(s) para conciliar',
      case when v_auto > 0 then v_auto || ' já conciliado(s) sozinho(s)' else 'chegaram pela API do Inter' end, '/conciliacao', '{financeiro}', v_unid);
  end if;
  return jsonb_build_object('novas', v_novas, 'conciliadas', v_auto);
end $$;
revoke execute on function public.importar_extrato_inter(uuid, jsonb, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.importar_extrato_inter(uuid, jsonb, numeric, timestamptz) to service_role;

-- Credenciais do app do Inter no cofre (Vault), uma vez por conexão. Campo vazio = mantém o que já estava guardado.
create or replace function public.inter_guardar_chaves(p_conexao uuid, p_client_id text, p_client_secret text, p_cert text, p_key text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; v_nome text; v_valor text; i int;
begin
  if not exists (select 1 from inter_conexoes where id = p_conexao) then raise exception 'conexão do Inter não encontrada'; end if;
  for i in 1..4 loop
    v_nome := 'inter_' || p_conexao || '_' || (array['client_id', 'client_secret', 'cert', 'key'])[i];
    v_valor := btrim(coalesce((array[p_client_id, p_client_secret, p_cert, p_key])[i], ''));
    if v_valor = '' then continue; end if;
    v_id := null;
    select id into v_id from vault.secrets where name = v_nome;
    if v_id is null then perform vault.create_secret(v_valor, v_nome, 'Banco Inter (API): ' || (array['Client ID', 'Client Secret', 'certificado', 'chave do certificado'])[i]);
    else perform vault.update_secret(v_id, v_valor); end if;
  end loop;
end $$;
revoke execute on function public.inter_guardar_chaves(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.inter_guardar_chaves(uuid, text, text, text, text) to service_role;

create or replace function public.inter_chaves(p_conexao uuid)
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select jsonb_build_object(
    'client_id', (select decrypted_secret from vault.decrypted_secrets where name = 'inter_' || p_conexao || '_client_id'),
    'client_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'inter_' || p_conexao || '_client_secret'),
    'cert', (select decrypted_secret from vault.decrypted_secrets where name = 'inter_' || p_conexao || '_cert'),
    'key', (select decrypted_secret from vault.decrypted_secrets where name = 'inter_' || p_conexao || '_key'));
$$;
revoke execute on function public.inter_chaves(uuid) from public, anon, authenticated;
grant execute on function public.inter_chaves(uuid) to service_role;

-- Ao desligar: as credenciais guardadas são trocadas por um texto vazio (o app continua existindo no Inter)
create or replace function public.inter_esquecer_chaves(p_conexao uuid)
returns void language plpgsql security definer set search_path = public, vault as $$
declare s record;
begin
  for s in select id from vault.secrets where name like 'inter_' || p_conexao || '_%' loop
    perform vault.update_secret(s.id, '');
  end loop;
end $$;
revoke execute on function public.inter_esquecer_chaves(uuid) from public, anon, authenticated;
grant execute on function public.inter_esquecer_chaves(uuid) to service_role;

-- De 4 em 4 horas busca os lançamentos novos das contas do Inter
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'erp-inter') then
    perform cron.schedule('erp-inter', '23 */4 * * *', $c$ select public.chamar_funcao('inter', '{"acao":"sincronizar"}'::jsonb, 120000)
      where exists (select 1 from public.inter_conexoes where status <> 'desligada') $c$);
  end if;
end $$;
