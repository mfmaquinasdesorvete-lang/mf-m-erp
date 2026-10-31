-- Chave estrangeira auditor_achados.ultima_rodada sem índice (achado da revisão de 31/10).
create index if not exists auditor_achados_ultima_rodada_idx on public.auditor_achados (ultima_rodada);
