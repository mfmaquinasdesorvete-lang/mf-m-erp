-- Extrato sem movimento e período do arquivo (pedido da usuária de 28/10, via AUD): o OFX sem lançamento passa a ser
-- importado e o período gravado em extrato_importacoes é o que o banco declara (DTSTART–DTEND), não só o das linhas.
-- Assim o mês sem movimento deixa de parecer "buraco" no Auditor financeiro.
-- A função ganha p_periodo_inicio e p_periodo_fim (opcionais): quem chama com os 6 parâmetros antigos (Inter, Open
-- Finance, extrato por e-mail) continua igual.
drop function if exists public.importar_extrato(uuid, text, text, jsonb, numeric, date);

create or replace function public.importar_extrato(p_conta uuid, p_arquivo text, p_formato text, p_linhas jsonb,
  p_saldo_final numeric default null, p_saldo_data date default null,
  p_periodo_inicio date default null, p_periodo_fim date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_imp uuid; v_total int; v_novas int; v_auto int; v_ini date; v_fim date;
begin
  perform public.exigir_papel('financeiro');
  if not exists (select 1 from contas_bancarias where id = p_conta and ativo) then raise exception 'conta bancária não encontrada'; end if;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'o arquivo não tem lançamentos'; end if;
  v_total := jsonb_array_length(p_linhas);
  select min((e->>'data')::date), max((e->>'data')::date) into v_ini, v_fim from jsonb_array_elements(p_linhas) e;
  -- o período do arquivo vale quando vem; senão, o das linhas. Sem linhas e sem período não há o que importar.
  v_ini := least(coalesce(p_periodo_inicio, v_ini), coalesce(v_ini, p_periodo_inicio));
  v_fim := greatest(coalesce(p_periodo_fim, v_fim), coalesce(v_fim, p_periodo_fim));
  if v_total = 0 and (v_ini is null or v_fim is null) then raise exception 'o arquivo não tem lançamentos'; end if;
  if v_ini > v_fim then raise exception 'período do extrato inválido'; end if;
  insert into extrato_importacoes (conta_bancaria_id, arquivo, formato, periodo_inicio, periodo_fim, saldo_final, saldo_final_data)
  values (p_conta, p_arquivo, p_formato, v_ini, v_fim, p_saldo_final, p_saldo_data)
  returning id into v_imp;

  with novas as (
    insert into extrato_lancamentos (conta_bancaria_id, importacao_id, data, valor, descricao, documento, identificador)
    select p_conta, v_imp, (e->>'data')::date, round((e->>'valor')::numeric, 2), left(e->>'descricao', 300), left(e->>'documento', 60), e->>'identificador'
      from jsonb_array_elements(p_linhas) e
     where coalesce((e->>'valor')::numeric, 0) <> 0 and coalesce(e->>'identificador', '') <> ''
    on conflict (conta_bancaria_id, identificador) do nothing
    returning 1)
  select count(*) into v_novas from novas;

  v_auto := case when v_total > 0 then public.conciliar_automatico(p_conta) else 0 end;
  update extrato_importacoes set linhas_novas = v_novas, linhas_repetidas = v_total - v_novas, conciliadas_auto = v_auto where id = v_imp;
  return jsonb_build_object('importacao', v_imp, 'novas', v_novas, 'repetidas', v_total - v_novas, 'conciliadas', v_auto);
end $$;
revoke all on function public.importar_extrato(uuid, text, text, jsonb, numeric, date, date, date) from public, anon;
grant execute on function public.importar_extrato(uuid, text, text, jsonb, numeric, date, date, date) to authenticated, service_role;
