-- =====================================================================
-- Teste do giga: lista de reteste das máquinas vendidas antes do registro
-- no ERP (desde 2023). Nenhum resultado é inventado: cada máquina fica
-- "sem ensaio registrado" até ser testada de verdade (na preventiva ou
-- numa OS) e ligada ao teste gravado, ou dispensada com o motivo.
-- =====================================================================
create table if not exists public.giga_retestes (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null unique references public.equipamentos(id) on delete cascade,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'testado', 'dispensado')),
  motivo text check (motivo is null or length(motivo) <= 500),
  teste_id uuid references public.testes_giga(id),
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  constraint giga_retestes_testado check (situacao <> 'testado' or teste_id is not null),
  constraint giga_retestes_dispensado check (situacao <> 'dispensado' or btrim(coalesce(motivo, '')) <> '')
);
create index if not exists giga_retestes_situacao on public.giga_retestes (situacao);

alter table public.giga_retestes enable row level security;
revoke all on public.giga_retestes from anon, authenticated;
grant select on public.giga_retestes to authenticated;
grant update (situacao, motivo, teste_id) on public.giga_retestes to authenticated;
grant all on public.giga_retestes to service_role;

do $$ begin
  create policy giga_retestes_ler on public.giga_retestes for select to authenticated
    using (public.tem_algum_papel(array['tecnico', 'financeiro']));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy giga_retestes_atualizar on public.giga_retestes for update to authenticated
    using (public.tem_algum_papel(array['tecnico'])) with check (public.tem_algum_papel(array['tecnico']));
exception when duplicate_object then null; end $$;

create or replace function public.trg_giga_retestes_atualizado()
returns trigger language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); new.atualizado_por := auth.uid(); return new; end $$;
drop trigger if exists trg_giga_retestes_atualizado on public.giga_retestes;
create trigger trg_giga_retestes_atualizado before update on public.giga_retestes
  for each row execute function public.trg_giga_retestes_atualizado();
drop trigger if exists zz_auditoria on public.giga_retestes;
create trigger zz_auditoria before insert or update on public.giga_retestes
  for each row execute function public.trg_auditoria();

-- as máquinas novas vendidas desde 2023 entram como "sem ensaio registrado"
insert into public.giga_retestes (equipamento_id)
select e.id from public.equipamentos e
where e.data_venda >= date '2023-01-01' and not coalesce(e.usada, false)
on conflict (equipamento_id) do nothing;
