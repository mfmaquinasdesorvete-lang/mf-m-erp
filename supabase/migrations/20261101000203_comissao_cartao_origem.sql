-- Comissão do cartão (complemento da 199): a parcela do cartão em aberto entra na comissão única. Quando ela é paga em
-- outro lugar ("Onde o cliente pagou": a aberta diminui ou é cancelada e nasce uma paga com conta_origem_id), a nova
-- entra na mesma comissão e a base é refeita com os valores de agora (soma das parcelas não canceladas dela), sem
-- contar duas vezes nem perder a parte paga, seja qual for a ordem.

create or replace function public.lancar_comissao(p_pedido uuid, p_valor numeric, p_conta uuid, p_descricao text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_vend vendedores; v_base numeric; v_pct numeric; v_parte numeric := 1; v_desc text := p_descricao;
  v_cartao uuid[]; v_n int; v_com comissoes; v_fator numeric;
begin
  select * into v_ped from pedidos where id = p_pedido;
  if v_ped.vendedor_id is null then return; end if;
  select * into v_vend from vendedores where id = v_ped.vendedor_id;
  v_pct := coalesce(v_ped.comissao_percentual, public.comissao_percentual_pedido(p_pedido), v_vend.percentual);
  if v_pct <= 0 or v_ped.valor_total <= 0 then return; end if;
  v_fator := case when v_vend.descontar_frete then greatest(v_ped.valor_total - v_ped.frete, 0) / v_ped.valor_total else 1 end
           * case when v_vend.base = 'recebimento' and coalesce(v_vend.liberacao_faturamento_pct, 0) > 0
                  then (100 - v_vend.liberacao_faturamento_pct) / 100 else 1 end;
  -- parcela que nasceu de uma parcela da comissão do cartão ("Onde o cliente pagou", renegociação): entra nela
  if p_conta is not null then
    select c.* into v_com from comissoes c join contas_receber r on r.id = p_conta
     where c.pedido_id = p_pedido and r.conta_origem_id = any (c.cartao_parcelas) and c.status <> 'cancelada'
     order by c.created_at limit 1;
    if v_com.id is not null then
      if v_com.status = 'a_pagar' and v_com.conta_pagar_id is null and v_com.motivo_edicao is null and not p_conta = any (v_com.cartao_parcelas) then
        v_cartao := v_com.cartao_parcelas || p_conta;
        select round(sum(coalesce(r.valor_pago, r.valor)) * v_fator, 2), count(*) into v_base, v_n
          from contas_receber r where r.id = any (v_cartao) and r.status <> 'cancelado';
        update comissoes set cartao_parcelas = v_cartao, base = v_base, valor = round(v_base * percentual / 100, 2),
               descricao = 'Pedido #' || v_ped.numero || ' · cartão em ' || v_n || ' parcelas (entra uma vez só)'
         where id = v_com.id;
      end if;
      return;
    end if;
  end if;
  -- cartão: uma comissão só, com todas as parcelas do cartão do pedido que ainda não têm comissão
  if p_conta is not null and (select forma_pagamento from contas_receber where id = p_conta) in ('cartao', 'cartao_credito') then
    if public.comissao_cobre_parcela(p_pedido, p_conta) then return; end if;
    select array_agg(r.id order by r.vencimento, r.descricao), sum(coalesce(r.valor_pago, r.valor)), count(*)
      into v_cartao, p_valor, v_n
      from contas_receber r
     where r.pedido_id = p_pedido and r.forma_pagamento in ('cartao', 'cartao_credito') and r.status <> 'cancelado'
       and (r.id = p_conta or not public.comissao_cobre_parcela(p_pedido, r.id));
    v_desc := 'Pedido #' || v_ped.numero || ' · cartão' || case when v_n > 1 then ' em ' || v_n || ' parcelas (entra uma vez só)' else '' end;
  end if;
  -- vendedor por recebimento com parte liberada no faturamento: a aprovação lança essa parte e cada parcela paga o resto
  if v_vend.base = 'recebimento' and coalesce(v_vend.liberacao_faturamento_pct, 0) > 0 then
    if p_conta is null then
      v_parte := v_vend.liberacao_faturamento_pct / 100;
      v_desc := v_desc || ' · ' || trim_scale(v_vend.liberacao_faturamento_pct) || '% no faturamento';
    else
      v_parte := (100 - v_vend.liberacao_faturamento_pct) / 100;
      v_desc := v_desc || ' · ' || trim_scale(100 - v_vend.liberacao_faturamento_pct) || '% no recebimento';
    end if;
    if v_parte <= 0 then return; end if;
  end if;
  v_base := round(p_valor * v_parte * case when v_vend.descontar_frete then greatest(v_ped.valor_total - v_ped.frete, 0) / v_ped.valor_total else 1 end, 2);
  insert into comissoes (vendedor_id, pedido_id, conta_receber_id, descricao, base, percentual, valor, cartao_parcelas)
  values (v_vend.id, p_pedido, p_conta, v_desc, v_base, round(v_pct, 2), round(v_base * v_pct / 100, 2), v_cartao)
  on conflict (conta_receber_id) do update set descricao = excluded.descricao, base = excluded.base, percentual = excluded.percentual,
    valor = excluded.valor, vendedor_id = excluded.vendedor_id, cartao_parcelas = excluded.cartao_parcelas, status = 'a_pagar', pago_em = null
  where comissoes.status = 'cancelada' and comissoes.conta_pagar_id is null and comissoes.motivo_edicao is null;
end $$;
