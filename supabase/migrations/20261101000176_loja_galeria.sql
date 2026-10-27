-- Loja: as fotos da galeria do produto (produtos_midia, só fotos ativas, na ordem da galeria) vão junto com a foto
-- principal, para a página do produto mostrar várias fotos como o Mercado Livre (até 12 no total).
create or replace function public.loja_dados()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'empresa', (select jsonb_build_object('nome', coalesce(nome_fantasia, razao_social), 'whatsapp', whatsapp,
                  'telefone', telefone, 'email', email, 'endereco', endereco, 'municipio', municipio, 'uf', uf, 'texto', catalogo_texto,
                  'logo', logo_url, 'cor', cor_primaria, 'slogan', slogan, 'site', site, 'instagram', instagram)
                  from configuracoes where id = 1),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'sku', p.sku, 'nome', p.descricao, 'subtitulo', nullif(btrim(p.subtitulo), ''),
                  'descricao', p.descricao_catalogo, 'tipo', p.tipo,
                  'marca', p.marca, 'preco', p.preco_venda, 'foto', p.foto_caminho, 'disponibilidade', public.disponibilidade_catalogo(p),
                  'garantia_meses', coalesce(p.garantia_meses, (select garantia_meses_padrao from configuracoes where id = 1)),
                  'titulo', nullif(btrim(p.titulo_anuncio), ''),
                  'gtin', case when not coalesce(p.gtin_isento, false) then nullif(regexp_replace(coalesce(p.codigo_barras, ''), '\D', '', 'g'), '') end,
                  'categoria', nullif(btrim(p.categoria), ''),
                  'peso_kg', nullif(p.peso_kg, 0),
                  'prazo_dias', case when public.disponibilidade_catalogo(p) = 'available for order'
                                     then coalesce(nullif(p.prazo_reposicao_dias, 0), 30) end,
                  'galeria', (select jsonb_agg(g.caminho order by g.ordem, g.created_at) from (
                                select m.caminho, m.ordem, m.created_at from produtos_midia m
                                 where m.produto_id = p.id and m.tipo = 'foto' and m.ativo
                                 order by m.ordem, m.created_at limit 11) g))
                  order by case p.tipo when 'maquina' then 0 when 'acessorio' then 1 when 'peca' then 2 else 3 end, p.descricao)
                  from produtos p where p.ativo and p.no_catalogo and p.foto_caminho is not null and p.preco_venda > 0), '[]'::jsonb)
  );
$$;
