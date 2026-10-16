-- Técnico de referência do cliente: a empresa escolhe na ficha do cliente (aba Assistência) o técnico que atende
-- aquele cliente. A ficha mostra só esse técnico e os da mesma cidade; os outros da região ficam atrás de um link.
-- Só acrescenta a coluna (técnico excluído: o vínculo some sozinho).
alter table public.clientes add column if not exists tecnico_id uuid references public.tecnicos(id) on delete set null;
comment on column public.clientes.tecnico_id is 'Técnico de referência do cliente (escolhido na ficha do cliente → Assistência).';
create index if not exists clientes_tecnico_id on public.clientes (tecnico_id) where tecnico_id is not null;
