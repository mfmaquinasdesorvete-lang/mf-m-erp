-- Clientes inativos: saem da lista de clientes (ficam escondidos, com o botão "Inativos" para ver e reativar),
-- mas não são arquivados: continuam com pedidos, notas, máquinas e marcadores, e podem voltar a qualquer hora.
alter table public.clientes add column if not exists inativo_em timestamptz;
alter table public.clientes add column if not exists inativo_motivo text;
comment on column public.clientes.inativo_em is 'Quando o cliente foi inativado (some da lista; null = ativo)';
comment on column public.clientes.inativo_motivo is 'Por que foi inativado (ex.: vendeu a máquina)';
