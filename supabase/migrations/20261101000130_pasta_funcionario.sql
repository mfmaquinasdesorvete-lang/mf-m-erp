-- Pasta de documentos do funcionário: cada anexo fica numa divisão (contrato, exames, férias, holerites,
-- atestados, outros). Coluna livre (texto) para servir a outras entidades depois; vazio = "Outros".
alter table public.documentos add column if not exists pasta text;
comment on column public.documentos.pasta is 'Divisão do anexo dentro da pasta do registro (ex.: funcionário: contrato, exames, ferias, holerites, atestados, outros).';
create index if not exists documentos_entidade_pasta on public.documentos (entidade, entidade_id, pasta);
