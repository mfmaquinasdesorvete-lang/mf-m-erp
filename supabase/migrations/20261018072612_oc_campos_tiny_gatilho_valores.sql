-- OC (parte 4): mudar desconto ou outras despesas também recalcula o total (o gatilho do frete continua como estava;
-- apagar o gatilho antigo pede confirmação no Supabase, então este é um gatilho a mais com a mesma função).
create trigger trg_pedido_compra_valores before update of desconto, outras_despesas on public.pedidos_compra
  for each row execute function public.trg_pedido_compra_frete();
