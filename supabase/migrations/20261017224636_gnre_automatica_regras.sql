-- GNRE automática (como no Tiny, com a guia acompanhada no ERP)
--  * Quando a NF-e de venda emitida pelo ERP sai autorizada para outro estado com DIFAL (consumidor final sem IE),
--    FCP do destino ou ICMS-ST destacado, o ERP lança sozinho a conta a pagar "GNRE – NF nº – UF" (categoria
--    impostos), vencendo no próximo dia útil, e avisa o financeiro. A guia em si continua sendo gerada no portal
--    da GNRE; o código de barras colado no ERP vai para a conta.
--  * Não lança: nota importada, homologação, devolução, mesma UF do emitente, unidade com a GNRE automática
--    desligada ou UF onde a unidade tem inscrição de substituto tributário (o imposto vai na apuração mensal).
--  * NF-e cancelada: a guia é cancelada e a conta em aberto também; se já foi paga, o financeiro recebe o aviso
--    para pedir a restituição (confirmar com o contador).
--  * Erro ao lançar nunca impede a autorização da nota: vira aviso para o financeiro.
create or replace function public.gnre_lancar_interna(p_nota uuid, p_manual boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  n public.notas_fiscais%rowtype;
  u public.unidades%rowtype;
  v_uf text;
  v_difal numeric := 0; v_fcp numeric := 0; v_st numeric := 0; v_total numeric;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venc date;
  v_conta uuid;
  v_guia uuid;
  v_partes text[];
begin
  select * into n from public.notas_fiscais where id = p_nota;
  if not found or n.status <> 'autorizada' then return null; end if;
  if exists (select 1 from public.gnre_guias g where g.nota_fiscal_id = n.id) then return null; end if;
  if n.origem = 'importada' or coalesce(n.ambiente, '') = 'homologacao' or coalesce(n.tipo_operacao, 'saida') <> 'saida'
     or coalesce(n.finalidade, 'normal') not in ('normal', 'complementar') then return null; end if;
  select * into u from public.unidades where id = n.unidade_id;
  v_uf := upper(btrim(coalesce(n.payload->>'uf_destinatario', '')));
  if u.id is null or v_uf = '' or v_uf = upper(coalesce(u.uf, '')) then return null; end if;
  if not p_manual and (not u.gnre_automatica or v_uf = any (u.gnre_ufs_inscritas)) then return null; end if;

  select coalesce(sum(public.metas_num(i->>'icms_valor_uf_destino')), 0),
         coalesce(sum(public.metas_num(i->>'fcp_valor_uf_destino')), 0),
         coalesce(sum(public.metas_num(i->>'icms_valor_st') + public.metas_num(i->>'fcp_valor_st')), 0)
    into v_difal, v_fcp, v_st
    from jsonb_array_elements(case when jsonb_typeof(n.payload->'items') = 'array' then n.payload->'items' else '[]'::jsonb end) i;
  v_total := round(v_difal + v_fcp + v_st, 2);
  if v_total <= 0 then return null; end if;

  v_venc := public.proximo_dia_util(v_hoje);
  v_partes := array_remove(array[
    case when v_difal > 0 then 'DIFAL ' || replace(to_char(v_difal, 'FM9999999990.00'), '.', ',') end,
    case when v_fcp > 0 then 'FCP ' || replace(to_char(v_fcp, 'FM9999999990.00'), '.', ',') end,
    case when v_st > 0 then 'ICMS-ST ' || replace(to_char(v_st, 'FM9999999990.00'), '.', ',') end], null);

  insert into public.contas_pagar (descricao, categoria, documento, valor, vencimento, emissao, competencia, unidade_id, observacoes)
  values ('GNRE – NF ' || coalesce(n.numero, '?') || ' – ' || v_uf, 'impostos', 'NF ' || coalesce(n.numero, '?') || ' · GNRE',
          v_total, v_venc, v_hoje, date_trunc('month', v_hoje)::date, n.unidade_id,
          'Gerado pelo ERP na autorização da NF-e ' || coalesce(n.numero, '') || ' para ' || v_uf || ' (' || array_to_string(v_partes, ' · ')
          || '). Gerar a guia no portal da GNRE e colar o código de barras na nota. Regra do imposto: confirmar com o contador.')
  returning id into v_conta;

  insert into public.gnre_guias (nota_fiscal_id, unidade_id, uf, nf_numero, valor_difal, valor_fcp, valor_st, valor_total, vencimento, conta_pagar_id,
                                 observacao, atualizado_por)
  values (n.id, n.unidade_id, v_uf, n.numero, round(v_difal, 2), round(v_fcp, 2), round(v_st, 2), v_total, v_venc, v_conta,
          case when p_manual then 'Lançada pelo financeiro' end, case when p_manual then auth.uid() end)
  returning id into v_guia;

  insert into public.notificacoes (tipo, titulo, texto, link, papeis, unidade_id, urgencia)
  values ('pagamento', 'GNRE a pagar: NF ' || coalesce(n.numero, '?') || ' – ' || v_uf,
          'R$ ' || replace(to_char(v_total, 'FM9999999990.00'), '.', ',') || ' (' || array_to_string(v_partes, ' · ') || '), vence em '
          || to_char(v_venc, 'DD/MM') || '. Gere a guia no portal da GNRE e cole o código de barras na nota.',
          '/financeiro?aba=pagar', array['financeiro'], n.unidade_id, 'importante');
  return v_guia;
end $$;

revoke execute on function public.gnre_lancar_interna(uuid, boolean) from public, anon, authenticated;

-- botão "Lançar GNRE" da nota (para nota autorizada antes da regra ou UF que estava como inscrita)
create or replace function public.gnre_lancar_nota(p_nota uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.tem_papel('financeiro') then raise exception 'Só o financeiro lança a GNRE'; end if;
  if exists (select 1 from public.gnre_guias where nota_fiscal_id = p_nota) then raise exception 'Esta nota já tem GNRE lançada'; end if;
  v := public.gnre_lancar_interna(p_nota, true);
  if v is null then raise exception 'Esta nota não tem DIFAL, FCP nem ICMS-ST para outro estado (ou não está autorizada)'; end if;
  return v;
end $$;
revoke execute on function public.gnre_lancar_nota(uuid) from public, anon;
grant execute on function public.gnre_lancar_nota(uuid) to authenticated;

-- código de barras da guia gerada no portal: guarda na guia e na conta em aberto
create or replace function public.gnre_informar_guia(p_id uuid, p_codigo text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.gnre_guias%rowtype; v_cod text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
begin
  if not public.tem_papel('financeiro') then raise exception 'Só o financeiro informa a guia'; end if;
  select * into g from public.gnre_guias where id = p_id for update;
  if not found then raise exception 'Guia não encontrada'; end if;
  if g.situacao = 'cancelada' then raise exception 'Guia cancelada (a NF-e foi cancelada)'; end if;
  if length(v_cod) not in (44, 48) then raise exception 'O código de barras da GNRE tem 44 ou 48 números'; end if;
  update public.gnre_guias set codigo_barras = v_cod, situacao = 'gerada', atualizado_em = now(), atualizado_por = auth.uid() where id = p_id;
  update public.contas_pagar set linha_digitavel = v_cod where id = g.conta_pagar_id and status = 'aberto';
end $$;
revoke execute on function public.gnre_informar_guia(uuid, text) from public, anon;
grant execute on function public.gnre_informar_guia(uuid, text) to authenticated;

create or replace function public.trg_gnre_nota()
returns trigger language plpgsql security definer set search_path = public as $$
declare g public.gnre_guias%rowtype; v_status text;
begin
  if new.status = 'autorizada' and (tg_op = 'INSERT' or old.status is distinct from 'autorizada') then
    begin
      perform public.gnre_lancar_interna(new.id, false);
    exception when others then
      insert into public.notificacoes (tipo, titulo, texto, link, papeis, unidade_id, urgencia)
      values ('pagamento', 'GNRE não lançada: NF ' || coalesce(new.numero, '?'),
              'A NF-e saiu autorizada, mas a conta da GNRE não foi lançada (' || left(sqlerrm, 200) || '). Abra a nota e use "Lançar GNRE".',
              '/notas', array['financeiro'], new.unidade_id, 'importante');
    end;
  elsif tg_op = 'UPDATE' and new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    select * into g from public.gnre_guias where nota_fiscal_id = new.id;
    if found and g.situacao <> 'cancelada' then
      begin
        update public.gnre_guias set situacao = 'cancelada', atualizado_em = now(),
               observacao = concat_ws(' · ', observacao, 'NF-e cancelada') where id = g.id;
        select status into v_status from public.contas_pagar where id = g.conta_pagar_id;
        if v_status = 'aberto' then
          update public.contas_pagar set status = 'cancelado', motivo_alteracao = 'NF-e ' || coalesce(new.numero, '') || ' cancelada: a GNRE não é mais devida'
           where id = g.conta_pagar_id;
        elsif v_status = 'pago' then
          insert into public.notificacoes (tipo, titulo, texto, link, papeis, unidade_id, urgencia)
          values ('pagamento', 'GNRE paga de NF cancelada: NF ' || coalesce(new.numero, '?') || ' – ' || g.uf,
                  'A NF-e foi cancelada depois de a GNRE de R$ ' || replace(to_char(g.valor_total, 'FM9999999990.00'), '.', ',')
                  || ' ser paga. Peça a restituição ao estado de ' || g.uf || ' (confirmar com o contador).',
                  '/financeiro?aba=pagar', array['financeiro'], new.unidade_id, 'importante');
        end if;
      exception when others then
        insert into public.notificacoes (tipo, titulo, texto, link, papeis, unidade_id, urgencia)
        values ('pagamento', 'Conferir a GNRE da NF ' || coalesce(new.numero, '?') || ' cancelada',
                'A NF-e foi cancelada, mas a conta da GNRE não pôde ser cancelada sozinha (' || left(sqlerrm, 200) || ').',
                '/financeiro?aba=pagar', array['financeiro'], new.unidade_id, 'importante');
      end;
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.trg_gnre_nota() from public, anon, authenticated;
