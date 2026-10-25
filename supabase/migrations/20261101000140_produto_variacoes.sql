-- =====================================================================
-- Produtos com variações (parte 3, AINDA NÃO APLICADA): a regra no banco que impede variação de variação e pai que não
-- é pai, e deixa o pai como "não vende". Os campos já estão em 20261025021635 e 20261025021646.
-- Aplicar por migração com calma: criar gatilho em public.produtos pela API costuma travar.
-- =====================================================================
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
