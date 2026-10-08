-- =====================================================================
-- Validações da venda na aprovação (valem no servidor, não só na tela)
--   * estoque da unidade não fica negativo (salvo produto sob encomenda
--     ou a empresa ligar "vender sem estoque")
--   * desconto maior que os itens tem mensagem própria
--   * parcelas de 1 a 24
-- =====================================================================
alter table public.configuracoes add column vender_sem_estoque boolean not null default false;

alter table public.pedidos drop constraint if exists pedidos_desconto_check;
alter table public.pedidos add constraint pedidos_desconto_check check (coalesce(desconto, 0) >= 0) not valid;

create or replace function public.aprovar_pedido_sistema(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ped public.pedidos;
  v_item record;
  v_comp record;
  v_parcela int;
  v_valor_parcela numeric(12,2);
  v_primeiro date;
  v_itens numeric;
  v_faltas text;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status <> 'orcamento' then raise exception 'só orçamentos podem ser aprovados'; end if;
  select coalesce(sum(quantidade * valor_unitario), 0) into v_itens from public.pedido_itens where pedido_id = p_pedido;
  if v_itens <= 0 then raise exception 'pedido sem itens'; end if;
  if coalesce(v_ped.desconto, 0) < 0 then raise exception 'o desconto não pode ser negativo'; end if;
  if v_ped.valor_total <= 0 then raise exception 'o desconto (R$ %) é maior que o valor dos itens (R$ %)', replace(round(v_ped.desconto, 2)::text, '.', ','), replace(round(v_itens, 2)::text, '.', ','); end if;
  if v_ped.parcelas not between 1 and 24 then raise exception 'número de parcelas deve ser de 1 a 24'; end if;

  -- não deixa o estoque da unidade ficar negativo (exceto produtos sob encomenda ou se a empresa liberar)
  if not coalesce((select vender_sem_estoque from public.configuracoes where id = 1), false) then
    select string_agg(format('%s (pedido %s, estoque %s)', pr.descricao, trim_scale(n.qtd), trim_scale(coalesce(eu.quantidade, 0))), '; ' order by pr.descricao)
      into v_faltas
      from (
        select x.produto_id, sum(x.qtd) as qtd from (
          select i.produto_id, i.quantidade as qtd
            from public.pedido_itens i join public.produtos p on p.id = i.produto_id
           where i.pedido_id = p_pedido and not p.kit
          union all
          select c.componente_id, c.quantidade * i.quantidade
            from public.pedido_itens i join public.produtos p on p.id = i.produto_id
            cross join lateral public.kit_composicao(i.produto_id, i.kit_escolha) c
           where i.pedido_id = p_pedido and p.kit
        ) x group by x.produto_id
      ) n
      join public.produtos pr on pr.id = n.produto_id
      left join public.estoque_unidade eu on eu.produto_id = n.produto_id and eu.unidade_id = coalesce(v_ped.unidade_id, public.unidade_matriz())
     where not pr.sob_encomenda and coalesce(eu.quantidade, 0) < n.qtd;
    if v_faltas is not null then
      raise exception 'estoque insuficiente nesta unidade: %. Transfira estoque, marque o produto como sob encomenda ou libere "vender sem estoque" nas configurações', v_faltas;
    end if;
  end if;

  for v_item in select i.*, p.kit from public.pedido_itens i join public.produtos p on p.id = i.produto_id where i.pedido_id = p_pedido loop
    if v_item.kit then
      for v_comp in select * from public.kit_composicao(v_item.produto_id, v_item.kit_escolha) loop
        insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
        values (v_comp.componente_id, 'saida', v_comp.quantidade * v_item.quantidade, 'Pedido #' || v_ped.numero || ' (kit ' || v_item.descricao || ')', 'pedido', p_pedido);
      end loop;
    else
      insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
      values (v_item.produto_id, 'saida', v_item.quantidade, 'Pedido #' || v_ped.numero, 'pedido', p_pedido, v_item.numero_serie);
    end if;
  end loop;

  v_primeiro := coalesce(v_ped.primeiro_vencimento,
    current_date + (select dias_vencimento_boleto from public.configuracoes where id = 1));

  for v_parcela in 1..v_ped.parcelas loop
    v_valor_parcela := round(v_ped.valor_total / v_ped.parcelas, 2);
    if v_parcela = v_ped.parcelas then
      v_valor_parcela := v_ped.valor_total - round(v_ped.valor_total / v_ped.parcelas, 2) * (v_ped.parcelas - 1);
    end if;
    insert into public.contas_receber (descricao, cliente_id, pedido_id, parcela, total_parcelas, valor, vencimento, forma_pagamento)
    values ('Pedido #' || v_ped.numero || ' - parcela ' || v_parcela || '/' || v_ped.parcelas,
            v_ped.cliente_id, p_pedido, v_parcela, v_ped.parcelas, v_valor_parcela,
            v_primeiro + (v_parcela - 1) * v_ped.intervalo_dias, v_ped.forma_pagamento);
  end loop;

  update public.pedidos set status = 'aprovado', aprovado_em = now(), estoque_baixado = true where id = p_pedido;

  if (select v.base from vendedores v where v.id = v_ped.vendedor_id) = 'faturamento' then
    perform public.lancar_comissao(p_pedido, v_ped.valor_total, null, 'Pedido #' || v_ped.numero);
  end if;
end $$;
