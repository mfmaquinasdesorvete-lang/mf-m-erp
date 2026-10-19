-- PDV: controle de caixa (abertura com troco inicial, sangrias, reforços, devoluções e fechamento com conferência).
-- Um caixa aberto por unidade de cada vez. Quem vende no balcão (vendas/financeiro) lê e grava; o fechamento guarda o
-- que foi contado em cada forma de recebimento e a diferença para o esperado.
create table if not exists public.pdv_caixas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id),
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  aberto_em timestamptz not null default now(),
  aberto_por uuid default auth.uid(),
  aberto_por_nome text,
  troco_inicial numeric(12,2) not null default 0 check (troco_inicial >= 0),
  fechado_em timestamptz,
  fechado_por uuid,
  fechado_por_nome text,
  esperado jsonb,
  contado jsonb,
  diferenca numeric(12,2),
  observacao text check (observacao is null or length(observacao) <= 500),
  criado_em timestamptz not null default now()
);
create unique index if not exists pdv_caixas_um_aberto on public.pdv_caixas (coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'aberto';

create table if not exists public.pdv_caixa_movimentos (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references public.pdv_caixas(id) on delete cascade,
  tipo text not null check (tipo in ('sangria', 'reforco', 'devolucao')),
  valor numeric(12,2) not null check (valor > 0),
  forma text not null default 'dinheiro',
  motivo text check (motivo is null or length(motivo) <= 300),
  pedido_id uuid references public.pedidos(id) on delete set null,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists pdv_caixa_movimentos_caixa on public.pdv_caixa_movimentos (caixa_id);

alter table public.pdv_caixas enable row level security;
alter table public.pdv_caixa_movimentos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pdv_caixas' and policyname = 'pdv_caixas_todos') then
    create policy pdv_caixas_todos on public.pdv_caixas for all to authenticated
      using (public.tem_papel('vendas', 'financeiro')) with check (public.tem_papel('vendas', 'financeiro'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pdv_caixa_movimentos' and policyname = 'pdv_caixa_movimentos_todos') then
    create policy pdv_caixa_movimentos_todos on public.pdv_caixa_movimentos for all to authenticated
      using (public.tem_papel('vendas', 'financeiro')) with check (public.tem_papel('vendas', 'financeiro'));
  end if;
end $$;
