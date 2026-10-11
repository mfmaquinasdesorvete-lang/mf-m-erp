-- =====================================================================
-- PDV: venda de balcão em um passo (Vendas → PDV)
--   * pdv_finalizar(p): cria o pedido (origem 'balcao'), lança os itens e aprova pelo caminho de sempre
--     (aprovar_pedido_sistema: baixa o estoque da unidade, gera a conta a receber, comissão), registra os
--     pagamentos (pode dividir: parte em dinheiro, parte no Pix…) e marca o pedido como entregue.
--     Pagamentos: dinheiro, pix, cartao_credito, cartao_debito, transferencia → já entram pagos;
--                 link (InfinitePay) → conta fica em aberto até o cliente pagar o link (baixa automática);
--                 prazo → conta em aberto com o vencimento escolhido (só com cliente identificado).
--     Tudo numa transação: se faltar estoque ou os valores não fecharem, nada é gravado.
--   * pdv_consumidor_final(): cliente genérico "Consumidor final" (criado na primeira venda sem cliente).
-- A conta do dinheiro: a conta bancária ligada à forma de pagamento escolhida ou, para dinheiro, a conta
-- do tipo "caixa" da unidade (se existir).
-- Somente acréscimos: coluna nova e funções novas.
-- =====================================================================

alter table public.configuracoes add column if not exists pdv_cliente_id uuid references public.clientes(id);

create or replace function public.pdv_consumidor_final()
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform public.exigir_papel('vendas');
  select pdv_cliente_id into v from configuracoes order by id limit 1;
  if v is not null and exists (select 1 from clientes where id = v) then return v; end if;
  insert into clientes (nome, tipo_pessoa, avisos_email, observacoes)
  values ('Consumidor final', 'PF', false, 'Cliente genérico das vendas de balcão (PDV) sem identificação do comprador.')
  returning id into v;
  update configuracoes set pdv_cliente_id = v where id = (select id from configuracoes order by id limit 1);
  return v;
end $$;

create or replace function public.pdv_finalizar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cli uuid := nullif(p->>'cliente_id', '')::uuid;
  v_vend uuid := nullif(p->>'vendedor_id', '')::uuid;
  v_desc numeric := round(coalesce(nullif(p->>'desconto', '')::numeric, 0), 2);
  v_pags jsonb := coalesce(p->'pagamentos', '[]'::jsonb);
  v_n int; v_ped uuid; v_num bigint; v_unid uuid; v_total numeric; v_soma numeric; v_principal text; v_conta uuid;
  v_itens int := 0; i jsonb; pg jsonb; k int := 0; v_meio text; v_ftxt text; v_val numeric; v_pago boolean; v_venc date;
  v_cb uuid; v_forma uuid; v_desc_conta text; v_contas jsonb := '[]'::jsonb; v_id uuid;
