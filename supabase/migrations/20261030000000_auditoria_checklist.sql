-- =====================================================================
-- Auditoria financeira: checklist do mês (competência).
--   Cada pergunta (contas a receber, a pagar, caixa e conciliação, vínculo com
--   vendas e OS, categorias e relatórios, acesso e segregação) recebe uma
--   situação (conforme, não conforme, não se aplica) e a evidência conferida,
--   com quem conferiu e quando. O financeiro, o administrador e o contador
--   respondem (o contador serve de revisão independente). Ninguém apaga.
-- Idempotente: pode rodar de novo sem erro.
-- =====================================================================

create table if not exists public.auditoria_checklist (
  id uuid primary key default gen_random_uuid(),
  competencia text not null check (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
  item text not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'ok', 'nao_conforme', 'na')),
  observacao text,
  revisado_por uuid,
  revisado_nome text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (competencia, item)
);
alter table public.auditoria_checklist enable row level security;

do $$ begin
  create policy "ac_select" on public.auditoria_checklist for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ac_insert" on public.auditoria_checklist for insert to authenticated with check (public.tem_papel('financeiro') or public.e_contador());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ac_update" on public.auditoria_checklist for update to authenticated
    using (public.tem_papel('financeiro') or public.e_contador()) with check (public.tem_papel('financeiro') or public.e_contador());
exception when duplicate_object then null; end $$;

-- quem conferiu e quando é sempre quem está logado (não dá para assinar por outra pessoa)
create or replace function public.trg_checklist_revisor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.revisado_por := auth.uid();
  new.revisado_nome := (select nome from public.usuarios_erp where user_id = auth.uid());
  new.updated_at := now();
  return new;
end $$;

do $$ begin
  create trigger trg_checklist_revisor before insert or update on public.auditoria_checklist for each row execute function public.trg_checklist_revisor();
exception when duplicate_object then null; end $$;
-- histórico das respostas (quem mudou de "conforme" para "não conforme" etc.)
do $$ begin
  create trigger zz_auditoria before insert or update on public.auditoria_checklist for each row execute function public.trg_auditoria();
exception when duplicate_object then null; end $$;
