set lock_timeout = '8s';

create table if not exists public.scrum_daily (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.scrum_sprints(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  nome text,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  fiz text,
  vou_fazer text,
  impedimentos text,
  impedimento_resolvido boolean not null default false,
  created_at timestamptz not null default now(),
  unique (sprint_id, user_id, dia)
);
comment on table public.scrum_daily is 'Daily de cada pessoa: o que fiz, o que vou fazer e o que me impede.';

alter table public.scrum_daily enable row level security;
create policy "scrum_daily_ler" on public.scrum_daily for select to authenticated using (public.is_erp_user());
create policy "scrum_daily_criar" on public.scrum_daily for insert to authenticated with check (public.is_erp_user() and user_id = auth.uid());
create policy "scrum_daily_editar" on public.scrum_daily for update to authenticated
  using (public.is_erp_user() and (user_id = auth.uid() or public.is_erp_admin())) with check (public.is_erp_user());
create policy "scrum_daily_excluir" on public.scrum_daily for delete to authenticated using (user_id = auth.uid() or public.is_erp_admin());
