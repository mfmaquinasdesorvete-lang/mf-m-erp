set lock_timeout = '8s';

-- Assistente do item do Scrum: lista de tarefas, cenários (Dado/Quando/Então) e casos de teste do item,
-- e os comentários da equipe (o assistente resume a conversa).
alter table public.scrum_itens
  add column if not exists tarefas jsonb not null default '[]'::jsonb,
  add column if not exists cenarios text,
  add column if not exists testes jsonb not null default '[]'::jsonb;
alter table public.scrum_itens drop constraint if exists scrum_itens_tarefas_lista;
alter table public.scrum_itens add constraint scrum_itens_tarefas_lista check (jsonb_typeof(tarefas) = 'array');
alter table public.scrum_itens drop constraint if exists scrum_itens_testes_lista;
alter table public.scrum_itens add constraint scrum_itens_testes_lista check (jsonb_typeof(testes) = 'array');
comment on column public.scrum_itens.tarefas is 'Lista de tarefas do item: [{texto, feito}].';
comment on column public.scrum_itens.cenarios is 'Cenários no formato Dado / Quando / Então (BDD), em português.';
comment on column public.scrum_itens.testes is 'Casos de teste: [{nome, passos[], esperado[], ok (true passou, false falhou, null falta)}].';

create table if not exists public.scrum_comentarios (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.scrum_itens(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  created_at timestamptz not null default now()
);
comment on table public.scrum_comentarios is 'Conversa da equipe sobre um item do Scrum (quem escreveu e quando). Não se edita; quem escreveu ou o administrador apaga.';
create index if not exists scrum_comentarios_item on public.scrum_comentarios (item_id, created_at);

alter table public.scrum_comentarios enable row level security;
revoke all on public.scrum_comentarios from anon, public;
grant select, insert, delete on public.scrum_comentarios to authenticated;
create policy scrum_comentarios_ler on public.scrum_comentarios for select to authenticated using (public.is_erp_user());
create policy scrum_comentarios_criar on public.scrum_comentarios for insert to authenticated
  with check (public.is_erp_user() and user_id = auth.uid());
create policy scrum_comentarios_apagar on public.scrum_comentarios for delete to authenticated
  using (public.is_erp_admin() or user_id = auth.uid());
