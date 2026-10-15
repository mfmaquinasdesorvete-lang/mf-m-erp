-- Perfil "Marketplaces": quem cuida dos anúncios ajusta os cadastros dos produtos (título, descrição, fotos, EAN,
-- categorias, marcadores, medidas e embalagens) sem ver o financeiro e sem mexer em preço, custo, estoque nem fornecedor.
--  * papel "marketplace" (principal ou adicional) nas regras de usuarios_erp;
--  * pode alterar produtos: o banco já exige o financeiro para SKU, custo e preço; o gatilho novo também segura
--    estoque, fornecedor, tipo, ativar/desativar e unificar para quem é só do marketplace;
--  * pode incluir e alterar categorias, marcadores, embalagens e mídias dos produtos e enviar fotos.
-- Só acrescenta permissões; as duas regras de papel são trocadas pela mesma regra com o papel novo.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'usuarios_erp_papel_check'
             and pg_get_constraintdef(oid) not like '%marketplace%') then
    alter table public.usuarios_erp drop constraint usuarios_erp_papel_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usuarios_erp_papel_check') then
    alter table public.usuarios_erp add constraint usuarios_erp_papel_check
      check (papel in ('admin', 'vendas', 'financeiro', 'tecnico', 'contador', 'expedicao', 'marketplace'));
  end if;

  if exists (select 1 from pg_constraint where conname = 'usuarios_erp_papeis_extras_validos'
             and pg_get_constraintdef(oid) not like '%marketplace%') then
    alter table public.usuarios_erp drop constraint usuarios_erp_papeis_extras_validos;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usuarios_erp_papeis_extras_validos') then
    alter table public.usuarios_erp add constraint usuarios_erp_papeis_extras_validos
      check (papeis_extras <@ array['vendas', 'financeiro', 'tecnico', 'expedicao', 'marketplace']::text[]);
  end if;

  -- obrigação do código em duas etapas (se existir): aceita o papel novo
  if exists (select 1 from pg_constraint where conname = 'configuracoes_mfa_papeis_validos'
             and pg_get_constraintdef(oid) not like '%marketplace%') then
    alter table public.configuracoes drop constraint configuracoes_mfa_papeis_validos;
    alter table public.configuracoes add constraint configuracoes_mfa_papeis_validos
      check (mfa_papeis <@ array['admin', 'vendas', 'financeiro', 'tecnico', 'contador', 'expedicao', 'marketplace']::text[]);
  end if;
end $$;

-- quem é só do marketplace ajusta o cadastro; o resto do produto fica com o financeiro
create or replace function public.trg_produto_marketplace() returns trigger language plpgsql set search_path = public as $f$
begin
  if current_user not in ('authenticated', 'anon') or public.tem_papel('financeiro') or not public.tem_papel('marketplace') then
    return new;
  end if;
  if new.estoque_atual is distinct from old.estoque_atual or new.estoque_minimo is distinct from old.estoque_minimo
     or new.estoque_maximo is distinct from old.estoque_maximo or new.preco_custo is distinct from old.preco_custo
     or new.preco_venda is distinct from old.preco_venda or new.fornecedor_padrao_id is distinct from old.fornecedor_padrao_id
     or new.tipo is distinct from old.tipo or new.ativo is distinct from old.ativo or new.unificado_em is distinct from old.unificado_em then
    raise exception 'o perfil Marketplaces ajusta o cadastro (título, descrição, fotos, EAN, categoria, medidas); preço, custo, estoque, fornecedor, tipo e ativar ou desativar ficam com o financeiro';
  end if;
  return new;
end $f$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_produto_marketplace' and tgrelid = 'public.produtos'::regclass) then
    create trigger trg_produto_marketplace before update on public.produtos for each row execute function public.trg_produto_marketplace();
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'produtos' and policyname = 'marketplace_update') then
    create policy "marketplace_update" on public.produtos for update to authenticated
      using (public.tem_papel('marketplace')) with check (public.tem_papel('marketplace'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias_produto' and policyname = 'marketplace_insert') then
    create policy "marketplace_insert" on public.categorias_produto for insert to authenticated with check (public.tem_papel('marketplace'));
    create policy "marketplace_update" on public.categorias_produto for update to authenticated
      using (public.tem_papel('marketplace')) with check (public.tem_papel('marketplace'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marcadores' and policyname = 'marketplace_insert') then
    create policy "marketplace_insert" on public.marcadores for insert to authenticated with check (public.tem_papel('marketplace'));
    create policy "marketplace_update" on public.marcadores for update to authenticated
      using (public.tem_papel('marketplace')) with check (public.tem_papel('marketplace'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'embalagens' and policyname = 'marketplace_insert') then
    create policy "marketplace_insert" on public.embalagens for insert to authenticated with check (public.tem_papel('marketplace'));
    create policy "marketplace_update" on public.embalagens for update to authenticated
      using (public.tem_papel('marketplace')) with check (public.tem_papel('marketplace'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'produtos_midia' and policyname = 'marketplace_insert') then
    create policy "marketplace_insert" on public.produtos_midia for insert to authenticated with check (public.tem_papel('marketplace'));
    create policy "marketplace_update" on public.produtos_midia for update to authenticated
      using (public.tem_papel('marketplace')) with check (public.tem_papel('marketplace'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'produtos_fotos_enviar_marketplace') then
    create policy "produtos_fotos_enviar_marketplace" on storage.objects for insert to authenticated
      with check (bucket_id = 'produtos-fotos' and public.tem_papel('marketplace'));
    create policy "produtos_midia_enviar_marketplace" on storage.objects for insert to authenticated
      with check (bucket_id = 'produtos-midia' and public.tem_papel('marketplace'));
  end if;
end $$;
