-- Link de pagamento: baixa do pedido com várias parcelas e conciliação do depósito do dia seguinte.
--  1. Link do pedido inteiro (várias parcelas em aberto, sem conta ligada): quando é pago, dá baixa em todas as
--     parcelas em aberto do pedido (antes ficava "pago (sem conta ligada)" e a baixa era feita à mão).
--  2. O cartão adiantado cai no extrato da InfinitePay (ou do Mercado Pago) no dia útil seguinte, já sem a taxa e numa
--     linha só para todas as parcelas: a conciliação automática agora procura o link pago até 6 dias antes, com o valor
--     líquido (valor do link menos a taxa) ou entre 80% do valor e o que o cliente pagou, e liga a linha à venda.
--  3. Cartão com juros pagos pelo cliente (ele pagou mais que o link): a MF recebe o valor do link inteiro, então o ERP
--     não lança taxa.

alter table public.cobrancas_link add column if not exists extrato_lancamento_id uuid references public.extrato_lancamentos(id) on delete set null;
create index if not exists cobrancas_link_extrato_idx on public.cobrancas_link (extrato_lancamento_id);

create or replace function public.confirmar_cobranca_link(p_id uuid, p_nsu text, p_slug text, p_metodo text,
  p_parcelas integer, p_valor_pago numeric, p_recibo text, p_aviso jsonb, p_taxa_valor numeric)
