-- OC (parte 3): o total da OC passa a somar IPI, ICMS ST e outras despesas e tirar o desconto.
create or replace function public.trg_pedido_compra_total()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.pedidos_compra pc
     set valor_total = public.pedido_compra_total(pc.id, pc.frete, pc.outras_despesas, pc.desconto)
   where pc.id = coalesce(new.pedido_compra_id, old.pedido_compra_id);
  return null;
end $$;

create or replace function public.trg_pedido_compra_frete()
returns trigger language plpgsql set search_path = public as $$
begin
  new.valor_total := public.pedido_compra_total(new.id, new.frete, new.outras_despesas, new.desconto);
  return new;
end $$;
