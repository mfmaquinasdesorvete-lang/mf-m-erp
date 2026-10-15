-- Venda de Máquinas: a ordem de produção diz de qual venda (pedido) ela é, para ver Proposta → Pedido → OP → NF juntos.
-- Aditiva: só cria a coluna (vazia) e o índice.
alter table public.ordens_producao add column if not exists pedido_id uuid references public.pedidos(id) on delete set null;
create index if not exists ordens_producao_pedido_idx on public.ordens_producao (pedido_id) where pedido_id is not null;