returns text language plpgsql security definer set search_path = public as $$
declare l cobrancas_link; c contas_receber; v_ids uuid[]; v_total numeric; v_unid uuid; v_banco uuid; v_forma text;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        v_taxa numeric; v_valor_taxa numeric; v_conta_taxa uuid; v_como text; v_nome text; v_mp boolean;
begin
  select * into l from cobrancas_link where id = p_id for update;
  if l.id is null then return 'link não encontrado'; end if;
  if l.status = 'pago' then return 'já registrado'; end if;
  v_mp := l.provedor = 'mercadopago';
  v_nome := case when v_mp then 'Mercado Pago' else 'InfinitePay' end;

  update cobrancas_link set status = 'pago', transaction_nsu = p_nsu, slug = p_slug, metodo = p_metodo, parcelas = p_parcelas,
         valor_pago = p_valor_pago, recibo_url = p_recibo, aviso = p_aviso, pago_em = now(), erro = null
   where id = p_id;

  if l.conta_receber_id is not null then
    select * into c from contas_receber where id = l.conta_receber_id for update;
    if c.id is null or c.status <> 'aberto' then
      update cobrancas_link set erro = 'A conta não estava mais em aberto: confira se o cliente pagou duas vezes.' where id = p_id;
      perform public.notificar('pagamento', 'Link pago, mas a conta não estava em aberto', concat_ws(' · ', l.descricao, public.brl(p_valor_pago)),
        '/financeiro', '{financeiro}', l.unidade_id);
      return 'conta não estava em aberto';
    end if;
    v_ids := array[c.id]; v_total := c.valor; v_unid := c.unidade_id;
  elsif l.pedido_id is not null then
    -- link do que faltava pagar do pedido: todas as parcelas em aberto
    select array_agg(id order by vencimento), sum(valor), min(unidade_id::text)::uuid into v_ids, v_total, v_unid
      from (select id, valor, vencimento, unidade_id from contas_receber
             where pedido_id = l.pedido_id and status = 'aberto' for update) x;
    if v_ids is null then
      update cobrancas_link set erro = 'O pedido não tinha parcela em aberto: confira se o cliente pagou duas vezes.' where id = p_id;
      perform public.notificar('pagamento', 'Link pago, mas o pedido não tinha parcela em aberto', concat_ws(' · ', l.descricao, public.brl(p_valor_pago)),
        '/financeiro', '{financeiro}', l.unidade_id);
      return 'pedido sem parcela em aberto';
    end if;
  else
    return 'pago (sem conta ligada)';
  end if;
  if round(l.valor, 2) < round(v_total, 2) then
    update cobrancas_link set erro = 'O link era de ' || public.brl(l.valor) || ' e falta receber ' || public.brl(v_total) || ': dê a baixa manual.' where id = p_id;
    perform public.notificar('pagamento', 'Link pago com valor menor que a conta', concat_ws(' · ', l.descricao, public.brl(l.valor)),
      '/financeiro', '{financeiro}', l.unidade_id);
    return 'valor menor que a conta';
  end if;

  if v_mp then
    select id into v_banco from contas_bancarias where ativo and unidade_id = v_unid and nome ilike '%mercado%pago%' order by created_at limit 1;
  else
    select id into v_banco from contas_bancarias where ativo and banco = 'infinitepay' and unidade_id = v_unid order by created_at limit 1;
  end if;
  v_forma := case when lower(coalesce(p_metodo, '')) in ('pix', 'bank_transfer') then 'pix' else 'cartao' end;
  v_como := case when v_forma = 'pix' then 'Pix' else 'cartão' || case when coalesce(p_parcelas, 1) > 1 then ' em ' || p_parcelas || 'x' else '' end end;
  begin
    update contas_receber set status = 'pago', data_pagamento = v_hoje, valor_pago = valor, forma_pagamento = v_forma,
           conta_bancaria_id = coalesce(conta_bancaria_id, v_banco),
           motivo_alteracao = 'Pago pelo link ' || v_nome || ' (' || v_como || ', ' || case when v_mp then 'pagamento ' else 'NSU ' end || coalesce(p_nsu, '?') || ')'
     where id = any(v_ids);
    update cobrancas_link set baixa_em = now() where id = p_id;
  exception when others then
    update cobrancas_link set erro = 'Pagamento recebido, mas a baixa não foi feita: ' || sqlerrm where id = p_id;
    perform public.notificar('pagamento', 'Link pago: falta dar baixa', concat_ws(' · ', l.descricao, sqlerrm), '/financeiro', '{financeiro}', l.unidade_id);
    return 'baixa não feita: ' || sqlerrm;
  end;

  if p_taxa_valor is null and coalesce(p_valor_pago, 0) > l.valor + 0.01 then
    return 'baixa feita (juros pagos pelo cliente, sem taxa para a MF)';
  end if;
  if p_taxa_valor is not null then
    v_valor_taxa := round(p_taxa_valor, 2);
    v_taxa := case when v_total > 0 then round(p_taxa_valor * 100 / v_total, 2) end;
  elsif not v_mp then
    select public.taxa_infinitepay(u.infinitepay_taxas, p_metodo, p_parcelas) into v_taxa from unidades u where u.id = l.unidade_id;
    if v_taxa is null then return 'baixa feita (taxa não cadastrada)'; end if;
    v_valor_taxa := round(v_total * v_taxa / 100, 2);
  else
    return 'baixa feita (o Mercado Pago não informou a taxa)';
  end if;
  update cobrancas_link set taxa_percentual = v_taxa, taxa_valor = v_valor_taxa where id = p_id;
  if v_valor_taxa <= 0 then return 'baixa feita'; end if;
  begin
    insert into contas_pagar (descricao, categoria, valor, vencimento, status, data_pagamento, valor_pago, unidade_id, conta_bancaria_id,
                              id_externo, competencia, observacoes)
    values ('Taxa ' || v_nome || ': ' || l.descricao || ' (' || v_como || ')', 'tarifas bancárias', v_valor_taxa, v_hoje, 'pago', v_hoje,
            v_valor_taxa, v_unid, v_banco, case when v_mp then 'mercadopago-taxa:' else 'infinitepay-taxa:' end || l.id,
            date_trunc('month', v_hoje)::date,
            coalesce(v_taxa || '% sobre ', 'Sobre ') || public.brl(v_total) || ', ' || case when v_mp then 'pagamento ' else 'NSU ' end || coalesce(p_nsu, '?')
              || '. Lançada pelo ERP quando o link foi pago.')
    returning id into v_conta_taxa;
    update cobrancas_link set conta_taxa_id = v_conta_taxa where id = p_id;
  exception when others then
    update cobrancas_link set erro = 'Baixa feita, mas a taxa não foi lançada: ' || sqlerrm where id = p_id;
    perform public.notificar('pagamento', 'Link pago: lance a taxa do ' || v_nome, concat_ws(' · ', l.descricao, public.brl(v_valor_taxa), sqlerrm),
      '/financeiro', '{financeiro}', l.unidade_id);
  end;
  return 'baixa feita';
