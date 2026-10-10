-- =====================================================================
-- Agendamento automático das rotinas do ERP (pg_cron + pg_net).
-- O token que protege as chamadas é gerado aqui mesmo e fica no Vault (erp_cron_token);
-- as Edge Functions conferem pelo banco (public.cron_token_valido). Não precisa copiar
-- token nem criar secret. Pode rodar de novo: atualiza os agendamentos sem duplicar.
-- Em outro projeto, troque o endereço das funções (erp_functions_url).
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'erp_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'erp_cron_token');
  end if;
  if not exists (select 1 from vault.secrets where name = 'erp_functions_url') then
    perform vault.create_secret('https://antfofmwrmkadiavjycg.supabase.co/functions/v1', 'erp_functions_url');
  end if;
end $$;

-- Chama uma Edge Function do ERP com o token do agendamento
create or replace function public.chamar_funcao(p_funcao text, p_corpo jsonb default '{}'::jsonb, p_timeout int default 60000)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_url text; v_tok text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'erp_functions_url';
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'erp_cron_token';
  return net.http_post(
    url := v_url || '/' || p_funcao,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok),
    body := p_corpo,
    timeout_milliseconds := p_timeout);
end $$;
revoke execute on function public.chamar_funcao(text, jsonb, int) from public, anon, authenticated;

-- Avisos (Telegram da equipe e e-mail dos clientes): entrega a fila a cada minuto
select cron.schedule('erp-avisos-enviar', '* * * * *',
  $$ select public.chamar_funcao('avisos-enviar')
      where exists (select 1 from public.avisos where status in ('pendente', 'erro', 'enviando') and tentativas < 5) $$);

-- Resumo do dia, lembretes de vencimento, contas fixas: 8h de Brasília (11h UTC)
select cron.schedule('erp-avisos-diarios', '0 11 * * *', $$ select public.gerar_avisos_diarios() $$);

-- Contas fixas: lança as próximas contas (aluguel, salários, contratos) todo dia às 7h50 de Brasília
select cron.schedule('erp-contas-fixas', '50 10 * * *', $$ select public.gerar_recorrentes_interno() $$);

-- Régua de cobrança: e-mails antes/no/depois do vencimento, todo dia às 8h02 de Brasília
select cron.schedule('erp-regua-cobranca', '2 11 * * *', $$ select public.gerar_cobrancas_regua() $$);

-- NF-e de fornecedores, fila de contingência e NF-e automática: a cada 15 minutos
select cron.schedule('erp-nfe-processar', '*/15 * * * *', $$ select public.chamar_funcao('nfe-processar') $$);

-- Caixa de e-mail: busca e-mails novos a cada 5 minutos (só se houver caixa ligada)
select cron.schedule('erp-email-caixa', '*/5 * * * *',
  $$ select public.chamar_funcao('email-caixa', '{"acao":"sincronizar"}'::jsonb, 120000)
      where exists (select 1 from public.email_contas where ativo) $$);

-- Fechamento para o contador: todo dia às 8h confere se é o dia do envio (Configurações → Contador)
select cron.schedule('erp-contador-pacote', '0 11 * * *',
  $$ select public.chamar_funcao('contador-pacote', '{"acao":"automatico"}'::jsonb, 300000) $$);

-- Clientes e fornecedores: confere os CNPJs na Receita (3 por minuto, limite das consultas públicas)
select cron.schedule('erp-clientes-receita', '* * * * *',
  $$ select public.chamar_funcao('clientes-receita', '{"acao":"lote"}'::jsonb, 120000)
      where exists (select 1 from public.clientes_para_receita(1))
         or exists (select 1 from public.fornecedores_para_receita(1)) $$);

-- Backup diário: confere às 09:07 (Brasília) se o backup da madrugada saiu e se a Hostinger baixou a cópia
select cron.schedule('erp-backups-conferir', '7 12 * * *', $$ select public.conferir_backups() $$);

-- Para conferir:   select jobname, schedule, active from cron.job;
--                  select * from cron.job_run_details order by start_time desc limit 20;
--                  select * from net._http_response order by created desc limit 20;
-- Para desligar:   select cron.unschedule('erp-avisos-enviar');  (e os outros pelo nome)
