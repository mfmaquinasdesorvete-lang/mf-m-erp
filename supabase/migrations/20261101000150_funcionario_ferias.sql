-- Férias tiradas por funcionário (24/10). O período aquisitivo é calculado pela data de admissão (src/lib/ferias.ts);
-- aqui fica só o que foi tirado: início, dias e de qual período aquisitivo (data em que ele começa).
-- Mesmo acesso de funcionarios: só admin e financeiro.
create table if not exists public.funcionario_ferias (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  aquisitivo_inicio date not null,
  inicio date not null,
  dias integer not null check (dias between 1 and 30),
  abono_dias integer not null default 0 check (abono_dias between 0 and 10),
  observacao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists funcionario_ferias_funcionario on public.funcionario_ferias (funcionario_id, aquisitivo_inicio);

alter table public.funcionario_ferias enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'funcionario_ferias' and policyname = 'rh_ferias') then
    create policy "rh_ferias" on public.funcionario_ferias for all to authenticated
      using ((select public.tem_papel('financeiro'))) with check ((select public.tem_papel('financeiro')));
  end if;
end $$;
revoke all on public.funcionario_ferias from anon;
grant select, insert, update, delete on public.funcionario_ferias to authenticated;
