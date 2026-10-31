-- Mercado Livre: o líquido da conta a receber (venda − tarifa − frete) passa a ser recalculado a cada aviso da venda,
-- e não só na aprovação. A tarifa às vezes chega depois da venda (venda #633 de 29/10 ficou com tarifa 0 e líquido
-- maior). Só mexe na parcela em aberto; paga ou cancelada fica como está.
do $mig$
declare
  d text := pg_get_functiondef('public.ml_importar_pedido(jsonb)'::regprocedure);
  velho text := $v$    -- a receber: o líquido (venda - tarifa - frete pago pela MF), na data em que o Mercado Pago libera
    v_liq := v_total - v_tarifa - v_frete;
    if v_liq > 0 then
      update contas_receber
         set valor = v_liq, vencimento = v_lib,
             descricao = 'Mercado Livre venda nº ' || v_order || ' (líquido: tarifa R$ ' || replace(to_char(v_tarifa, 'FM999G990D00'), '.', ',')
                         || ', frete R$ ' || replace(to_char(v_frete, 'FM999G990D00'), '.', ',') || ')'
       where pedido_id = v_pedido and status = 'aberto';
    end if;
  end if;
$v$;
  novo text := $v$  end if;
  -- a receber: o líquido (venda - tarifa - frete pago pela MF), na data em que o Mercado Pago libera; refeito a cada
  -- aviso, porque a tarifa às vezes chega depois da venda (só a parcela em aberto)
  v_liq := v_total - v_tarifa - v_frete;
  if v_liq > 0 then
    update contas_receber
       set valor = v_liq, vencimento = v_lib,
           descricao = 'Mercado Livre venda nº ' || v_order || ' (líquido: tarifa R$ ' || replace(to_char(v_tarifa, 'FM999G990D00'), '.', ',')
                       || ', frete R$ ' || replace(to_char(v_frete, 'FM999G990D00'), '.', ',') || ')'
     where pedido_id = v_pedido and status = 'aberto' and (valor is distinct from v_liq or vencimento is distinct from v_lib);
  end if;
$v$;
begin
  if position('refeito a cada' in d) > 0 then return; end if;
  if position(velho in d) = 0 then raise exception 'ml_importar_pedido mudou: trecho do líquido não encontrado'; end if;
  execute replace(d, velho, novo);
end $mig$;
