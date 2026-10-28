-- Comissão da parcela que já teve uma comissão cancelada (28/10, pedido #628): lancar_comissao fazia
-- "on conflict (conta_receber_id) do nothing" e a cancelada ocupava a vaga, então a comissão nova não entrava.
-- Agora a cancelada é reaberta com os valores novos (a_pagar); comissão viva continua intocada.
do $$
declare d text; antes text := 'on conflict (conta_receber_id) do nothing;';
  depois text := 'on conflict (conta_receber_id) do update set descricao = excluded.descricao, base = excluded.base, percentual = excluded.percentual, valor = excluded.valor, vendedor_id = excluded.vendedor_id, status = ''a_pagar'', pago_em = null where comissoes.status = ''cancelada'' and comissoes.conta_pagar_id is null;';
begin
  d := pg_get_functiondef('public.lancar_comissao(uuid, numeric, uuid, text)'::regprocedure);
  if position(depois in d) = 0 then
    if position(antes in d) = 0 then raise exception 'lancar_comissao mudou: confira o trecho do on conflict'; end if;
    execute replace(d, antes, depois);
  end if;
end $$;
