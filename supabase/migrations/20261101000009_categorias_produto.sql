-- =====================================================================
-- Categorias dos produtos (como no Tiny): lista própria para escolher no cadastro, com subcategorias no formato
-- "Categoria > Subcategoria". O produto continua guardando o nome da categoria (produtos.categoria).
-- =====================================================================
create table if not exists public.categorias_produto (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (btrim(nome) <> ''),
  ativo boolean not null default true,      -- tirar da lista sem apagar
  created_at timestamptz not null default now()
);
alter table public.categorias_produto add column if not exists ativo boolean not null default true;
alter table public.categorias_produto enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias_produto' and policyname = 'erp_select') then
    create policy "erp_select" on public.categorias_produto for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias_produto' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.categorias_produto for insert to authenticated with check (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias_produto' and policyname = 'erp_update') then
    create policy "erp_update" on public.categorias_produto for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;
grant select, insert, update on public.categorias_produto to authenticated;

-- as categorias do Tiny e as que já estão nos produtos
insert into public.categorias_produto (nome)
select x from unnest(array[
  '& Produtos Fabricação My Frost', 'As Extrutura Máquinas', 'As Máquinas My Frost', 'Batedor de Milk', 'Brinquedos e Hobbies',
  'Calda Soft Premium', 'Chave Extratora - Portelo', 'Componentes máquina', 'Compressores - My Frost', 'Construção',
  'Eletrodomésticos', 'Ferramentas', 'Inversores My Frost', 'Máquinas de Sorvete Expresso', 'Peças de Reposição',
  'Peças de Reposição - SITE', 'Peças Eletrica - My Frost', 'Peças Mecânica - My Frost', 'Peças Refrigeração - My Frost',
  'Vedantes/ Orings My Frost']) x
union
select distinct btrim(categoria) from public.produtos where nullif(btrim(categoria), '') is not null
on conflict (nome) do nothing;

-- Renomear: troca também nos produtos (inclusive nas subcategorias "Nome > ...")
create or replace function public.renomear_categoria_produto(p_de text, p_para text)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_para text := btrim(coalesce(p_para, ''));
begin
  perform public.exigir_papel('financeiro');
  if v_para = '' then raise exception 'informe o novo nome'; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  -- primeiro a lista (se o novo nome já existe, as duas se juntam e a antiga sai da lista)
  if not exists (select 1 from categorias_produto where nome = v_para) then
    update categorias_produto set nome = v_para where nome = p_de;
  else
    update categorias_produto set ativo = false where nome = p_de;  -- juntou com a existente
  end if;
  update categorias_produto set ativo = true where nome = v_para;
  update categorias_produto set nome = v_para || substr(nome, length(p_de) + 1)
   where nome like p_de || ' > %' and not exists (select 1 from categorias_produto c2 where c2.nome = v_para || substr(categorias_produto.nome, length(p_de) + 1));
  -- depois os produtos (inclusive os das subcategorias "Nome > ...")
  update produtos set categoria = v_para || substr(categoria, length(p_de) + 1)
   where categoria = p_de or categoria like p_de || ' > %';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.renomear_categoria_produto(text, text) from public, anon;
grant execute on function public.renomear_categoria_produto(text, text) to authenticated;

-- categoria nova digitada no produto entra na lista
create or replace function public.trg_categoria_produto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(new.categoria), '') is not null then
    new.categoria := btrim(new.categoria);
    insert into categorias_produto (nome) values (new.categoria) on conflict (nome) do update set ativo = true;
  end if;
  return new;
end $$;
create or replace trigger trg_categoria_produto before insert or update of categoria on public.produtos
  for each row execute function public.trg_categoria_produto();
