-- Produtos com variações (parte 1, aplicada): o produto PAI (agrupador) e as variações, cada uma um produto de verdade.
alter table public.produtos add column if not exists agrupador boolean not null default false;
alter table public.produtos add column if not exists produto_pai_id uuid references public.produtos(id);
alter table public.produtos add column if not exists variacao text;
