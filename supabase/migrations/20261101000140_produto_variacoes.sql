-- =====================================================================
-- Produtos com variações: um produto PAI (agrupador, não vende sozinho e não tem estoque) e as variações embaixo dele,
-- cada uma um produto de verdade (SKU, preço, estoque, foto). Ex.: pai "Kit de Borrachas O-Rings" e as variações
-- 3 Sabores, 5 Sabores, 7 Sabores e A 200. A loja e o Mercado Livre podem mostrar um anúncio só, com a escolha.
-- Somente acréscimos.
-- =====================================================================
alter table public.produtos add column if not exists agrupador boolean not null default false;
alter table public.produtos add column if not exists produto_pai_id uuid references public.produtos(id);
alter table public.produtos add column if not exists variacao text;
comment on column public.produtos.agrupador is 'Produto pai: só agrupa as variações (não vende sozinho, sem estoque)';
comment on column public.produtos.produto_pai_id is 'Variação de qual produto pai';
comment on column public.produtos.variacao is 'O que diferencia esta variação (ex.: 3 Sabores, A 200)';
create index if not exists produtos_pai on public.produtos (produto_pai_id) where produto_pai_id is not null;

-- o pai é um agrupador e não pode ser variação de outro; a variação não pode ser pai
create or replace function public.trg_produto_variacao() returns trigger language plpgsql set search_path = public as $$
begin
  if new.produto_pai_id is not null then
    if new.produto_pai_id = new.id then raise exception 'o produto não pode ser variação dele mesmo'; end if;
    if new.agrupador then raise exception 'um produto pai não pode ser variação de outro'; end if;
    if not exists (select 1 from produtos where id = new.produto_pai_id and agrupador) then
      raise exception 'escolha como pai um produto marcado "produto pai (tem variações)"';
    end if;
  end if;
  if new.agrupador then new.vendavel := false; end if;
  return new;
end $$;
drop trigger if exists produto_variacao on public.produtos;
create trigger produto_variacao before insert or update of produto_pai_id, agrupador on public.produtos
  for each row execute function public.trg_produto_variacao();
