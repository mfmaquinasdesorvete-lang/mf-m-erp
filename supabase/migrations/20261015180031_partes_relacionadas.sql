-- Partes relacionadas: sócios e empresas ligadas, para o painel que separa o dinheiro que vai e vem entre eles
-- e a MF (e entre as próprias contas da MF). Os CPFs e CNPJs ficam só aqui, cadastrados pela tela (nunca no código).
-- Lê: administrador, financeiro e contador. Cadastra e altera: só o administrador. Somente acréscimos.
create table if not exists public.partes_relacionadas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  tipo text not null default 'empresa' check (tipo in ('socio', 'empresa')),
  documentos text[] not null default '{}',     -- CPF/CNPJ só com números (matriz e filial na mesma linha)
  nomes_extrato text[] not null default '{}',  -- como o nome aparece no extrato do banco
  observacao text,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.partes_relacionadas enable row level security;
revoke all on public.partes_relacionadas from anon, authenticated;
grant select, insert, update on public.partes_relacionadas to authenticated;
do $$ begin
  create policy partes_ler on public.partes_relacionadas for select to authenticated using (public.tem_papel('financeiro', 'contador'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy partes_incluir on public.partes_relacionadas for insert to authenticated with check (public.is_erp_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy partes_alterar on public.partes_relacionadas for update to authenticated using (public.is_erp_admin()) with check (public.is_erp_admin());
exception when duplicate_object then null; end $$;
