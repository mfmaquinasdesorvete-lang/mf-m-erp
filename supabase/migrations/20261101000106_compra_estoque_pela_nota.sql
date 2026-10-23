-- Ordem de compra: o estoque entra pela NOTA do fornecedor (Notas fiscais → confirmar entrada: põe no estoque, acerta
-- o custo completo e dá baixa na OC). O botão "Receber" da OC fica para compra SEM nota. Antes os dois caminhos
-- punham no estoque e a mesma compra entrava duas vezes (100 parafusos viravam 200).
alter table public.pedidos_compra add column if not exists recebido_sem_nota boolean not null default false;
-- quanto de cada produto a nota deixou de pôr no estoque por já ter entrado sem nota ({produto_id: quantidade})
alter table public.nfe_recebidas add column if not exists descontado_sem_nota jsonb;

-- Receber sem nota: recusa OC já ligada a uma nota; marca a OC; estoque na unidade da OC; custo com IPI e ICMS ST.
create or replace function public.receber_pedido_compra(p_pedido uuid, p_itens jsonb, p_gerar_conta boolean default false, p_vencimento date default null)
returns text language plpgsql security definer set search_path = public set timezone to 'America/Sao_Paulo' as $$
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

-- Entrada pela nota: o produto de uma OC já recebida SEM nota (ligada a esta nota) não entra de novo no estoque;
-- o custo e o resto da nota seguem normalmente.
create or replace function public.confirmar_entrada_nota(p_nfe uuid, p_itens jsonb, p_custos jsonb default '[]'::jsonb,
  p_opcoes jsonb default '{}'::jsonb, p_baixas jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nfe public.nfe_recebidas;
  v_itens jsonb;
  v_n int;
  v_c jsonb := '{}'::jsonb;
  v_b int := 0;
  v_ja int := 0;
  v_e jsonb; v_prod text; v_ja_lido jsonb := '{}'::jsonb; v_resto numeric; v_fator numeric; v_qtd numeric; v_tira numeric;
  v_desc jsonb := '{}'::jsonb;
begin
  perform public.exigir_papel('financeiro', 'compras');
  perform set_config('erp.acao_usuario', 'on', true);
  select * into v_nfe from public.nfe_recebidas where id = p_nfe for update;
  if not found or v_nfe.excluida_em is not null then raise exception 'nota não encontrada'; end if;
  if v_nfe.estoque_lancado then raise exception 'o estoque desta nota já foi lançado'; end if;
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then raise exception 'lista de itens inválida'; end if;
  -- o custo vai pela conta completa (p_custos), não pelo valor unitário da nota. Do produto de uma OC ligada a esta
  -- nota que já foi recebida SEM nota (botão Receber), sai da entrada só a quantidade que já entrou no estoque.
  v_itens := '[]'::jsonb;
  for v_e in select e from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e loop
    v_prod := nullif(v_e->>'produto_id', '');
    if v_prod is not null and not v_ja_lido ? v_prod then
      -- o que entrou sem nota = recebido na OC − baixas feitas por notas − o que outras notas já descontaram
      select coalesce(sum(i.quantidade_recebida - coalesce((select sum(b.quantidade) from public.nfe_oc_baixas b
                                                             where b.pedido_compra_item_id = i.id), 0)), 0)
        into v_resto
        from public.pedido_compra_itens i
       where i.produto_id::text = v_prod
         and i.pedido_compra_id in (select l.pedido_compra_id from public.nfe_oc_vinculos l
                                      join public.pedidos_compra pc on pc.id = l.pedido_compra_id and pc.recebido_sem_nota
                                     where l.nfe_id = p_nfe and l.ativo);
      v_resto := v_resto - coalesce((select sum((n.descontado_sem_nota->>v_prod)::numeric) from public.nfe_recebidas n
                                      where n.id <> p_nfe and n.descontado_sem_nota ? v_prod
                                        and exists (select 1 from public.nfe_oc_vinculos l1 join public.nfe_oc_vinculos l2
                                                      on l2.pedido_compra_id = l1.pedido_compra_id and l2.ativo
                                                     where l1.nfe_id = n.id and l1.ativo and l2.nfe_id = p_nfe)), 0);
      v_resto := greatest(v_resto, 0);
      v_ja_lido := v_ja_lido || jsonb_build_object(v_prod, v_resto);
    end if;
    v_resto := coalesce((v_ja_lido->>v_prod)::numeric, 0);
    if v_prod is not null and v_resto > 0 then
      v_fator := coalesce(nullif(v_e->>'fator', '')::numeric, 1);
      if v_fator <= 0 then raise exception 'fator de conversão inválido no item %', v_e->>'descricao'; end if;
      v_qtd := coalesce(nullif(v_e->>'quantidade', '')::numeric, 0) * v_fator;  -- em unidades do estoque
      v_tira := least(v_qtd, v_resto);
      v_ja_lido := v_ja_lido || jsonb_build_object(v_prod, v_resto - v_tira);
      v_desc := v_desc || jsonb_build_object(v_prod, coalesce((v_desc->>v_prod)::numeric, 0) + v_tira);
      v_ja := v_ja + 1;
      continue when v_qtd - v_tira <= 0;
      v_e := v_e || jsonb_build_object('quantidade', round((v_qtd - v_tira) / v_fator, 6));
    end if;
    v_itens := v_itens || jsonb_build_array(v_e || jsonb_build_object('atualizar_custo', false));
  end loop;
  if v_desc <> '{}'::jsonb then
    update public.nfe_recebidas set descontado_sem_nota = v_desc where id = p_nfe;
  end if;
  -- baixa nas OCs recebidas sem nota: só o que ainda falta receber (a parte que chegou sem nota já foi baixada)
  select coalesce(jsonb_agg(case when x.pc_sem_nota then x.b || jsonb_build_object('quantidade', x.q) else x.b end), '[]'::jsonb)
    into p_baixas
    from (select b, coalesce(pc.recebido_sem_nota, false) as pc_sem_nota,
                 least(coalesce(nullif(b->>'quantidade', '')::numeric, 0), greatest(i.quantidade - i.quantidade_recebida, 0)) as q
            from jsonb_array_elements(coalesce(p_baixas, '[]'::jsonb)) b
            left join public.pedido_compra_itens i on i.id::text = nullif(b->>'item_id', '')
            left join public.pedidos_compra pc on pc.id = i.pedido_compra_id) x
   where not x.pc_sem_nota or x.q > 0;
  if jsonb_array_length(v_itens) = 0 and v_ja > 0 then
    -- todos os itens já tinham entrado pela OC recebida sem nota: só marca a nota como lançada
    update public.nfe_recebidas set estoque_lancado = true, estoque_lancado_em = now() where id = p_nfe;
    v_n := 0;
  else
    v_n := public.lancar_estoque_nfe_core(p_nfe, v_itens);
  end if;
  if jsonb_array_length(coalesce(p_custos, '[]'::jsonb)) > 0 then
    v_c := public.nf_custos_core(p_nfe, p_custos, p_opcoes);
  end if;
  if jsonb_array_length(coalesce(p_baixas, '[]'::jsonb)) > 0 then
    v_b := public.nf_baixa_oc_core(p_nfe, p_baixas);
  end if;
  perform public.nf_auditar('nfe_recebidas', p_nfe, 'entrada_nota',
    format('%s item(ns) no estoque, %s custo(s) atualizado(s), %s item(ns) baixado(s) em ordem de compra%s',
      v_n, coalesce(v_c->>'custos', '0'), v_b,
      case when v_ja > 0 then format(', %s item(ns) com a quantidade já recebida sem nota descontada', v_ja) else '' end));
  return jsonb_build_object('itens', v_n, 'baixas', v_b, 'custos', coalesce((v_c->>'custos')::int, 0),
    'para_aprovar', coalesce((v_c->>'para_aprovar')::int, 0), 'aprovados', coalesce((v_c->>'aprovados')::int, 0),
    'ja_recebidos', v_ja);
end $$;
