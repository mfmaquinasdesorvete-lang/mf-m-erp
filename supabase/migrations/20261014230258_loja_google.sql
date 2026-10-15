-- =====================================================================
-- Google Shopping: a lista de produtos (feed) do Google Merchant Center passa a sair do ERP (hoje sai do Tiny).
-- loja_dados devolve também o que o Google pede: título do anúncio, código de barras (GTIN, quando não é isento),
-- categoria, peso e o prazo de envio de quem é sob encomenda (o Google exige a data; a vitrine mostra o mesmo prazo).
-- O código do fabricante NÃO sai (é o código do fornecedor da peça); o identificador do item no Google é o SKU.
-- Somente acréscimos: a mesma função, com campos a mais.
-- =====================================================================
create or replace function public.loja_dados()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'empresa', (select jsonb_build_object('nome', coalesce(nome_fantasia, razao_social), 'whatsapp', whatsapp,
                  'telefone', telefone, 'email', email, 'endereco', endereco, 'municipio', municipio, 'uf', uf, 'texto', catalogo_texto,
                  'logo', logo_url, 'cor', cor_primaria, 'slogan', slogan, 'site', site, 'instagram', instagram)
                  from configuracoes where id = 1),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'sku', p.sku, 'nome', p.descricao, 'descricao', p.descricao_catalogo, 'tipo', p.tipo,
                  'marca', p.marca, 'preco', p.preco_venda, 'foto', p.foto_caminho, 'disponibilidade', public.disponibilidade_catalogo(p),
                  'garantia_meses', coalesce(p.garantia_meses, (select garantia_meses_padrao from configuracoes where id = 1)),
                  'titulo', nullif(btrim(p.titulo_anuncio), ''),
                  'gtin', case when not coalesce(p.gtin_isento, false) then nullif(regexp_replace(coalesce(p.codigo_barras, ''), '\D', '', 'g'), '') end,
                  'categoria', nullif(btrim(p.categoria), ''),
                  'peso_kg', nullif(p.peso_kg, 0),
                  'prazo_dias', case when public.disponibilidade_catalogo(p) = 'available for order'
                                     then coalesce(nullif(p.prazo_reposicao_dias, 0), 30) end)
                  order by case p.tipo when 'maquina' then 0 when 'acessorio' then 1 when 'peca' then 2 else 3 end, p.descricao)
                  from produtos p where p.ativo and p.no_catalogo and p.foto_caminho is not null and p.preco_venda > 0), '[]'::jsonb)
  );
$$;
revoke execute on function public.loja_dados() from public;
grant execute on function public.loja_dados() to anon, authenticated;