end $$;
revoke execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb, numeric) to service_role;

-- Depósito da InfinitePay / Mercado Pago sem conta de valor igual: procura o link pago (até 6 dias antes, por causa do
-- fim de semana) cujo líquido bate. Só liga quando há um link só que serve. Devolve true quando ligou.
create or replace function public.conciliar_deposito_link(p_lanc uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare e extrato_lancamentos; cb contas_bancarias; v_prov text; k cobrancas_link; v_link uuid; v_n int; v_cr uuid; v_bruto numeric;
begin
  select * into e from extrato_lancamentos where id = p_lanc;
  if e.id is null or e.status <> 'pendente' or e.valor <= 0 then return false; end if;
  select * into cb from contas_bancarias where id = e.conta_bancaria_id;
  v_prov := case when cb.banco = 'infinitepay' then 'infinitepay' when cb.nome ilike '%mercado%pago%' then 'mercadopago' end;
  if v_prov is null then return false; end if;

  -- candidatos: links pagos desta unidade e deste provedor, ainda sem linha do extrato, com o valor líquido batendo
  -- (exato = valor menos a taxa lançada; senão entre 80% do valor e o que o cliente pagou)
  select count(*), (array_agg(id order by exato desc, pago_em desc))[1] into v_n, v_link
    from (select l.id, l.pago_em,
                 abs(e.valor - (l.valor - coalesce(l.taxa_valor, 0))) <= 0.05 as exato
            from cobrancas_link l
           where l.status = 'pago' and l.provedor = v_prov and l.unidade_id = cb.unidade_id and l.extrato_lancamento_id is null
             and (l.pago_em at time zone 'America/Sao_Paulo')::date between e.data - 6 and e.data
             and (abs(e.valor - (l.valor - coalesce(l.taxa_valor, 0))) <= 0.05
                  or e.valor between round(l.valor * 0.80, 2) and greatest(l.valor, coalesce(l.valor_pago, l.valor)) + 0.01)) x;
  if v_n is distinct from 1 then
    -- mais de um serve: só liga se um único bate exato
    select count(*) filter (where exato), (array_agg(id) filter (where exato))[1] into v_n, v_link
      from (select l.id, abs(e.valor - (l.valor - coalesce(l.taxa_valor, 0))) <= 0.05 as exato
              from cobrancas_link l
             where l.status = 'pago' and l.provedor = v_prov and l.unidade_id = cb.unidade_id and l.extrato_lancamento_id is null
               and (l.pago_em at time zone 'America/Sao_Paulo')::date between e.data - 6 and e.data) x;
    if v_n is distinct from 1 then return false; end if;
  end if;

  select * into k from cobrancas_link where id = v_link;
  -- a conta a receber do link (ou a primeira parcela paga do pedido que ainda não está no extrato)
  select c.id into v_cr from contas_receber c
   where c.status = 'pago'
     and (c.id = k.conta_receber_id or (k.conta_receber_id is null and k.pedido_id is not null and c.pedido_id = k.pedido_id))
     and not exists (select 1 from extrato_lancamentos x where x.conta_receber_id = c.id and x.status = 'conciliado')
   order by c.vencimento limit 1;
  if v_cr is null then return false; end if;

  perform public.vincular_lancamento(e.id, 'receber', v_cr);
  v_bruto := k.valor;
  update extrato_lancamentos
     set observacao = concat_ws(' · ', nullif(observacao, ''),
           'Depósito do link pago em ' || to_char((k.pago_em at time zone 'America/Sao_Paulo')::date, 'DD/MM') || ': ' || k.descricao
           || ' (' || case when lower(coalesce(k.metodo, '')) in ('pix', 'bank_transfer') then 'Pix' else 'cartão'
                || case when coalesce(k.parcelas, 1) > 1 then ' ' || k.parcelas || 'x' else '' end end || ')'
           || ', venda ' || public.brl(v_bruto) || case when e.valor < v_bruto then ' − taxa ' || public.brl(v_bruto - e.valor) else '' end)
   where id = e.id;
  update cobrancas_link set extrato_lancamento_id = e.id where id = k.id;
  return true;
end $$;
revoke execute on function public.conciliar_deposito_link(uuid) from public, anon, authenticated;
grant execute on function public.conciliar_deposito_link(uuid) to service_role;

create or replace function public.conciliar_automatico_interno(p_conta uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare l record; v_unid uuid; v_ids uuid[]; n int := 0;
begin
  select unidade_id into v_unid from contas_bancarias where id = p_conta;
  for l in select * from extrato_lancamentos where conta_bancaria_id = p_conta and status = 'pendente' order by data loop
    if l.valor > 0 then
      select array_agg(c.id) into v_ids from contas_receber c
       where c.unidade_id = v_unid
         and not exists (select 1 from extrato_lancamentos x where x.conta_receber_id = c.id and x.status = 'conciliado')
         and not exists (select 1 from pedido_pagamentos pp where pp.conta_receber_id = c.id and pp.tipo <> 'conta_mf' and pp.excluido_em is null)
         and ((c.status = 'aberto' and c.valor = l.valor and c.vencimento between l.data - 10 and l.data + 10)
           or (c.status = 'pago' and coalesce(c.valor_pago, c.valor) = l.valor and c.data_pagamento between l.data - 3 and l.data + 3
               and (c.conta_bancaria_id is null or c.conta_bancaria_id = p_conta)));
      if cardinality(v_ids) = 1 then
        begin perform vincular_lancamento(l.id, 'receber', v_ids[1]); n := n + 1;
        exception when others then null; end;
      else
        -- cartão adiantado pelo link: cai no dia útil seguinte, sem a taxa
        begin if public.conciliar_deposito_link(l.id) then n := n + 1; end if;
        exception when others then null; end;
      end if;
    else
      select array_agg(c.id) into v_ids from contas_pagar c
       where c.unidade_id = v_unid
         and not exists (select 1 from extrato_lancamentos x where x.conta_pagar_id = c.id and x.status = 'conciliado')
         -- a conta paga pelo cliente (a criada ou a baixada aqui) não é ligada a saída da conta da MF
         and not exists (select 1 from pedido_pagamentos pp, jsonb_array_elements(pp.baixa_pagar) b
                          where pp.excluido_em is null
                            and ((b->>'acao' in ('pagou', 'criou') and c.id = (b->>'conta')::uuid) or c.id = (b->>'criada')::uuid))
         and ((c.status = 'aberto' and c.valor = -l.valor and c.vencimento between l.data - 10 and l.data + 10)
           or (c.status = 'pago' and coalesce(c.valor_pago, c.valor) = -l.valor and c.data_pagamento between l.data - 3 and l.data + 3
               and (c.conta_bancaria_id is null or c.conta_bancaria_id = p_conta)));
      if cardinality(v_ids) = 1 then
        begin perform vincular_lancamento(l.id, 'pagar', v_ids[1]); n := n + 1;
        exception when others then null; end;
      end if;
    end if;
  end loop;
  return n;
end $$;
