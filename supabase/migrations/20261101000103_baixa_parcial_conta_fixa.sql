-- Baixa parcial de conta fixa (aluguel, mensalidade): o "restante" copiava o recorrente_id e a competência da conta
-- original e o índice único (recorrente_id, competencia) recusava ("duplicate key ... recorrente_comp"). O restante
-- agora nasce sem o recorrente_id: a conta original (paga) continua sendo a ocorrência daquele mês da conta fixa.
create or replace function public.baixar_conta(p_tabela text, p_id uuid, p_data date, p_valor numeric, p_conta_bancaria uuid,
  p_restante_vencimento date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r jsonb; v_valor numeric; v_rest numeric; v_novo uuid;
begin
  perform public.exigir_papel('financeiro');
  if p_tabela not in ('contas_receber', 'contas_pagar') then raise exception 'tabela inválida'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'informe o valor pago'; end if;
  if p_data is null then raise exception 'informe a data do pagamento'; end if;
  if p_conta_bancaria is not null and not exists (select 1 from contas_bancarias where id = p_conta_bancaria and ativo) then
    raise exception 'conta bancária não encontrada';
  end if;
  execute format('select to_jsonb(c) from %I c where id = $1 for update', p_tabela) into r using p_id;
  if r is null then raise exception 'conta não encontrada'; end if;
  if r->>'status' <> 'aberto' then raise exception 'esta conta não está em aberto'; end if;
  v_valor := (r->>'valor')::numeric;
  perform set_config('erp.acao_usuario', 'on', true);

  if p_restante_vencimento is not null and p_valor < v_valor then
    v_rest := round(v_valor - p_valor, 2);
    execute format('insert into %I select * from jsonb_populate_record(null::%I, $1) returning id', p_tabela, p_tabela) into v_novo
      using r || jsonb_build_object(
        'id', gen_random_uuid(), 'valor', v_rest, 'vencimento', p_restante_vencimento, 'status', 'aberto',
        'descricao', regexp_replace(r->>'descricao', ' \(restante\)$', '') || ' (restante)', 'conta_origem_id', p_id,
        'data_pagamento', null, 'valor_pago', null, 'conta_bancaria_id', null, 'id_externo', null, 'created_at', now(),
        'recorrente_id', null,
        'motivo_alteracao', 'Restante do pagamento parcial de ' || public.reais(p_valor) || ' em ' || to_char(p_data, 'DD/MM/YYYY'));
    execute format('update %I set valor = $2, status = ''pago'', data_pagamento = $3, valor_pago = $2, conta_bancaria_id = $4, motivo_alteracao = $5 where id = $1', p_tabela)
      using p_id, p_valor, p_data, p_conta_bancaria,
            'Pagamento parcial: o restante de ' || public.reais(v_rest) || ' ficou em aberto para ' || to_char(p_restante_vencimento, 'DD/MM/YYYY');
  else
    execute format('update %I set status = ''pago'', data_pagamento = $3, valor_pago = $2, conta_bancaria_id = $4,
                    motivo_alteracao = case when $2 <> valor then $5 else motivo_alteracao end where id = $1', p_tabela)
      using p_id, p_valor, p_data, p_conta_bancaria,
            case when p_valor < v_valor then 'Pago com desconto de ' || public.reais(v_valor - p_valor)
                 else 'Pago com juros/multa de ' || public.reais(p_valor - v_valor) end;
  end if;
  return v_novo;
end $$;
