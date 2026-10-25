-- Produtos com variações (parte 2, aplicada): descrições dos campos e índice das variações de cada pai.
comment on column public.produtos.agrupador is 'Produto pai: só agrupa as variações (não vende sozinho, sem estoque)';
comment on column public.produtos.produto_pai_id is 'Variação de qual produto pai';
comment on column public.produtos.variacao is 'O que diferencia esta variação (ex.: 3 Sabores, A 200)';
create index if not exists produtos_pai on public.produtos (produto_pai_id) where produto_pai_id is not null;
