-- Adiantamento para funcionário: a conta a pagar vai na categoria "adiantamento a funcionários" (fora do DRE, é só dinheiro
-- que saiu para alguém gastar pela empresa). Depois a pessoa presta contas: os gastos por categoria (combustível,
-- correios…), que é o que entra no DRE, e o troco que devolveu. Os comprovantes ficam nos anexos da própria conta.
insert into public.categorias_financeiras (nome, tipo, grupo, ativo, ordem)
select 'adiantamento a funcionários', 'despesa', 'transferencia', true, 97
where not exists (select 1 from public.categorias_financeiras where lower(nome) = 'adiantamento a funcionários' and tipo = 'despesa');
insert into public.categorias_financeiras (nome, tipo, grupo, ativo, ordem)
select 'correios', 'despesa', 'custo', true, 31
where not exists (select 1 from public.categorias_financeiras where lower(nome) = 'correios' and tipo = 'despesa');

create table if not exists public.adiantamento_prestacoes (
  conta_pagar_id uuid primary key references public.contas_pagar(id) on delete cascade,
  troco numeric(12,2) not null default 0 check (troco >= 0),
  observacao text check (observacao is null or length(observacao) <= 500),
  prestado_em timestamptz not null default now(),
  prestado_por uuid default auth.uid(),
  prestado_por_nome text
);

create table if not exists public.adiantamento_gastos (
  id uuid primary key default gen_random_uuid(),
  conta_pagar_id uuid not null references public.contas_pagar(id) on delete cascade,
  data date not null default current_date,
  categoria text not null check (length(categoria) between 1 and 80),
  valor numeric(12,2) not null check (valor > 0),
  descricao text check (descricao is null or length(descricao) <= 200),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
create index if not exists adiantamento_gastos_conta on public.adiantamento_gastos (conta_pagar_id);

alter table public.adiantamento_prestacoes enable row level security;
alter table public.adiantamento_gastos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'adiantamento_prestacoes' and policyname = 'adiantamento_prestacoes_financeiro') then
    create policy adiantamento_prestacoes_financeiro on public.adiantamento_prestacoes for all to authenticated
      using (public.tem_papel('financeiro', 'contador')) with check (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'adiantamento_gastos' and policyname = 'adiantamento_gastos_financeiro') then
    create policy adiantamento_gastos_financeiro on public.adiantamento_gastos for all to authenticated
      using (public.tem_papel('financeiro', 'contador')) with check (public.tem_papel('financeiro'));
  end if;
end $$;