begin
  perform public.exigir_papel('vendas');
  perform set_config('erp.acao_usuario', 'on', true);
  if jsonb_typeof(p->'itens') is distinct from 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'carrinho vazio'; end if;
  if v_desc < 0 then raise exception 'desconto inválido'; end if;
  if jsonb_typeof(v_pags) is distinct from 'array' then raise exception 'escolha a forma de pagamento'; end if;
  v_n := jsonb_array_length(v_pags);
  if v_n = 0 then raise exception 'escolha a forma de pagamento'; end if;
  if v_n > 6 then raise exception 'no máximo 6 formas de pagamento por venda'; end if;
  for pg in select * from jsonb_array_elements(v_pags) loop
    if coalesce(pg->>'meio', '') not in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'link', 'prazo') then
      raise exception 'forma de pagamento inválida: %', coalesce(pg->>'meio', '(vazia)');
    end if;
    if coalesce(nullif(pg->>'valor', '')::numeric, 0) <= 0 then raise exception 'valor de pagamento inválido'; end if;
  end loop;

  if v_cli is null then v_cli := public.pdv_consumidor_final(); end if;
  if exists (select 1 from jsonb_array_elements(v_pags) x where x->>'meio' = 'prazo')
     and v_cli = (select pdv_cliente_id from configuracoes order by id limit 1) then
    raise exception 'venda a prazo precisa de cliente identificado';
  end if;

  select x->>'meio' into v_principal from jsonb_array_elements(v_pags) x order by (x->>'valor')::numeric desc limit 1;
  insert into pedidos (cliente_id, origem, status, unidade_id, vendedor_id, vendedor, forma_pagamento, parcelas, primeiro_vencimento,
                       intervalo_dias, modalidade_frete, desconto, frete, observacoes)
  values (v_cli, 'balcao', 'orcamento', nullif(p->>'unidade_id', '')::uuid, v_vend, (select nome from vendedores where id = v_vend),
          case v_principal when 'dinheiro' then 'dinheiro' when 'cartao_credito' then 'cartao' when 'cartao_debito' then 'cartao'
                           when 'transferencia' then 'transferencia' when 'prazo' then 'boleto' else 'pix' end,
          1, current_date, 30, 9, v_desc, 0, nullif(btrim(coalesce(p->>'observacoes', '')), ''))
  returning id, numero, unidade_id into v_ped, v_num, v_unid;

  for i in select * from jsonb_array_elements(p->'itens') loop
    if coalesce(nullif(i->>'quantidade', '')::numeric, 0) <= 0 then raise exception 'quantidade inválida'; end if;
    if coalesce(nullif(i->>'valor_unitario', '')::numeric, -1) < 0 then raise exception 'preço inválido'; end if;
    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, valor_unitario, numero_serie, kit_escolha)
    select v_ped, pr.id, pr.descricao, (i->>'quantidade')::numeric, round((i->>'valor_unitario')::numeric, 2),
           nullif(btrim(coalesce(i->>'numero_serie', '')), ''), case when jsonb_typeof(i->'kit_escolha') = 'array' then i->'kit_escolha' end
      from produtos pr where pr.id = nullif(i->>'produto_id', '')::uuid;
    if not found then raise exception 'produto não encontrado'; end if;
    v_itens := v_itens + 1;
  end loop;

  -- o mesmo caminho do pedido comum: estoque, conta a receber, comissão (levanta erro se faltar estoque)
  perform public.aprovar_pedido_sistema(v_ped);

  select valor_total into v_total from pedidos where id = v_ped;
  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma from jsonb_array_elements(v_pags) x;
  if abs(v_soma - v_total) > 0.009 then
    raise exception 'os pagamentos (%) não fecham com o total da venda (%)', public.brl(v_soma), public.brl(v_total);
  end if;
  select id into v_conta from contas_receber where pedido_id = v_ped and status = 'aberto' order by parcela nulls last, created_at limit 1;

  for pg in select * from jsonb_array_elements(v_pags) loop
    k := k + 1;
    v_meio := pg->>'meio';
    v_val := round((pg->>'valor')::numeric, 2);
    v_pago := v_meio not in ('link', 'prazo');
    v_venc := case when v_meio = 'prazo' then coalesce(nullif(pg->>'vencimento', '')::date, current_date + 30) else current_date end;
    v_ftxt := case v_meio when 'dinheiro' then 'dinheiro' when 'cartao_credito' then 'cartao' when 'cartao_debito' then 'cartao'
                          when 'transferencia' then 'transferencia' when 'prazo' then 'boleto' else 'pix' end;
    v_forma := nullif(pg->>'forma_pagamento_id', '')::uuid;
    v_cb := null;
    if v_pago then
      select conta_bancaria_id into v_cb from formas_pagamento where id = v_forma;
      if v_cb is null and v_meio = 'dinheiro' then
        select id into v_cb from contas_bancarias where ativo and tipo = 'caixa' and unidade_id = v_unid order by created_at limit 1;
      end if;
    end if;
    v_desc_conta := 'Pedido #' || v_num || ' - balcão' || case when v_n > 1 then ' (pagamento ' || k || '/' || v_n || ')' else '' end
      || case v_meio when 'cartao_credito' then ' · crédito' when 'cartao_debito' then ' · débito' when 'link' then ' · link InfinitePay' else '' end;
    if k = 1 and v_conta is not null then
      update contas_receber set descricao = v_desc_conta, valor = v_val, vencimento = v_venc, forma_pagamento = v_ftxt,
             parcela = 1, total_parcelas = v_n,
             status = case when v_pago then 'pago' else 'aberto' end,
             data_pagamento = case when v_pago then current_date end,
             valor_pago = case when v_pago then v_val end,
             conta_bancaria_id = v_cb,
             motivo_alteracao = case when v_pago then 'Recebido no balcão (PDV)' else 'Venda de balcão (PDV)' end
       where id = v_conta
       returning id into v_id;
    else
      insert into contas_receber (descricao, cliente_id, pedido_id, unidade_id, parcela, total_parcelas, status, forma_pagamento,
                                  valor, vencimento, data_pagamento, valor_pago, conta_bancaria_id, motivo_alteracao)
      values (v_desc_conta, v_cli, v_ped, v_unid, k, v_n, case when v_pago then 'pago' else 'aberto' end, v_ftxt,
              v_val, v_venc, case when v_pago then current_date end, case when v_pago then v_val end, v_cb,
              case when v_pago then 'Recebido no balcão (PDV)' else 'Venda de balcão (PDV)' end)
      returning id into v_id;
    end if;
    v_contas := v_contas || jsonb_build_object('id', v_id, 'meio', v_meio, 'valor', v_val, 'pago', v_pago, 'vencimento', v_venc);
  end loop;

  -- o cliente leva na hora
  if coalesce(nullif(p->>'entregar', '')::boolean, true) then
    update pedidos set status = 'entregue' where id = v_ped;
  end if;

  return jsonb_build_object('pedido_id', v_ped, 'numero', v_num, 'total', v_total, 'cliente_id', v_cli, 'itens', v_itens, 'contas', v_contas);
end $$;

revoke execute on function public.pdv_consumidor_final() from public, anon;
grant execute on function public.pdv_consumidor_final() to authenticated;
revoke execute on function public.pdv_finalizar(jsonb) from public, anon;
grant execute on function public.pdv_finalizar(jsonb) to authenticated;
