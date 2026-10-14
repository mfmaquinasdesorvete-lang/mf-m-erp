-- Descontos por tipo de venda (parte 4): a mesma conferência antes de mandar a proposta (o cliente aprova pelo link,
-- sem a senha). Sem regra cadastrada, nada muda.
create or replace function public.marcar_proposta_enviada(p_pedido uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_pct numeric; v_max numeric;
begin
  perform public.exigir_papel('vendas');
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status <> 'orcamento' then raise exception 'só orçamentos viram proposta'; end if;
  if v_ped.valor_total <= 0 then raise exception 'adicione os itens antes de enviar'; end if;
  v_pct := case when coalesce(v_ped.valor_produtos, 0) > 0 then round(coalesce(v_ped.desconto, 0) / v_ped.valor_produtos * 100, 2) else 0 end;
  v_max := public.desconto_maximo(v_ped.origem, v_ped.forma_pagamento);
  if v_pct > 0 and v_max is not null and v_pct > v_max + 0.005 and coalesce(v_ped.desconto_aprovado_pct, 0) + 0.005 < v_pct then
    raise exception 'desconto de % acima do máximo de % para esta venda: falta a aprovação do administrador antes de enviar a proposta',
      public.percentual_br(v_pct), public.percentual_br(v_max);
  end if;
  update pedidos set proposta_status = 'enviada', proposta_enviada_em = now(),
    proposta_validade = case when proposta_validade >= current_date and proposta_status in ('enviada', 'visualizada') then proposta_validade
                             else current_date + (select validade_orcamento_dias from configuracoes where id = 1) end,
    proposta_visualizada_em = null, proposta_respondida_em = null, motivo_rejeicao = null, motivo_rejeicao_texto = null
  where id = p_pedido;
  return v_ped.proposta_token;
end $$;
