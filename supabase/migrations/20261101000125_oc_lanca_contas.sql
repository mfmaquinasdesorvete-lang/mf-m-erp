-- Ordem de compra lança o contas a pagar antes de a mercadoria chegar (como a usuária trabalha: faz a OC, combina
-- com o fornecedor a forma e as parcelas, manda a OC e já lança). As contas ficam ligadas à OC (pedido_compra_id);
-- o recebimento sem nota e a nota do fornecedor usam as que já existem em vez de lançar de novo.

alter table public.contas_pagar add column if not exists pedido_compra_id uuid references public.pedidos_compra(id) on delete set null;
create index if not exists contas_pagar_pedido_compra_idx on public.contas_pagar (pedido_compra_id) where pedido_compra_id is not null;

-- contas (não canceladas) da OC: as ligadas pela coluna e as antigas, lançadas no recebimento com o documento "PC <nº>"
create or replace function public.contas_da_oc(p_pedido uuid)
returns setof public.contas_pagar language sql stable set search_path = public as $$
  select c.* from public.contas_pagar c
    join public.pedidos_compra pc on pc.id = p_pedido
   where c.status <> 'cancelado'
     and (c.pedido_compra_id = p_pedido
          or (c.pedido_compra_id is null and c.documento = 'PC ' || pc.numero
              and c.fornecedor_id is not distinct from pc.fornecedor_id))
$$;
revoke execute on function public.contas_da_oc(uuid) from public, anon;
grant execute on function public.contas_da_oc(uuid) to authenticated;

-- "Lançar no contas a pagar" na OC enviada (ou recebida em parte): uma conta por parcela combinada (ou uma só em 30 dias)
create or replace function public.lancar_oc_contas_pagar(p_pedido uuid)
returns integer language plpgsql security definer set search_path = public set "TimeZone" to 'America/Sao_Paulo' as $$
declare
  v_pc public.pedidos_compra;
  v_parc jsonb; v_n int; v_k int := 0; v_soma numeric := 0; v_total_parc numeric; v_v numeric; v_total numeric;
  v_obs text;
begin
  perform public.exigir_papel('financeiro', 'compras');
  select * into v_pc from public.pedidos_compra where id = p_pedido for update;
  if not found then raise exception 'ordem de compra não encontrada'; end if;
  if v_pc.excluida_em is not null then raise exception 'esta ordem de compra foi excluída'; end if;
  -- recebida já passou pelo recebimento ou pela nota (e as do Tiny têm as contas de lá): não lança por aqui
  if v_pc.status not in ('enviado', 'parcial') then
    raise exception 'OC #% %: só a OC enviada ao fornecedor (ou recebida em parte) lança as contas por aqui', v_pc.numero,
      case v_pc.status when 'recebido' then 'já recebida' when 'cancelado' then 'cancelada' else 'ainda em cotação' end;
  end if;
  if v_pc.fornecedor_id is null then raise exception 'OC #% sem fornecedor', v_pc.numero; end if;
  if exists (select 1 from public.contas_da_oc(p_pedido)) then
    raise exception 'as contas da OC #% já estão lançadas no contas a pagar', v_pc.numero;
  end if;
  if exists (select 1 from public.nfe_oc_vinculos l join public.nfe_recebidas n on n.id = l.nfe_id
              where l.pedido_compra_id = p_pedido and l.ativo and n.conta_pagar_id is not null) then
    raise exception 'a nota do fornecedor ligada à OC #% já lançou as contas a pagar', v_pc.numero;
  end if;
  v_total := round(coalesce(v_pc.valor_total, 0), 2);
  if v_total <= 0 then raise exception 'OC #% sem valor', v_pc.numero; end if;
  v_obs := case when nullif(trim(v_pc.numero_fornecedor), '') is not null then 'Nº no fornecedor ' || trim(v_pc.numero_fornecedor) end;

  v_n := coalesce(jsonb_array_length(v_pc.parcelas), 0);
  if v_n > 0 then
    -- as parcelas combinadas com o fornecedor; a última acerta a diferença para o total da OC
    select coalesce(sum(coalesce((x->>'valor')::numeric, 0)), 0) into v_total_parc from jsonb_array_elements(v_pc.parcelas) x;
    for v_parc in select * from jsonb_array_elements(v_pc.parcelas) loop
      v_k := v_k + 1;
      v_v := case when v_k = v_n then v_total - v_soma
                  when v_total_parc > 0 then round(v_total * coalesce((v_parc->>'valor')::numeric, 0) / v_total_parc, 2)
                  else round(v_total / v_n, 2) end;
      v_soma := v_soma + v_v;
      insert into public.contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, forma_pagamento_id,
                                       observacoes, unidade_id, pedido_compra_id)
      values ('Pedido de compra #' || v_pc.numero || ' (' || v_k || '/' || v_n || ')', v_pc.fornecedor_id,
              coalesce(nullif(v_pc.categoria, ''), 'fornecedores'), 'PC ' || v_pc.numero, v_v,
              coalesce(public.data_ou_nula(v_parc->>'vencimento'), current_date + 30 * v_k),
              v_pc.forma_pagamento_id, nullif(concat_ws(' · ', v_obs, nullif(trim(v_parc->>'observacao'), '')), ''),
              v_pc.unidade_id, p_pedido);
    end loop;
  else
    v_n := 1;
    insert into public.contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, forma_pagamento_id,
                                     observacoes, unidade_id, pedido_compra_id)
    values ('Pedido de compra #' || v_pc.numero, v_pc.fornecedor_id, coalesce(nullif(v_pc.categoria, ''), 'fornecedores'),
            'PC ' || v_pc.numero, v_total, current_date + 30, v_pc.forma_pagamento_id, v_obs, v_pc.unidade_id, p_pedido);
  end if;
  return v_n;
