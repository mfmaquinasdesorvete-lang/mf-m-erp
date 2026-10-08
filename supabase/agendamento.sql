-- =====================================================================
-- Agendamento: processa as NF-e de fornecedores a cada 15 minutos.
-- Rode UMA vez no SQL Editor do Supabase, depois de:
--   1) fazer o deploy da função nfe-processar
--   2) definir o secret ERP_CRON_TOKEN (supabase secrets set ERP_CRON_TOKEN=...)
-- Troque SEU_PROJECT_REF e COLE_O_ERP_CRON_TOKEN abaixo.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://SEU_PROJECT_REF.supabase.co/functions/v1/nfe-processar', 'erp_nfe_processar_url');
select vault.create_secret('COLE_O_ERP_CRON_TOKEN', 'erp_cron_token');

select cron.schedule(
  'erp-nfe-processar',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'erp_nfe_processar_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'erp_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Para conferir:   select * from cron.job_run_details order by start_time desc limit 10;
-- Para desligar:   select cron.unschedule('erp-nfe-processar');

-- =====================================================================
-- Avisos (Telegram da equipe e e-mail dos clientes)
-- Depois do deploy das funções avisos-enviar, telegram-webhook,
-- email-descadastrar e avisos-config. Troque SEU_PROJECT_REF abaixo.
-- =====================================================================
select vault.create_secret('https://SEU_PROJECT_REF.supabase.co/functions/v1/avisos-enviar', 'erp_avisos_enviar_url');

-- Entrega a fila a cada minuto
select cron.schedule(
  'erp-avisos-enviar',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'erp_avisos_enviar_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'erp_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.avisos where status in ('pendente', 'erro', 'enviando') and tentativas < 5);
  $$
);

-- Resumo do dia e lembretes para clientes: 8h de Brasília (11h UTC)
select cron.schedule('erp-avisos-diarios', '0 11 * * *', $$ select public.gerar_avisos_diarios(); $$);

-- Para desligar:   select cron.unschedule('erp-avisos-enviar'); select cron.unschedule('erp-avisos-diarios');

-- =====================================================================
-- Caixa de entrada de e-mail: busca e-mails novos a cada 5 minutos
-- (depois do deploy da função email-caixa)
-- =====================================================================
select vault.create_secret('https://SEU_PROJECT_REF.supabase.co/functions/v1/email-caixa', 'erp_email_caixa_url');

select cron.schedule(
  'erp-email-caixa',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'erp_email_caixa_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'erp_cron_token')
    ),
    body := '{"acao":"sincronizar"}'::jsonb,
    timeout_milliseconds := 120000
  )
  where exists (select 1 from public.email_contas where ativo);
  $$
);

-- =====================================================================
-- Fechamento para o contador: todo dia às 8h confere se é o dia do envio
-- (Configurações → Contador) e manda o pacote do mês anterior por e-mail
-- (depois do deploy da função contador-pacote)
-- =====================================================================
select vault.create_secret('https://SEU_PROJECT_REF.supabase.co/functions/v1/contador-pacote', 'erp_contador_url');

select cron.schedule(
  'erp-contador-pacote',
  '0 11 * * *',  -- 11h UTC = 8h em Brasília
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'erp_contador_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'erp_cron_token')
    ),
    body := '{"acao":"automatico"}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
