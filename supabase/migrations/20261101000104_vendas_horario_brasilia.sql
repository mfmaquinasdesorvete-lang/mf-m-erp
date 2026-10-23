-- O banco roda em UTC: depois das 21h de Brasília o current_date já é o dia seguinte. Venda de balcão às 21h30
-- entrava recebida no dia seguinte (e no último dia do mês, no mês seguinte); o 1º vencimento também saía um dia depois.
-- Estas funções passam a rodar no horário de Brasília (current_date, now()::date e to_char ficam no dia certo).
-- Atenção: quem recriar alguma delas com "create or replace" precisa manter o "set timezone to 'America/Sao_Paulo'".
alter function public.pdv_finalizar(jsonb) set timezone to 'America/Sao_Paulo';
alter function public.aprovar_pedido_sistema(uuid) set timezone to 'America/Sao_Paulo';
alter function public.proposta_responder(uuid, boolean, text, text, text) set timezone to 'America/Sao_Paulo';
