-- Desfazer separado em núcleo (_desfazer_pagamento_cliente, sem checagem de papel, para testar em transação desfeita)
-- e a função pública que confere o papel financeiro.
create or replace function public._desfazer_pagamento_cliente(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare r pedido_pagamentos; b jsonb; v_ped int;
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'escreva o motivo'; end if;
  select * into r from pedido_pagamentos where id = p_id for update;
  if r.id is null or r.excluido_em is not null then raise exception 'registro não encontrado ou já desfeito'; end if;
  select numero into v_ped from pedidos where id = r.pedido_id;

  -- cliente: a parte paga é cancelada (a comissão dela cai junto) e o valor volta para as parcelas abertas
  update contas_receber set status = 'cancelado', motivo_alteracao = 'Desfeito: ' || p_motivo where id = r.conta_receber_id and status = 'pago';
  for b in select * from jsonb_array_elements(r.baixa_receber) loop
    if b->>'acao' = 'cancelou' then
      update contas_receber set status = 'aberto', motivo_alteracao = 'Volta da baixa desfeita: ' || p_motivo where id = (b->>'conta')::uuid;
    else
      update contas_receber set valor = round(valor + (b->>'valor')::numeric, 2), motivo_alteracao = 'Volta da baixa desfeita: ' || p_motivo
       where id = (b->>'conta')::uuid;
    end if;
  end loop;
  if r.extrato_lancamento_id is not null then
    update extrato_lancamentos set status = 'pendente', conta_receber_id = null, conciliado_por = null, conciliado_em = null
     where id = r.extrato_lancamento_id and conta_receber_id = r.conta_receber_id;
  end if;

  -- fornecedor: conta criada é cancelada; conta paga volta a aberta; a dividida recebe o valor de volta
  for b in select * from jsonb_array_elements(r.baixa_pagar) loop
    if b->>'acao' = 'criou' then
      update contas_pagar set status = 'cancelado', motivo_alteracao = 'Desfeito: ' || p_motivo where id = (b->>'conta')::uuid;
    elsif b->>'acao' = 'pagou' then
      update contas_pagar set status = 'aberto', data_pagamento = null, valor_pago = null, motivo_alteracao = 'Desfeito: ' || p_motivo
       where id = (b->>'conta')::uuid;
    else
      update contas_pagar set status = 'cancelado', motivo_alteracao = 'Desfeito: ' || p_motivo where id = (b->>'criada')::uuid;
      update contas_pagar set valor = round(valor + (b->>'valor')::numeric, 2), motivo_alteracao = 'Volta da baixa desfeita: ' || p_motivo
       where id = (b->>'conta')::uuid;
    end if;
  end loop;
  if r.nfe_recebida_id is not null then
    update nfe_recebidas n set conta_pagar_id = (select c.id from contas_pagar c where c.nfe_recebida_id = n.id and c.status <> 'cancelado' order by c.created_at limit 1)
     where n.id = r.nfe_recebida_id and n.conta_pagar_id in (select (x->>'conta')::uuid from jsonb_array_elements(r.baixa_pagar) x
                                                              union select (x->>'criada')::uuid from jsonb_array_elements(r.baixa_pagar) x);
  end if;

  update pedido_pagamentos set excluido_em = now(), excluido_por = auth.uid(), excluido_motivo = trim(p_motivo) where id = p_id;
  insert into pedido_ocorrencias (pedido_id, autor_nome, texto)
  values (r.pedido_id, 'Onde o cliente pagou', 'Desfeito o registro de ' || public.brl(r.valor) || ' de ' || to_char(r.data, 'DD/MM/YYYY') || ': ' || trim(p_motivo));
end $$;
revoke execute on function public._desfazer_pagamento_cliente(uuid, text) from public, anon, authenticated;

create or replace function public.desfazer_pagamento_cliente(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  perform public._desfazer_pagamento_cliente(p_id, p_motivo);
end $$;
revoke execute on function public.desfazer_pagamento_cliente(uuid, text) from public, anon;
grant execute on function public.desfazer_pagamento_cliente(uuid, text) to authenticated;
