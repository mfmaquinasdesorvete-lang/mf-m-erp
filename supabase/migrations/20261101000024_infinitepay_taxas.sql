-- Taxa da InfinitePay paga pela MF: cada unidade guarda as taxas do seu plano (Pix, débito e crédito de 1x a 12x,
-- em %) e, quando um link é pago, a taxa entra sozinha como despesa já paga ("tarifas bancárias") na conta
-- InfinitePay da unidade. Assim o saldo do ERP bate com o que cai na conta (valor da venda menos a taxa).
--   unidades.infinitepay_taxas = {"pix": 0, "debito": 1.37, "credito": [4.2, 5.39, ..., 16.66]}  (12 posições)
-- Sem taxa cadastrada para o meio/parcelas, nada é lançado e o link mostra "taxa não cadastrada".

alter table public.unidades add column if not exists infinitepay_taxas jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'unidades_infinitepay_taxas_objeto') then
    alter table public.unidades add constraint unidades_infinitepay_taxas_objeto check (jsonb_typeof(infinitepay_taxas) = 'object');
  end if;
end $$;

alter table public.cobrancas_link add column if not exists taxa_percentual numeric(6,3);
alter table public.cobrancas_link add column if not exists taxa_valor numeric(14,2);
alter table public.cobrancas_link add column if not exists conta_taxa_id uuid references public.contas_pagar(id) on delete set null;

-- Taxa (%) do plano para o meio e as parcelas; null = não cadastrada.
create or replace function public.taxa_infinitepay(p_taxas jsonb, p_metodo text, p_parcelas integer)
returns numeric language plpgsql immutable set search_path = public as $$
declare m text := lower(coalesce(p_metodo, '')); v text; n integer := greatest(1, least(12, coalesce(p_parcelas, 1)));
begin
  if p_taxas is null then return null; end if;
  if m = 'pix' then v := p_taxas->>'pix';
  elsif m like '%debit%' then v := p_taxas->>'debito';
  else
    if jsonb_typeof(p_taxas->'credito') <> 'array' then return null; end if;
    v := (p_taxas->'credito')->>(n - 1);
  end if;
  if v is null or btrim(v) = '' or v !~ '^\s*\d+(\.\d+)?\s*$' then return null; end if;
  return v::numeric;
end $$;

create or replace function public.confirmar_cobranca_link(p_id uuid, p_nsu text, p_slug text, p_metodo text,
  p_parcelas integer, p_valor_pago numeric, p_recibo text, p_aviso jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare l cobrancas_link; c contas_receber; v_banco uuid; v_forma text; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        v_taxa numeric; v_valor_taxa numeric; v_conta_taxa uuid; v_como text;
begin
  select * into l from cobrancas_link where id = p_id for update;
  if l.id is null then return 'link não encontrado'; end if;
  if l.status = 'pago' then return 'já registrado'; end if;

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

  select id into v_banco from contas_bancarias where ativo and banco = 'infinitepay' and unidade_id = c.unidade_id order by created_at limit 1;
  v_forma := case when lower(coalesce(p_metodo, '')) = 'pix' then 'pix' else 'cartao' end;
  v_como := case when v_forma = 'pix' then 'Pix' else 'cartão' || case when coalesce(p_parcelas, 1) > 1 then ' em ' || p_parcelas || 'x' else '' end end;
  begin
    update contas_receber set status = 'pago', data_pagamento = v_hoje, valor_pago = c.valor, forma_pagamento = v_forma,
           conta_bancaria_id = coalesce(c.conta_bancaria_id, v_banco),
           motivo_alteracao = 'Pago pelo link InfinitePay (' || v_como || ', NSU ' || coalesce(p_nsu, '?') || ')'
     where id = c.id;
    update cobrancas_link set baixa_em = now() where id = p_id;
  exception when others then
    update cobrancas_link set erro = 'Pagamento recebido, mas a baixa não foi feita: ' || sqlerrm where id = p_id;
    perform public.notificar('pagamento', 'Link pago: falta dar baixa', concat_ws(' · ', l.descricao, sqlerrm), '/financeiro', '{financeiro}', l.unidade_id);
    return 'baixa não feita: ' || sqlerrm;
  end;

  -- taxa da InfinitePay (paga pela MF): despesa já paga na mesma conta bancária
  select public.taxa_infinitepay(u.infinitepay_taxas, p_metodo, p_parcelas) into v_taxa from unidades u where u.id = l.unidade_id;
  if v_taxa is null then return 'baixa feita (taxa não cadastrada)'; end if;
  v_valor_taxa := round(c.valor * v_taxa / 100, 2);
  update cobrancas_link set taxa_percentual = v_taxa, taxa_valor = v_valor_taxa where id = p_id;
  if v_valor_taxa <= 0 then return 'baixa feita'; end if;
  begin
    insert into contas_pagar (descricao, categoria, valor, vencimento, status, data_pagamento, valor_pago, unidade_id, conta_bancaria_id,
                              id_externo, competencia, observacoes)
    values ('Taxa InfinitePay: ' || l.descricao || ' (' || v_como || ')', 'tarifas bancárias', v_valor_taxa, v_hoje, 'pago', v_hoje,
            v_valor_taxa, c.unidade_id, coalesce(c.conta_bancaria_id, v_banco), 'infinitepay-taxa:' || l.id, date_trunc('month', v_hoje)::date,
            v_taxa || '% sobre ' || public.brl(c.valor) || ', NSU ' || coalesce(p_nsu, '?') || '. Lançada pelo ERP quando o link foi pago.')
    returning id into v_conta_taxa;
    update cobrancas_link set conta_taxa_id = v_conta_taxa where id = p_id;
  exception when others then
    update cobrancas_link set erro = 'Baixa feita, mas a taxa não foi lançada: ' || sqlerrm where id = p_id;
    perform public.notificar('pagamento', 'Link pago: lance a taxa da InfinitePay', concat_ws(' · ', l.descricao, public.brl(v_valor_taxa), sqlerrm),
      '/financeiro', '{financeiro}', l.unidade_id);
  end;
  return 'baixa feita';
end $$;
revoke execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb) to service_role;
