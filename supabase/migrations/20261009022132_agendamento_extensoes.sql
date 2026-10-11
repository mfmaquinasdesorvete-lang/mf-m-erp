-- Extensões usadas pelos agendamentos (supabase/agendamento.sql) e pelas chamadas às Edge Functions.
create extension if not exists pg_cron;
create extension if not exists pg_net;