end $$;
revoke execute on function public.lancar_oc_contas_pagar(uuid) from public, anon;
grant execute on function public.lancar_oc_contas_pagar(uuid) to authenticated;

-- recebimento sem nota: igual ao anterior, mas não lança de novo se a OC já lançou as contas, e liga as novas à OC
create or replace function public.receber_pedido_compra(p_pedido uuid, p_itens jsonb, p_gerar_conta boolean default false, p_vencimento date default null)
returns text language plpgsql security definer set search_path to 'public' set "TimeZone" to 'America/Sao_Paulo' as $function$
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
  v_custo numeric;
begin
  perform public.exigir_papel('financeiro', 'compras');
  select * into v_pc from public.pedidos_compra where id = p_pedido for update;
  if not found then raise exception 'pedido de compra não encontrado'; end if;
  if v_pc.status in ('recebido', 'cancelado') then raise exception 'pedido já finalizado'; end if;
  if exists (select 1 from public.nfe_oc_vinculos where pedido_compra_id = p_pedido and ativo) then
    raise exception 'esta ordem de compra já está ligada a uma nota fiscal: receba pela nota (Notas fiscais → confirmar entrada), que põe no estoque, acerta o custo e dá baixa aqui';
  end if;
  v_primeira := not exists (select 1 from public.pedido_compra_itens where pedido_compra_id = p_pedido and quantidade_recebida > 0);

  for v_it in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_it->>'quantidade')::numeric, 0);
    continue when v_qtd <= 0;
    select * into v_item from public.pedido_compra_itens where id = (v_it->>'item_id')::uuid and pedido_compra_id = p_pedido for update;
    if not found then raise exception 'item inválido'; end if;
    if v_item.quantidade_recebida + v_qtd > v_item.quantidade then
      raise exception 'quantidade recebida maior que a pedida em %', v_item.descricao;
    end if;
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
    values (v_item.produto_id, 'entrada', v_qtd, 'Pedido de compra #' || v_pc.numero || ' (sem nota)', 'pedido_compra', p_pedido, v_pc.unidade_id);
    -- custo completo da unidade: produto + IPI + a parte do ICMS ST
    v_custo := round(v_item.custo_unitario * (1 + coalesce(v_item.ipi_aliquota, 0) / 100)
               + case when v_item.quantidade > 0 then coalesce(v_item.icms_st_valor, 0) / v_item.quantidade else 0 end, 2);
    if v_custo > 0 then
      update public.produtos set preco_custo = v_custo where id = v_item.produto_id;
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
     set status = v_status, recebido_em = case when v_status = 'recebido' then now() else recebido_em end, recebido_sem_nota = true
   where id = p_pedido;

  if v_status = 'recebido' then
    v_valor := v_valor + coalesce(v_pc.frete, 0) + coalesce(v_pc.outras_despesas, 0) - coalesce(v_pc.desconto, 0);
  end if;
  v_obs := case when nullif(trim(v_pc.numero_fornecedor), '') is not null then 'Nº no fornecedor ' || trim(v_pc.numero_fornecedor) end;

  -- a OC já lançou as contas (Lançar no contas a pagar): não lança de novo
  if p_gerar_conta and v_valor > 0 and not exists (select 1 from public.contas_da_oc(p_pedido)) then
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
        insert into public.contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, forma_pagamento_id, observacoes, unidade_id, pedido_compra_id)
        values ('Pedido de compra #' || v_pc.numero || ' (' || v_k || '/' || v_n || ')', v_pc.fornecedor_id,
                coalesce(nullif(v_pc.categoria, ''), 'fornecedores'), 'PC ' || v_pc.numero, v_v,
                coalesce(public.data_ou_nula(v_parc->>'vencimento'), p_vencimento, current_date + 30 * v_k),
                v_pc.forma_pagamento_id, nullif(concat_ws(' · ', v_obs, nullif(trim(v_parc->>'observacao'), '')), ''), v_pc.unidade_id, p_pedido);
      end loop;
    else
      insert into public.contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, forma_pagamento_id, observacoes, unidade_id, pedido_compra_id)
      values ('Pedido de compra #' || v_pc.numero, v_pc.fornecedor_id, coalesce(nullif(v_pc.categoria, ''), 'fornecedores'), 'PC ' || v_pc.numero,
              v_valor, coalesce(p_vencimento, current_date + 30), v_pc.forma_pagamento_id, v_obs, v_pc.unidade_id, p_pedido);
    end if;
  end if;
  return v_status;
end $function$;
