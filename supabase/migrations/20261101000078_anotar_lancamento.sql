-- Entradas acima de R$ 5 mil (Retaguarda): a conta master anota de quem é e o que foi cada entrada do extrato.
-- extrato_lancamentos só tem leitura pela API; a anotação passa por esta função, que confere a master.
create or replace function public.anotar_lancamento(p_id uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_erp_master() then raise exception 'Só a conta master pode anotar estas entradas'; end if;
  update public.extrato_lancamentos set observacao = nullif(btrim(p_texto), '') where id = p_id;
  if not found then raise exception 'Lançamento não encontrado'; end if;
end $$;
revoke all on function public.anotar_lancamento(uuid, text) from public, anon;
grant execute on function public.anotar_lancamento(uuid, text) to authenticated;
