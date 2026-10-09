-- Ficha do cliente 360°: preferências do cliente (como gosta de ser atendido, forma de pagamento, linhas que trabalha)
-- e índices para juntar pedidos, notas (pelo cliente ou pelo CPF/CNPJ do destinatário) e atendimentos.
alter table public.clientes add column if not exists preferencias text;

create index if not exists contatos_cliente_cliente_idx on public.contatos_cliente (cliente_id, created_at desc);
create index if not exists notas_fiscais_cliente_idx on public.notas_fiscais (cliente_id);
create index if not exists notas_fiscais_destinatario_doc_idx on public.notas_fiscais (destinatario_doc);
create index if not exists pedidos_cliente_idx on public.pedidos (cliente_id, created_at desc);
create index if not exists contas_receber_cliente_idx on public.contas_receber (cliente_id);
