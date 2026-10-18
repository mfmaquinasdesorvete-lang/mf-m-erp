-- Aplicada pelo execute_sql (o caminho até o banco recusa ":=" e "drop trigger": aqui usa "=" e só cria).
create or replace function public.trg_pagar_negociacao_atualizada()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.atualizado_em = now();
  return new;
end $fn$;
create trigger trg_pagar_negociacao_atualizada before update on public.pagar_negociacoes for each row execute function public.trg_pagar_negociacao_atualizada();

-- "1234.5" → "1.234,50" (texto do histórico, sem depender do idioma do servidor)
create or replace function public.texto_reais(p numeric)
returns text language sql immutable set search_path = public as $fn$
  select translate(to_char(round(coalesce(p, 0), 2), 'FM999,999,999,990.00'), ',.', '.,')
$fn$;

-- Renegociar: junta as contas em aberto numa negociação. Com p_trocar, as contas viram "original" (canceladas com o
-- motivo) e o acordo vira p_parcelas contas novas (mensais a partir de p_primeiro, a última leva os centavos), que passam
-- pela aprovação como qualquer conta. Sem p_trocar, as mesmas contas ficam como "acordo" (só se registra a negociação).
-- Roda com as regras de linha de quem chama (security invoker).
create or replace function public.renegociar_contas_pagar(p_ids uuid[], p_titulo text, p_trocar boolean, p_valor numeric, p_parcelas int, p_primeiro date, p_obs text)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare
  v_neg uuid; v_n int; v_total numeric; v_forn uuid; v_unid uuid; v_cat text; v_rateio jsonb; v_comp date; v_nome text;
  v_parcela numeric; v_ultima numeric; v_titulo text = btrim(coalesce(p_titulo, ''));
begin
  if not public.tem_papel('financeiro') then raise exception 'Só o financeiro renegocia contas.'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Escolha as contas que entram na renegociação.'; end if;
  if length(v_titulo) < 3 then raise exception 'Dê um nome à renegociação (pelo menos 3 letras).'; end if;
  select count(*), coalesce(sum(valor), 0) into v_n, v_total
    from public.contas_pagar where id = any(p_ids) and status = 'aberto' and negociacao_id is null;
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Só entram contas em aberto e que não estejam em outra renegociação.';
  end if;
  -- o acordo fica na competência (mês do DRE) da primeira conta: a despesa continua no mês em que aconteceu
  select fornecedor_id, unidade_id, categoria, rateio, coalesce(competencia, date_trunc('month', vencimento)::date) into v_forn, v_unid, v_cat, v_rateio, v_comp
    from public.contas_pagar where id = any(p_ids) order by vencimento, created_at limit 1;
  select nome into v_nome from public.usuarios_erp where user_id = auth.uid();

  if p_trocar then
    if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor do acordo.'; end if;
    if coalesce(p_parcelas, 0) not between 1 and 120 then raise exception 'As parcelas vão de 1 a 120.'; end if;
    if p_primeiro is null then raise exception 'Informe o vencimento da 1ª parcela.'; end if;
  end if;

  insert into public.pagar_negociacoes (titulo, fornecedor_id, unidade_id, valor_original, valor_acordo, parcelas, situacao, observacoes, criado_nome)
  values (v_titulo, v_forn, v_unid, v_total, case when p_trocar then round(p_valor, 2) end, case when p_trocar then p_parcelas end,
          case when p_trocar then 'acordo' else 'negociando' end, nullif(btrim(coalesce(p_obs, '')), ''), v_nome)
  returning id into v_neg;

  if p_trocar then
    update public.contas_pagar
       set negociacao_id = v_neg, negociacao_papel = 'original', status = 'cancelado',
           motivo_alteracao = 'Renegociada: ' || v_titulo
     where id = any(p_ids);
    v_parcela = round(p_valor / p_parcelas, 2);
    v_ultima = round(p_valor, 2) - v_parcela * (p_parcelas - 1);
    insert into public.contas_pagar (descricao, fornecedor_id, unidade_id, categoria, rateio, valor, vencimento, status, competencia, observacoes, negociacao_id, negociacao_papel)
    select v_titulo || ' · parcela ' || i || '/' || p_parcelas, v_forn, v_unid, v_cat, coalesce(v_rateio, '[]'::jsonb),
           case when i = p_parcelas then v_ultima else v_parcela end,
           (p_primeiro + make_interval(months => i - 1))::date, 'aberto', v_comp,
           'Acordo da renegociação "' || v_titulo || '"', v_neg, 'acordo'
      from generate_series(1, p_parcelas) i;
  else
    update public.contas_pagar set negociacao_id = v_neg, negociacao_papel = 'acordo' where id = any(p_ids);
  end if;

  insert into public.pagar_negociacao_eventos (negociacao_id, tipo, texto, criado_nome)
  values (v_neg, 'acordo', case
    when p_trocar then format('%s %s (R$ %s) trocada(s) por %s %s de R$ %s a partir de %s.', v_n, case when v_n = 1 then 'conta' else 'contas' end,
      public.texto_reais(v_total), p_parcelas, case when p_parcelas = 1 then 'parcela' else 'parcelas' end,
      public.texto_reais(v_parcela), to_char(p_primeiro, 'DD/MM/YYYY'))
    else format('Negociação aberta para %s %s (R$ %s); as contas continuam as mesmas.', v_n, case when v_n = 1 then 'conta' else 'contas' end,
      public.texto_reais(v_total))
  end, v_nome);
  return v_neg;
end $fn$;
revoke execute on function public.renegociar_contas_pagar(uuid[], text, boolean, numeric, int, date, text) from public, anon;
grant execute on function public.renegociar_contas_pagar(uuid[], text, boolean, numeric, int, date, text) to authenticated;

-- Recibos: o financeiro pode excluir (o número não volta); a exclusão e a emissão ficam na auditoria.
create policy erp_delete on public.recibos for delete to authenticated using (public.tem_papel('financeiro'));
create trigger zz_auditoria before insert or delete or update on public.recibos for each row execute function public.trg_auditoria();
