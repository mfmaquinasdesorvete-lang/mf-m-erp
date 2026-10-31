set lock_timeout = '8s';
-- Revisão (31/10): as regras de acesso de licenciados_marcas leem o usuário uma vez por consulta, não em cada linha,
-- e o dono ganha índice (chave estrangeira sem índice). Mesmo acesso de antes: só o dono lê e muda.
drop policy if exists licenciados_marcas_ler on public.licenciados_marcas;
drop policy if exists licenciados_marcas_criar on public.licenciados_marcas;
drop policy if exists licenciados_marcas_mudar on public.licenciados_marcas;
create policy licenciados_marcas_ler on public.licenciados_marcas for select to authenticated using (dono = (select auth.uid()));
create policy licenciados_marcas_criar on public.licenciados_marcas for insert to authenticated with check (dono = (select auth.uid()));
create policy licenciados_marcas_mudar on public.licenciados_marcas for update to authenticated using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create index if not exists licenciados_marcas_dono_idx on public.licenciados_marcas (dono);
