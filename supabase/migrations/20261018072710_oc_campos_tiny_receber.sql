-- OC (parte 5): receber a mercadoria. A conta a pagar leva o IPI e o ICMS ST do que chegou; frete, outras despesas e
-- desconto entram quando a OC fica toda recebida. OC com parcelas combinadas, recebida de uma vez: uma conta por parcela.
create or replace function public.receber_pedido_compra(p_pedido uuid, p_itens jsonb, p_gerar_conta boolean default false, p_vencimento date default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pc public.pedidos_compra;
  v_it jsonb;
  v_item public.pedido_compra_itens;
  v_qtd numeric;
  v_valor numeric := 0;
  v_status text;
  v_primeira boolean;
  v_parc jsonb;
  v_n int; v_k int := 0; v_soma numeric := 0; v_total_parc numeric; v_v numeric;
  v_obs text;
begin
  perform public.exigir_papel('financeiro', 'compras');
  select * into v_pc from public.pedidos_compra where id = p_pedido for update;
  if not found then raise exception 'pedido de compra não encontrado'; end if;
  if v_pc.status in ('recebido', 'cancelado') then raise exception 'pedido já finalizado'; end if;
  v_primeira := not exists (select 1 from public.pedido_compra_itens where pedido_compra_id = p_pedido and quantidade_recebida > 0);

  for v_it in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_it->>'quantidade')::numeric, 0);
    continue when v_qtd <= 0;
    select * into v_item from public.pedido_compra_itens where id = (v_it->>'item_id')::uuid and pedido_compra_id = p_pedido for update;
    if not found then raise exception 'item inválido'; end if;
    if v_item.quantidade_recebida + v_qtd > v_item.quantidade then
      raise exception 'quantidade recebida maior que a pedida em %', v_item.descricao;
    end if;
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
    values (v_item.produto_id, 'entrada', v_qtd, 'Pedido de compra #' || v_pc.numero, 'pedido_compra', p_pedido);
    if v_item.custo_unitario > 0 then
      update public.produtos set preco_custo = v_item.custo_unitario where id = v_item.produto_id;
    end if;
    update public.pedido_compra_itens set quantidade_recebida = quantidade_recebida + v_qtd where id = v_item.id;
    -- o que chegou: produto + IPI + ICMS ST na proporção da quantidade
    v_valor := v_valor + round(v_qtd * v_item.custo_unitario, 2)
             + round(v_qtd * v_item.custo_unitario * v_item.ipi_aliquota / 100, 2)
             + case when v_item.quantidade > 0 then round(v_item.icms_st_valor * v_qtd / v_item.quantidade, 2) else 0 end;
  end loop;

  v_status := case when exists (select 1 from public.pedido_compra_itens where pedido_compra_id = p_pedido and quantidade_recebida < quantidade)
                   then 'parcial' else 'recebido' end;
  update public.pedidos_compra
     set status = v_status, recebido_em = case when v_status = 'recebido' then now() else recebido_em end
   where id = p_pedido;

  if v_status = 'recebido' then
    v_valor := v_valor + coalesce(v_pc.frete, 0) + coalesce(v_pc.outras_despesas, 0) - coalesce(v_pc.desconto, 0);
  end if;
  v_obs := case when nullif(trim(v_pc.numero_fornecedor), '') is not null then 'Nº no fornecedor ' || trim(v_pc.numero_fornecedor) end;

  if p_gerar_conta and v_valor > 0 then
    v_n := coalesce(jsonb_array_length(v_pc.parcelas), 0);
    if v_n > 0 and v_status = 'recebido' and v_primeira then
      -- as parcelas combinadas com o fornecedor; a última acerta a diferença para o total recebido
      select coalesce(sum(coalesce((x->>'valor')::numeric, 0)), 0) into v_total_parc from jsonb_array_elements(v_pc.parcelas) x;
      for v_parc in select * from jsonb_array_elements(v_pc.parcelas) loop
        v_k := v_k + 1;
        v_v := case when v_k = v_n then v_valor - v_soma
                    when v_total_parc > 0 then round(v_valor * coalesce((v_parc->>'valor')::numeric, 0) / v_total_parc, 2)
                    else round(v_valor / v_n, 2) end;
        v_soma := v_soma + v_v;
        insert into public.contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, forma_pagamento_id, observacoes)
        values ('Pedido de compra #' || v_pc.numero || ' (' || v_k || '/' || v_n || ')', v_pc.fornecedor_id,
                coalesce(nullif(v_pc.categoria, ''), 'fornecedores'), 'PC ' || v_pc.numero, v_v,
                coalesce(public.data_ou_nula(v_parc->>'vencimento'), p_vencimento, current_date + 30 * v_k),
                v_pc.forma_pagamento_id, nullif(concat_ws(' · ', v_obs, nullif(trim(v_parc->>'observacao'), '')), ''));
      end loop;
    else
      insert into public.contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, forma_pagamento_id, observacoes)
      values ('Pedido de compra #' || v_pc.numero, v_pc.fornecedor_id, coalesce(nullif(v_pc.categoria, ''), 'fornecedores'), 'PC ' || v_pc.numero,
              v_valor, coalesce(p_vencimento, current_date + 30), v_pc.forma_pagamento_id, v_obs);
    end if;
  end if;
  return v_status;
end $$;
