-- Mercado Livre → Produtos: os mesmos produtos da loja (/loja: ativos, no catálogo, com foto e preço), cada um com os
-- anúncios do Mercado Livre ligados a ele, direto ou por um kit só dele ("4 Un" = kit com 4), e o que o ERP leu do anúncio.

create or replace function public.ml_produtos_loja()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with liga as (
    -- anúncio ligado direto ao produto
    select a.produto_id as produto_id, a.id as anuncio_id, 1::numeric as quantidade from ml_anuncios a where a.produto_id is not null
    union all
    -- anúncio ligado a um kit que só tem esse produto
    select k.componente_id, a.id, k.quantidade
      from ml_anuncios a
      join produtos kp on kp.id = a.produto_id and coalesce(kp.kit, false)
      join kit_componentes k on k.kit_id = kp.id
     where not exists (select 1 from kit_componentes o where o.kit_id = k.kit_id and o.componente_id <> k.componente_id)
  )
  select case when public.tem_algum_papel(array['vendas', 'financeiro', 'marketplace']) then
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'sku', p.sku, 'nome', p.descricao, 'tipo', p.tipo, 'preco', p.preco_venda, 'foto', p.foto_caminho,
      'disponibilidade', public.disponibilidade_catalogo(p),
      'anuncios', coalesce((select jsonb_agg(jsonb_build_object(
          'anuncio_id', a.id, 'ml_item_id', a.ml_item_id, 'variation_id', nullif(a.variation_id, ''), 'titulo', a.titulo,
          'quantidade', l.quantidade, 'status_ml', e.status_ml, 'preco_ml', e.preco_ml, 'estoque_ml', e.estoque_ml,
          'ultimo_estoque', e.ultimo_estoque, 'ultimo_preco', e.ultimo_preco, 'erro', e.erro
        ) order by l.quantidade, a.ml_item_id)
        from liga l join ml_anuncios a on a.id = l.anuncio_id left join ml_anuncios_envio e on e.anuncio_id = a.id
        where l.produto_id = p.id), '[]'::jsonb)
    ) order by case p.tipo when 'maquina' then 0 when 'acessorio' then 1 when 'peca' then 2 else 3 end, p.descricao), '[]'::jsonb)
  else null end
  from produtos p
  where p.ativo and p.no_catalogo and p.foto_caminho is not null and p.preco_venda > 0;
$$;
revoke execute on function public.ml_produtos_loja() from public, anon;
grant execute on function public.ml_produtos_loja() to authenticated;
