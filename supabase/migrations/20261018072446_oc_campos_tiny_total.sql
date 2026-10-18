-- OC (parte 2): total = produtos + IPI + ICMS ST + frete + outras despesas - desconto.
create or replace function public.pedido_compra_total(p_pedido uuid, p_frete numeric, p_outras numeric, p_desconto numeric)
returns numeric language sql stable set search_path = public as $$
  select greatest(0, coalesce((select sum(round(quantidade * custo_unitario, 2)
                                         + round(quantidade * custo_unitario * ipi_aliquota / 100, 2)
                                         + icms_st_valor)
                                 from pedido_compra_itens where pedido_compra_id = p_pedido), 0)
            + coalesce(p_frete, 0) + coalesce(p_outras, 0) - coalesce(p_desconto, 0))
$$;

revoke execute on function public.pedido_compra_total(uuid, numeric, numeric, numeric) from public, anon;
grant execute on function public.pedido_compra_total(uuid, numeric, numeric, numeric) to authenticated, service_role;
