-- =====================================================================
-- Comissão por categoria de produto e por vendedor + categoria
--   Calculada item a item, o mais específico vence:
--     1. % do vendedor naquela categoria (ou na categoria-mãe, "Peças > Vedação" → "Peças")
--     2. % da categoria para todos os vendedores (ou da categoria-mãe)
--     3. % geral do vendedor (cadastro do vendedor)
--   O % digitado no próprio pedido continua valendo acima de tudo.
--   Comissões já lançadas não mudam; vale para as próximas (e para os recálculos).
-- Somente acréscimos: tabela nova, funções (create or replace), gatilho de auditoria novo.
-- =====================================================================

create table if not exists public.comissao_regras (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  vendedor_id uuid references public.vendedores(id) on delete cascade,
  percentual numeric(5,2) not null check (percentual between 0 and 100),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists comissao_regras_unica
  on public.comissao_regras (lower(btrim(categoria)), coalesce(vendedor_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.comissao_regras enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comissao_regras' and policyname = 'erp_select') then
    create policy "erp_select" on public.comissao_regras for select to authenticated using (public.tem_papel('vendas', 'financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comissao_regras' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.comissao_regras for insert to authenticated with check (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comissao_regras' and policyname = 'erp_update') then
    create policy "erp_update" on public.comissao_regras for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comissao_regras' and policyname = 'erp_delete') then
    create policy "erp_delete" on public.comissao_regras for delete to authenticated using (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.comissao_regras'::regclass) then
    create trigger zz_auditoria before insert or update or delete on public.comissao_regras for each row execute function public.trg_auditoria();
  end if;
end $$;

-- % de um produto (pela categoria) para um vendedor
create or replace function public.comissao_percentual_item(p_vendedor uuid, p_categoria text, p_padrao numeric)
returns numeric language sql stable security definer set search_path = public as $$
  with c as (select lower(btrim(coalesce(p_categoria, ''))) as cat, lower(btrim(split_part(coalesce(p_categoria, ''), ' > ', 1))) as mae)
  select coalesce(
    (select r.percentual from comissao_regras r, c where r.ativo and c.cat <> '' and r.vendedor_id = p_vendedor and lower(btrim(r.categoria)) = c.cat),
    (select r.percentual from comissao_regras r, c where r.ativo and c.mae <> '' and r.vendedor_id = p_vendedor and lower(btrim(r.categoria)) = c.mae),
    (select r.percentual from comissao_regras r, c where r.ativo and c.cat <> '' and r.vendedor_id is null and lower(btrim(r.categoria)) = c.cat),
    (select r.percentual from comissao_regras r, c where r.ativo and c.mae <> '' and r.vendedor_id is null and lower(btrim(r.categoria)) = c.mae),
    p_padrao);
$$;

-- % efetivo do pedido: média dos itens pesada pelo valor (null sem itens)
create or replace function public.comissao_percentual_pedido(p_pedido uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when sum(i.quantidade * i.valor_unitario) > 0 then
           sum(i.quantidade * i.valor_unitario * public.comissao_percentual_item(p.vendedor_id, pr.categoria, v.percentual))
             / sum(i.quantidade * i.valor_unitario) end
    from pedidos p
    join vendedores v on v.id = p.vendedor_id
    join pedido_itens i on i.pedido_id = p.id
    left join produtos pr on pr.id = i.produto_id
   where p.id = p_pedido;
$$;

-- Lança a comissão de um pedido (base já sem frete, se o vendedor for assim)
create or replace function public.lancar_comissao(p_pedido uuid, p_valor numeric, p_conta uuid, p_descricao text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_vend vendedores; v_base numeric; v_pct numeric;
begin
  select * into v_ped from pedidos where id = p_pedido;
  if v_ped.vendedor_id is null then return; end if;
  select * into v_vend from vendedores where id = v_ped.vendedor_id;
  v_pct := coalesce(v_ped.comissao_percentual, public.comissao_percentual_pedido(p_pedido), v_vend.percentual);
  if v_pct <= 0 or v_ped.valor_total <= 0 then return; end if;
  v_base := round(p_valor * case when v_vend.descontar_frete then greatest(v_ped.valor_total - v_ped.frete, 0) / v_ped.valor_total else 1 end, 2);
  insert into comissoes (vendedor_id, pedido_id, conta_receber_id, descricao, base, percentual, valor)
  values (v_vend.id, p_pedido, p_conta, p_descricao, v_base, round(v_pct, 2), round(v_base * v_pct / 100, 2))
  on conflict (conta_receber_id) do nothing;
end $$;

revoke execute on function public.lancar_comissao(uuid, numeric, uuid, text) from public, anon, authenticated;
revoke execute on function public.comissao_percentual_item(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.comissao_percentual_pedido(uuid) from public, anon, authenticated;
