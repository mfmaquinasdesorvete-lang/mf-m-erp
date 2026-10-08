-- =====================================================================
-- Catálogo do WhatsApp (Meta) e vitrine pública
--   * cada produto pode ir para o catálogo com foto e descrição de venda
--   * a função catalogo-feed gera a lista (CSV) que o Gerenciador de
--     Comércio da Meta busca sozinho
--   * a vitrine (/loja) mostra os mesmos produtos, sem login
-- =====================================================================

alter table public.produtos
  add column no_catalogo boolean not null default false,
  add column descricao_catalogo text,
  add column foto_caminho text;          -- arquivo no bucket público produtos-fotos

alter table public.configuracoes
  add column catalogo_texto text default 'Máquinas de sorvete soft, expresso e milk shake com garantia, peças e assistência técnica.';

-- Disponibilidade sem expor a quantidade: máquina sem estoque = fabricamos sob encomenda
create or replace function public.disponibilidade_catalogo(p public.produtos)
returns text language sql immutable as $$
  select case when p.estoque_atual > 0 then 'in stock'
              when p.tipo = 'maquina' then 'available for order'
              else 'out of stock' end;
$$;

-- Dados públicos da vitrine (sem custo, estoque exato, fornecedor etc.)
create or replace function public.loja_dados()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'empresa', (select jsonb_build_object('nome', coalesce(nome_fantasia, razao_social), 'whatsapp', whatsapp,
                  'telefone', telefone, 'email', email, 'endereco', endereco, 'municipio', municipio, 'uf', uf, 'texto', catalogo_texto)
                  from configuracoes where id = 1),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'sku', p.sku, 'nome', p.descricao, 'descricao', p.descricao_catalogo, 'tipo', p.tipo,
                  'preco', p.preco_venda, 'foto', p.foto_caminho, 'disponibilidade', public.disponibilidade_catalogo(p),
                  'garantia_meses', coalesce(p.garantia_meses, (select garantia_meses_padrao from configuracoes where id = 1)))
                  order by case p.tipo when 'maquina' then 0 when 'acessorio' then 1 when 'peca' then 2 else 3 end, p.descricao)
                  from produtos p where p.ativo and p.no_catalogo and p.foto_caminho is not null and p.preco_venda > 0), '[]'::jsonb)
  );
$$;
revoke execute on function public.loja_dados() from public;
grant execute on function public.loja_dados() to anon, authenticated;

-- Fotos dos produtos: leitura pública (a Meta e a vitrine precisam abrir), envio por quem edita produtos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos-fotos', 'produtos-fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "produtos_fotos_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos-fotos' and public.tem_papel('financeiro'));
create policy "produtos_fotos_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos-fotos' and public.tem_papel('financeiro'));
