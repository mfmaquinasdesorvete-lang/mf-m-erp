-- CT-e antigos pelo XML (Fretes, aba CT-e, "Enviar XML dos CT-e"): a SEFAZ só distribui os últimos 3 meses, então os
-- anteriores entram pelo XML que a transportadora (portal ou e-mail) ou o contador mandam. A tela lê o XML
-- (_shared/cte-xml.ts) e grava pela mesma salvar_cte_sefaz da busca automática (transportadora, notas, quem paga).
create or replace function public.importar_cte_xml(p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  perform public.exigir_papel('vendas', 'financeiro', 'expedicao');
  return public.salvar_cte_sefaz(p_dados || jsonb_build_object('completo', true), null);
end $$;
revoke execute on function public.importar_cte_xml(jsonb) from public, anon;
grant execute on function public.importar_cte_xml(jsonb) to authenticated;
