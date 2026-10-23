-- Braspress: rastreio dos envios pela API (functions/braspress), 5 minutos depois do SSW e antes dos avisos da manhã
-- (7h30). Horário de Brasília = UTC-3. Grava nos mesmos campos rastreio_* do envio (fonte "Braspress").
select cron.unschedule('erp-braspress-rastreio') where exists (select 1 from cron.job where jobname = 'erp-braspress-rastreio');
select cron.schedule('erp-braspress-rastreio', '10 10,17 * * *',
  $c$ select public.chamar_funcao('braspress', '{"acao":"atualizar"}'::jsonb, 120000) $c$);
