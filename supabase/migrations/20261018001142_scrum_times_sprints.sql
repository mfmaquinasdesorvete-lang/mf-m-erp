set lock_timeout = '8s';

-- Scrum por equipe: cada equipe tem backlog, sprints de 1 ou 2 semanas, quadro, daily, revisão e retrospectiva.
create table if not exists public.scrum_times (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default '#6366f1',
  descricao text,
  sprint_dias int not null default 14 check (sprint_dias in (7, 14)),
  membros uuid[] not null default '{}',
  dono_produto uuid,
  scrum_master uuid,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.scrum_times is 'Equipes do Scrum (ERP Line, Produção, Assistência, Vendas, Financeiro). Só o administrador edita.';

create table if not exists public.scrum_sprints (
  id uuid primary key default gen_random_uuid(),
  time_id uuid not null references public.scrum_times(id) on delete cascade,
  numero int not null,
  objetivo text,
  inicio date not null,
  fim date not null,
  status text not null default 'planejada' check (status in ('planejada', 'ativa', 'encerrada')),
  pontos_planejados int,
  pontos_feitos int,
  revisao text,
  retro_bom text,
  retro_melhorar text,
  retro_acoes text,
  encerrada_em timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (time_id, numero),
  check (fim >= inicio)
);
comment on table public.scrum_sprints is 'Sprints de cada equipe; só uma ativa por equipe. Ao encerrar, o que não terminou volta ao backlog.';
create unique index if not exists scrum_sprints_uma_ativa on public.scrum_sprints (time_id) where status = 'ativa';

alter table public.scrum_times enable row level security;
alter table public.scrum_sprints enable row level security;

create policy "scrum_times_ler" on public.scrum_times for select to authenticated using (public.is_erp_user());
create policy "scrum_times_admin" on public.scrum_times for all to authenticated using (public.is_erp_admin()) with check (public.is_erp_admin());

create policy "scrum_sprints_ler" on public.scrum_sprints for select to authenticated using (public.is_erp_user());
create policy "scrum_sprints_criar" on public.scrum_sprints for insert to authenticated with check (public.is_erp_user());
create policy "scrum_sprints_editar" on public.scrum_sprints for update to authenticated using (public.is_erp_user()) with check (public.is_erp_user());
create policy "scrum_sprints_excluir" on public.scrum_sprints for delete to authenticated using (public.is_erp_admin() or (status = 'planejada' and created_by = auth.uid()));
