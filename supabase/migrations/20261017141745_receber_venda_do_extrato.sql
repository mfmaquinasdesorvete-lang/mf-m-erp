-- Pix recebido x venda (Bancos e conciliação): a linha de entrada do extrato vira o recebimento da venda — conta a
-- receber já paga, ligada à venda e ao cliente dela, categoria "vendas" —, e a venda passa a mostrar "Recebido".
-- Serve para as vendas que vieram do Tiny sem conta a receber: o Pix tem o mesmo valor da venda e chegou logo depois.
-- Se a venda já tem uma conta em aberto com o mesmo valor, a linha baixa essa conta (como a conciliação de uma linha).
-- Recusa, sem mexer em nada: linha já tratada ou de saída, venda cancelada ou em orçamento, venda de outra unidade e
-- venda que já tem contas com outro valor (aí a conciliação é pela conta, para não contar a venda duas vezes).

create or replace function public.receber_venda_do_extrato(p_lanc uuid, p_pedido uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare l extrato_lancamentos; p pedidos; v_unid uuid; v_id uuid;
begin
  perform public.exigir_papel('financeiro');
  select * into l from extrato_lancamentos where id = p_lanc for update;
  if not found then raise exception 'linha do extrato não encontrada'; end if;
  if l.status <> 'pendente' then raise exception 'esta linha do extrato já foi tratada'; end if;
  if l.valor <= 0 then raise exception 'é uma saída, não um recebimento'; end if;
  select * into p from pedidos where id = p_pedido;
  if not found then raise exception 'venda não encontrada'; end if;
  if p.status = 'cancelado' then raise exception 'a venda #% está cancelada', p.numero; end if;
  if p.status = 'orcamento' then raise exception 'a venda #% ainda é orçamento: aprove a venda antes', p.numero; end if;
  select unidade_id into v_unid from contas_bancarias where id = l.conta_bancaria_id;
  if v_unid is not null and p.unidade_id is not null and v_unid <> p.unidade_id then
    raise exception 'a venda #% é de outra unidade que a conta do banco', p.numero;
  end if;

  -- conta da venda ainda em aberto com o mesmo valor: a linha baixa essa conta
  select id into v_id from contas_receber
   where pedido_id = p_pedido and status = 'aberto' and abs(valor - l.valor) < 0.01
   order by vencimento limit 1;
  if v_id is not null then
    perform public.conciliar_lancamento(p_lanc, 'receber', v_id);
    return v_id;
  end if;
  if exists (select 1 from contas_receber where pedido_id = p_pedido and status <> 'cancelado') then
    raise exception 'a venda #% já tem contas a receber com outro valor: concilie pela conta', p.numero;
  end if;

  insert into contas_receber (descricao, cliente_id, pedido_id, categoria, valor, vencimento, status, data_pagamento, valor_pago,
                              forma_pagamento, unidade_id, conta_bancaria_id)
  values (format('Venda #%s · %s', p.numero, l.descricao), p.cliente_id, p_pedido, 'vendas', l.valor, l.data, 'pago', l.data, l.valor,
          case when l.descricao ilike '%pix%' then 'pix' else 'transferencia' end, coalesce(v_unid, p.unidade_id), l.conta_bancaria_id)
  returning id into v_id;
  update extrato_lancamentos set status = 'conciliado', conta_receber_id = v_id, baixou_conta = false, conciliado_por = auth.uid(), conciliado_em = now()
   where id = p_lanc;
  return v_id;
end $$;
revoke execute on function public.receber_venda_do_extrato(uuid, uuid) from public, anon;
grant execute on function public.receber_venda_do_extrato(uuid, uuid) to authenticated;

/**
 * Vários pares {lanc, pedido} de uma vez (até 300). O par que uma trava recusar fica pendente e volta no resultado com
 * o motivo, sem parar o lote. Devolve {feitos, erros: [{lanc, pedido, erro}]}.
 */
create or replace function public.receber_vendas_do_extrato(p_pares jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb; v_feitos int := 0; v_erros jsonb := '[]'::jsonb;
begin
  perform public.exigir_papel('financeiro');
  if jsonb_typeof(p_pares) is distinct from 'array' then raise exception 'envie a lista de pares {lanc, pedido}'; end if;
  if jsonb_array_length(p_pares) > 300 then raise exception 'no máximo 300 linhas por vez'; end if;
  for v in select * from jsonb_array_elements(p_pares) loop
    begin
      perform public.receber_venda_do_extrato((v->>'lanc')::uuid, (v->>'pedido')::uuid);
      v_feitos := v_feitos + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('lanc', v->>'lanc', 'pedido', v->>'pedido', 'erro', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('feitos', v_feitos, 'erros', v_erros);
end $$;
revoke execute on function public.receber_vendas_do_extrato(jsonb) from public, anon;
grant execute on function public.receber_vendas_do_extrato(jsonb) to authenticated;
