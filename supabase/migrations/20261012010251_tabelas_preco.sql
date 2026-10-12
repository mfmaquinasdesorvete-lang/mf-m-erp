-- =====================================================================
-- Tabelas de preço (Marketplace, Revenda, Atacado…)
--   * cada tabela: % sobre o preço de venda (ex.: Marketplace +20%, Revenda −15%) + arredondamento
--   * preço fixo opcional por produto (vale no lugar do %)
--   * cliente pode ter a sua tabela (revendedor → Revenda); o pedido guarda a tabela usada
-- Somente acréscimos: tabelas e colunas novas, função nova, gatilhos de auditoria novos.
-- =====================================================================

create table if not exists public.tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  canal text check (canal in ('marketplace', 'revenda', 'atacado', 'outro')),
  ajuste_percentual numeric(6,2) not null default 0 check (ajuste_percentual between -90 and 500),
  arredondamento text not null default 'centavos' check (arredondamento in ('centavos', 'inteiro', 'final90')),
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tabelas_preco_nome on public.tabelas_preco (lower(btrim(nome)));

create table if not exists public.tabela_preco_itens (
  id uuid primary key default gen_random_uuid(),
  tabela_id uuid not null references public.tabelas_preco(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  preco numeric(12,2) not null check (preco >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tabela_id, produto_id)
);
create index if not exists tabela_preco_itens_produto on public.tabela_preco_itens (produto_id);

alter table public.clientes add column if not exists tabela_preco_id uuid references public.tabelas_preco(id) on delete set null;
alter table public.pedidos add column if not exists tabela_preco_id uuid references public.tabelas_preco(id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['tabelas_preco', 'tabela_preco_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_select') then
      execute format('create policy "erp_select" on public.%I for select to authenticated using (public.is_erp_user())', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_insert') then
      execute format('create policy "erp_insert" on public.%I for insert to authenticated with check (public.tem_papel(''financeiro''))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_update') then
      execute format('create policy "erp_update" on public.%I for update to authenticated using (public.tem_papel(''financeiro'')) with check (public.tem_papel(''financeiro''))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_delete') then
      execute format('create policy "erp_delete" on public.%I for delete to authenticated using (public.tem_papel(''financeiro''))', t);
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = format('public.%I', t)::regclass) then
      execute format('create trigger zz_auditoria before insert or update or delete on public.%I for each row execute function public.trg_auditoria()', t);
    end if;
  end loop;
end $$;

-- Preço de um produto numa tabela (preço fixo, ou % sobre o preço de venda com o arredondamento da tabela)
create or replace function public.preco_tabela(p_tabela uuid, p_produto uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select i.preco from tabela_preco_itens i where i.tabela_id = p_tabela and i.produto_id = p_produto),
    (select case t.arredondamento
              when 'inteiro' then ceil(v - 0.000000001)
              when 'final90' then ceil(v + 0.1 - 0.000000001) - 0.1
              else round(v, 2) end
       from tabelas_preco t,
            lateral (select p.preco_venda * (1 + t.ajuste_percentual / 100) as v from produtos p where p.id = p_produto) x
      where t.id = p_tabela and t.ativo),
    (select preco_venda from produtos where id = p_produto));
$$;
revoke execute on function public.preco_tabela(uuid, uuid) from public, anon;
grant execute on function public.preco_tabela(uuid, uuid) to authenticated;
