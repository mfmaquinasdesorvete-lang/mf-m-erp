-- =====================================================================
-- Extrato bancário (OFX) que chega por e-mail na caixa do ERP
--   * contas_bancarias.extrato_remetentes: quem pode mandar o extrato desta conta
--     (endereço completo ou domínio, ex.: "nubank.com.br", "fulano@gmail.com")
--   * emails.extratos: o que o ERP fez com cada OFX anexo (importado, aguardando conferência ou erro)
--   * extrato_importacoes.email_id: importação que veio de um e-mail
--   * importar_extrato_email(): só o servidor (função email-caixa) chama, depois de conferir
--     a assinatura DKIM do remetente, a lista de remetentes e o número da conta do arquivo.
-- Somente acréscimos.
-- =====================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contas_bancarias' and column_name = 'extrato_remetentes') then
    alter table public.contas_bancarias add column extrato_remetentes text[] not null default '{}';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'emails' and column_name = 'extratos') then
    alter table public.emails add column extratos jsonb not null default '[]';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'extrato_importacoes' and column_name = 'email_id') then
    alter table public.extrato_importacoes add column email_id uuid; -- e-mail de onde veio (referência solta, como nos registros)
  end if;
end $$;

comment on column public.contas_bancarias.extrato_remetentes is 'Remetentes autorizados a mandar o extrato (OFX) desta conta por e-mail: endereço ou domínio';
comment on column public.emails.extratos is 'Extratos OFX anexos: [{indice, nome, status importado|aguardando|erro, motivo, conta_id, conta, novas, conciliadas, periodo}]';

create or replace function public.importar_extrato_email(
  p_conta uuid, p_email uuid, p_arquivo text, p_linhas jsonb, p_saldo_final numeric default null, p_saldo_data date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_imp uuid; v_total int; v_novas int; v_auto int := 0; v_banco text; v_unid uuid;
begin
  select nome, unidade_id into v_banco, v_unid from contas_bancarias where id = p_conta and ativo;
  if v_banco is null then raise exception 'conta bancária não encontrada'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'o arquivo não tem lançamentos'; end if;
  v_total := jsonb_array_length(p_linhas);
  insert into extrato_importacoes (conta_bancaria_id, arquivo, formato, periodo_inicio, periodo_fim, saldo_final, saldo_final_data, email_id)
  select p_conta, left(p_arquivo, 200), 'ofx', min((e->>'data')::date), max((e->>'data')::date), p_saldo_final, p_saldo_data, p_email
    from jsonb_array_elements(p_linhas) e
  returning id into v_imp;

  with novas as (
    insert into extrato_lancamentos (conta_bancaria_id, importacao_id, data, valor, descricao, documento, identificador)
    select p_conta, v_imp, (e->>'data')::date, round((e->>'valor')::numeric, 2), left(e->>'descricao', 300), left(e->>'documento', 60), e->>'identificador'
      from jsonb_array_elements(p_linhas) e
     where coalesce((e->>'valor')::numeric, 0) <> 0 and coalesce(e->>'identificador', '') <> ''
    on conflict (conta_bancaria_id, identificador) do nothing
    returning 1)
  select count(*) into v_novas from novas;

  if v_novas > 0 then v_auto := public.conciliar_automatico_interno(p_conta); end if;
  update extrato_importacoes set linhas_novas = v_novas, linhas_repetidas = v_total - v_novas, conciliadas_auto = v_auto where id = v_imp;
  if v_novas > 0 then
    perform public.notificar('pagamento', 'Extrato ' || v_banco || ' chegou por e-mail: ' || v_novas || ' lançamento(s) novo(s)',
      case when v_novas - v_auto > 0 then (v_novas - v_auto) || ' para conciliar' || case when v_auto > 0 then ', ' || v_auto || ' já conciliado(s) sozinho(s)' else '' end
           else 'todos conciliados sozinhos' end,
      '/conciliacao', '{financeiro}', v_unid);
  end if;
  return jsonb_build_object('importacao', v_imp, 'novas', v_novas, 'repetidas', v_total - v_novas, 'conciliadas', v_auto);
end $$;

revoke execute on function public.importar_extrato_email(uuid, uuid, text, jsonb, numeric, date) from public, anon, authenticated;
grant execute on function public.importar_extrato_email(uuid, uuid, text, jsonb, numeric, date) to service_role;
