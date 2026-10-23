-- Notas fiscais da My Frost (empresa anterior) isoladas na Retaguarda: só a conta master lê notas_legado.
-- Antes qualquer usuário do ERP lia (ficha do cliente, Tudo do cliente, proposta). A importação continua pela função
-- importar_notas_legado (security definer), que só o administrador chama.
create policy notas_legado_so_master on public.notas_legado as restrictive for select
  using ((select public.is_erp_master()));
