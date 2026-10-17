-- Reembolso da devolução de venda (financeiro): lança a conta a pagar "Devolução de venda – NF nº – cliente" na
-- categoria devoluções de vendas, ligada à NF-e de entrada de devolução emitida pela MF (p_nota) ou à NF-e de
-- devolução que o cliente emitiu e chegou da SEFAZ (p_recebida). A conta entra lançada pela pessoa e passa pela
-- aprovação, como qualquer pagamento feito à mão. Valor até o total da nota (devolução parcial: valor menor).
create or replace function public.lancar_conta_devolucao(p_nota uuid default null, p_recebida uuid default null, p_valor numeric default null,
                                                         p_vencimento date default null, p_chave_pix text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_num text; v_nome text; v_total numeric; v_unid uuid; v_emissao date; v_conta_atual uuid; v_conta uuid; v_valor numeric; v_venc date;
  v_fin text; v_tipo text; v_status text; v_excluida timestamptz;
begin
  if not public.tem_papel('financeiro') then raise exception 'Só o financeiro lança o reembolso da devolução'; end if;
  if (p_nota is null) = (p_recebida is null) then raise exception 'Informe uma nota de devolução'; end if;
  if p_nota is not null then
    select n.numero, coalesce(c.nome, n.destinatario_nome, n.payload->>'nome_destinatario'), n.valor_total, n.unidade_id, n.created_at::date,
           n.conta_pagar_id, n.finalidade, n.tipo_operacao, n.status, n.excluida_em
      into v_num, v_nome, v_total, v_unid, v_emissao, v_conta_atual, v_fin, v_tipo, v_status, v_excluida
      from public.notas_fiscais n left join public.clientes c on c.id = n.cliente_id
     where n.id = p_nota for update of n;
    if not found or v_fin is distinct from 'devolucao' or v_tipo is distinct from 'entrada' then
      raise exception 'Esta nota não é uma devolução de venda (NF-e de entrada de devolução)';
    end if;
    if v_status <> 'autorizada' then raise exception 'A NF-e de devolução precisa estar autorizada'; end if;
  else
    select nullif(ltrim(substring(r.chave from 26 for 9), '0'), ''), r.emitente_nome, r.valor_total, r.unidade_id, r.data_emissao::date,
           r.conta_pagar_id, r.finalidade, r.excluida_em
      into v_num, v_nome, v_total, v_unid, v_emissao, v_conta_atual, v_fin, v_excluida
      from public.nfe_recebidas r where r.id = p_recebida for update;
    if not found or v_fin is distinct from 'devolucao' then raise exception 'Esta nota não é uma devolução'; end if;
  end if;
  if v_excluida is not null then raise exception 'A nota foi excluída'; end if;
  if v_conta_atual is not null and exists (select 1 from public.contas_pagar where id = v_conta_atual and status <> 'cancelado') then
    raise exception 'Esta devolução já tem conta a pagar';
  end if;
  v_valor := round(coalesce(p_valor, v_total), 2);
  if v_valor is null or v_valor <= 0 then raise exception 'Valor do reembolso inválido'; end if;
  if v_total is not null and v_valor > v_total then raise exception 'O reembolso não pode passar do valor da nota de devolução'; end if;
  v_venc := coalesce(p_vencimento, v_hoje);

  insert into public.contas_pagar (descricao, categoria, documento, valor, vencimento, emissao, competencia, unidade_id, chave_pix, observacoes)
  values (left('Devolução de venda – NF ' || coalesce(v_num, '?') || coalesce(' – ' || nullif(btrim(v_nome), ''), ''), 200),
          'devoluções de vendas', 'NF ' || coalesce(v_num, '?') || ' · devolução', v_valor, v_venc, coalesce(v_emissao, v_hoje),
          date_trunc('month', coalesce(v_emissao, v_hoje))::date, v_unid, nullif(btrim(coalesce(p_chave_pix, '')), ''),
          'Reembolso ao cliente pela devolução de venda (NF-e ' || coalesce(v_num, '?') || case when v_total is not null and v_valor < v_total then ', parcial' else '' end
          || '). Se o cliente ainda não tinha pago a venda, cancele ou abata a conta a receber em vez de devolver.')
  returning id into v_conta;

  -- lançada à mão: passa pela aprovação como qualquer pagamento manual
  perform set_config('erp.revisao', 'on', true);
  update public.contas_pagar set revisao = 'em_revisao', lancamento = 'manual', criado_por = auth.uid(),
         revisao1_por = null, revisao1_nome = null, revisao1_em = null where id = v_conta;
  perform set_config('erp.revisao', '', true);

  if p_nota is not null then
    update public.notas_fiscais set conta_pagar_id = v_conta where id = p_nota;
  else
    update public.nfe_recebidas set conta_pagar_id = v_conta where id = p_recebida;
  end if;
  return v_conta;
end $$;
revoke execute on function public.lancar_conta_devolucao(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.lancar_conta_devolucao(uuid, uuid, numeric, date, text) to authenticated;

-- origem 'dv' (devolução de venda) nas contas a pagar; mesmas colunas, na mesma ordem
create or replace view public.contas_pagar_origem with (security_invoker = true) as
select c.id,
  case
    when d.id is not null or (n.id is not null and n.finalidade = 'devolucao') or (n2.id is not null and n2.finalidade = 'devolucao') then 'dv'
    when c.nfe_recebida_id is not null or n2.id is not null then 'nf'
    when f.id is not null then 'cte'
    when e.id is not null then 'frete'
    when s.id is not null then 'st'
    when g.id is not null then 'gnre'
    when c.documento ~ '^PC [0-9]+' or c.descricao ~ '^Pedido de compra #' then 'oc'
    when c.recorrente_id is not null then 'fixa'
    when c.observacoes like 'Gerado pelo ERP a partir das comissões%' then 'comissao'
    when c.observacoes like 'Lançado a partir do extrato bancário%' then 'extrato'
    when c.id_externo like 'infinitepay%' then 'infinitepay'
    when c.id_externo like 'olist%' or c.observacoes ilike '%olist%' then 'olist'
    when c.id_externo like 'tiny%' or c.lancamento = 'importado' then 'tiny'
    when c.lancamento = 'manual' then 'manual'
    else 'outro'
  end as origem,
  coalesce(nullif(ltrim(substring(coalesce(n.chave, n2.chave) from 26 for 9), '0'), ''), s.numero, g.nf_numero, d.numero) as nf_numero,
  coalesce(substring(c.documento from '^PC ([0-9]+)'), substring(c.descricao from '^Pedido de compra #([0-9]+)')) as oc_numero,
  e.numero::text as envio_numero,
  f.numero::text as fatura_numero,
  coalesce(c.emissao, n.data_emissao::date, n2.data_emissao::date, s.data_emissao, d.created_at::date, c.created_at::date) as emissao_efetiva
from public.contas_pagar c
left join public.nfe_recebidas n on n.id = c.nfe_recebida_id
left join lateral (select x.id, x.chave, x.data_emissao, x.finalidade from public.nfe_recebidas x where x.conta_pagar_id = c.id and c.nfe_recebida_id is null limit 1) n2 on true
left join lateral (select x.id, x.numero from public.cte_faturas x where x.conta_pagar_id = c.id limit 1) f on true
left join lateral (select x.id, x.numero from public.envios x where x.conta_pagar_id = c.id limit 1) e on true
left join lateral (select x.id, x.numero, x.data_emissao from public.nfse_importadas x where x.conta_pagar_id = c.id limit 1) s on true
left join lateral (select x.id, x.nf_numero from public.gnre_guias x where x.conta_pagar_id = c.id limit 1) g on true
left join lateral (select x.id, x.numero, x.created_at from public.notas_fiscais x where x.conta_pagar_id = c.id limit 1) d on true;

comment on view public.contas_pagar_origem is 'De onde veio cada conta a pagar, os números para a busca e a data de emissão que vale';
