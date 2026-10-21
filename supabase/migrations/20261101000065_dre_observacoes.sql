-- Relatórios → DRE (pedido de 19/10): observações por mês (e unidade) escritas por quem lê o DRE (financeiro e contador),
-- ex.: "outubro: compra grande de compressores", "setembro: 13º adiantado". Cada um apaga e muda só as suas.
create table if not exists public.dre_observacoes (
  id uuid primary key default gen_random_uuid(),
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  unidade_id uuid references public.unidades(id) on delete set null,
  texto text not null check (length(btrim(texto)) between 1 and 2000),
  autor uuid not null default auth.uid(),
  autor_nome text,
  created_at timestamptz not null default now()
);
create index if not exists dre_observacoes_mes_idx on public.dre_observacoes (mes);
alter table public.dre_observacoes enable row level security;
revoke all on public.dre_observacoes from anon, public;
grant select, insert, update, delete on public.dre_observacoes to authenticated;
grant all on public.dre_observacoes to service_role;
create policy dre_obs_ler on public.dre_observacoes for select to authenticated using (tem_papel('financeiro') or e_contador());
create policy dre_obs_gravar on public.dre_observacoes for insert to authenticated
  with check ((tem_papel('financeiro') or e_contador()) and autor = auth.uid());
create policy dre_obs_mudar on public.dre_observacoes for update to authenticated
  using (autor = auth.uid() or is_erp_admin()) with check (autor = auth.uid() or is_erp_admin());
create policy dre_obs_apagar on public.dre_observacoes for delete to authenticated using (autor = auth.uid() or is_erp_admin());
