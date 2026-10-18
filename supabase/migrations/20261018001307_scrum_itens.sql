set lock_timeout = '8s';

create table if not exists public.scrum_itens (
  id uuid primary key default gen_random_uuid(),
  time_id uuid not null references public.scrum_times(id) on delete cascade,
  sprint_id uuid references public.scrum_sprints(id) on delete set null,
  tipo text not null default 'historia' check (tipo in ('historia', 'tarefa', 'bug', 'melhoria')),
  titulo text not null check (length(btrim(titulo)) > 0),
  descricao text,
  criterio_aceite text,
  pontos int check (pontos in (0, 1, 2, 3, 5, 8, 13, 21)),
  prioridade int not null default 1000,
  status text not null default 'a_fazer' check (status in ('a_fazer', 'fazendo', 'revisao', 'feito')),
  responsavel_id uuid,
  ideia_id uuid,
  created_by uuid default auth.uid(),
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.scrum_itens is 'Itens do backlog (sprint_id vazio) e das sprints. ideia_id: veio das Ideias do Sobre o ERP Line.';
create index if not exists scrum_itens_time on public.scrum_itens (time_id, sprint_id);
create index if not exists scrum_itens_sprint on public.scrum_itens (sprint_id) where sprint_id is not null;
create unique index if not exists scrum_itens_ideia on public.scrum_itens (ideia_id) where ideia_id is not null;

alter table public.scrum_itens enable row level security;
create policy "scrum_itens_ler" on public.scrum_itens for select to authenticated using (public.is_erp_user());
create policy "scrum_itens_criar" on public.scrum_itens for insert to authenticated with check (public.is_erp_user());
create policy "scrum_itens_editar" on public.scrum_itens for update to authenticated using (public.is_erp_user()) with check (public.is_erp_user());
create policy "scrum_itens_excluir" on public.scrum_itens for delete to authenticated using (public.is_erp_admin() or created_by = auth.uid());
