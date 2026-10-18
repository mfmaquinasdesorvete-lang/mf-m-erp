-- Link de pagamento no cartão pelo Checkout do Mercado Pago (o Pix continua pela InfinitePay).
-- configuracoes.link_cartao_provedor escolhe quem gera o link das vendas no cartão; a baixa automática
-- (confirmar_cobranca_link) passa a atender os dois provedores e, no Mercado Pago, lança a taxa real que ele cobrou.

alter table public.configuracoes add column if not exists link_cartao_provedor text not null default 'infinitepay';
do $$ begin
  alter table public.configuracoes add constraint configuracoes_link_cartao_provedor_check
    check (link_cartao_provedor in ('infinitepay', 'mercadopago'));
exception when duplicate_object then null; end $$;

-- baixa do link pago (InfinitePay ou Mercado Pago). p_taxa_valor: taxa que o provedor informou (Mercado Pago);
-- sem ela, a taxa sai da tabela da InfinitePay cadastrada na unidade.
create or replace function public.confirmar_cobranca_link(p_id uuid, p_nsu text, p_slug text, p_metodo text,
  p_parcelas integer, p_valor_pago numeric, p_recibo text, p_aviso jsonb, p_taxa_valor numeric)
returns text language plpgsql security definer set search_path = public as $$
declare l cobrancas_link; c contas_receber; v_banco uuid; v_forma text; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
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

  if l.conta_receber_id is null then return 'pago (sem conta ligada)'; end if;
  select * into c from contas_receber where id = l.conta_receber_id for update;
  if c.id is null or c.status <> 'aberto' then
    update cobrancas_link set erro = 'A conta não estava mais em aberto: confira se o cliente pagou duas vezes.' where id = p_id;
    perform public.notificar('pagamento', 'Link pago, mas a conta não estava em aberto', concat_ws(' · ', l.descricao, public.brl(p_valor_pago)),
      '/financeiro', '{financeiro}', l.unidade_id);
    return 'conta não estava em aberto';
  end if;
  if round(l.valor, 2) < round(c.valor, 2) then
    update cobrancas_link set erro = 'O link era de ' || public.brl(l.valor) || ' e a conta está em ' || public.brl(c.valor) || ': dê a baixa manual.' where id = p_id;
    perform public.notificar('pagamento', 'Link pago com valor menor que a conta', concat_ws(' · ', l.descricao, public.brl(l.valor)),
      '/financeiro', '{financeiro}', l.unidade_id);
    return 'valor menor que a conta';
  end if;

  -- conta bancária onde o dinheiro cai: a da InfinitePay ou a do Mercado Pago (pelo nome) da unidade
  if v_mp then
    select id into v_banco from contas_bancarias where ativo and unidade_id = c.unidade_id and nome ilike '%mercado%pago%' order by created_at limit 1;
  else
    select id into v_banco from contas_bancarias where ativo and banco = 'infinitepay' and unidade_id = c.unidade_id order by created_at limit 1;
  end if;
  v_forma := case when lower(coalesce(p_metodo, '')) in ('pix', 'bank_transfer') then 'pix' else 'cartao' end;
  v_como := case when v_forma = 'pix' then 'Pix' else 'cartão' || case when coalesce(p_parcelas, 1) > 1 then ' em ' || p_parcelas || 'x' else '' end end;
  begin
    update contas_receber set status = 'pago', data_pagamento = v_hoje, valor_pago = c.valor, forma_pagamento = v_forma,
           conta_bancaria_id = coalesce(c.conta_bancaria_id, v_banco),
           motivo_alteracao = 'Pago pelo link ' || v_nome || ' (' || v_como || ', ' || case when v_mp then 'pagamento ' else 'NSU ' end || coalesce(p_nsu, '?') || ')'
     where id = c.id;
    update cobrancas_link set baixa_em = now() where id = p_id;
  exception when others then
    update cobrancas_link set erro = 'Pagamento recebido, mas a baixa não foi feita: ' || sqlerrm where id = p_id;
    perform public.notificar('pagamento', 'Link pago: falta dar baixa', concat_ws(' · ', l.descricao, sqlerrm), '/financeiro', '{financeiro}', l.unidade_id);
    return 'baixa não feita: ' || sqlerrm;
  end;

  -- taxa do provedor (paga pela MF): despesa já paga na mesma conta bancária
  if p_taxa_valor is not null then
    v_valor_taxa := round(p_taxa_valor, 2);
    v_taxa := case when c.valor > 0 then round(p_taxa_valor * 100 / c.valor, 2) end;
  elsif not v_mp then
    select public.taxa_infinitepay(u.infinitepay_taxas, p_metodo, p_parcelas) into v_taxa from unidades u where u.id = l.unidade_id;
    if v_taxa is null then return 'baixa feita (taxa não cadastrada)'; end if;
    v_valor_taxa := round(c.valor * v_taxa / 100, 2);
  else
    return 'baixa feita (o Mercado Pago não informou a taxa)';
  end if;
  update cobrancas_link set taxa_percentual = v_taxa, taxa_valor = v_valor_taxa where id = p_id;
  if v_valor_taxa <= 0 then return 'baixa feita'; end if;
  begin
    insert into contas_pagar (descricao, categoria, valor, vencimento, status, data_pagamento, valor_pago, unidade_id, conta_bancaria_id,
                              id_externo, competencia, observacoes)
    values ('Taxa ' || v_nome || ': ' || l.descricao || ' (' || v_como || ')', 'tarifas bancárias', v_valor_taxa, v_hoje, 'pago', v_hoje,
            v_valor_taxa, c.unidade_id, coalesce(c.conta_bancaria_id, v_banco), case when v_mp then 'mercadopago-taxa:' else 'infinitepay-taxa:' end || l.id,
            date_trunc('month', v_hoje)::date,
            coalesce(v_taxa || '% sobre ', 'Sobre ') || public.brl(c.valor) || ', ' || case when v_mp then 'pagamento ' else 'NSU ' end || coalesce(p_nsu, '?')
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

-- a chamada antiga (InfinitePay, sem a taxa informada) continua igual
create or replace function public.confirmar_cobranca_link(p_id uuid, p_nsu text, p_slug text, p_metodo text,
  p_parcelas integer, p_valor_pago numeric, p_recibo text, p_aviso jsonb)
returns text language sql security definer set search_path = public as $$
  select public.confirmar_cobranca_link(p_id, p_nsu, p_slug, p_metodo, p_parcelas, p_valor_pago, p_recibo, p_aviso, null::numeric)
$$;
revoke execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb) to service_role;
