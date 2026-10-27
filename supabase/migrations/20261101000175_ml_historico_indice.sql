-- Índice da chave estrangeira ml_historico.conta_id (auditoria de 27/10).
create index if not exists ml_historico_conta_id_idx on public.ml_historico (conta_id);
