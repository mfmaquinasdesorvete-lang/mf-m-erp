-- Avisos: situação "descartado" (aviso antigo que não vai mais ser enviado; sai do alerta do Monitor sem apagar o registro).
alter table public.avisos drop constraint if exists avisos_status_check;
alter table public.avisos add constraint avisos_status_check check (status in ('pendente', 'enviando', 'enviado', 'erro', 'descartado'));
