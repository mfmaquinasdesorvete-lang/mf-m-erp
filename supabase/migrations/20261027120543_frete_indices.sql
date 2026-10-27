-- Índices das chaves estrangeiras das tabelas de frete (auditoria de 27/10): consultas e apagamentos pelo cliente, pedido
-- ou unidade não varrem a tabela inteira quando ela crescer. Só acrescenta.
create index if not exists frete_consultas_cliente on public.frete_consultas (cliente_id);
create index if not exists frete_consultas_pedido on public.frete_consultas (pedido_id);
create index if not exists frete_consultas_unidade on public.frete_consultas (unidade_id);
create index if not exists frete_tabelas_unidade on public.frete_tabelas (unidade_id);
