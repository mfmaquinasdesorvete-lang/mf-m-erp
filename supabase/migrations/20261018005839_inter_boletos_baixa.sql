set lock_timeout = '8s';

-- Situação do boleto conferida direto no Inter (a função inter consulta antes de chamar): grava e, quando o Inter
-- confirma o recebimento (RECEBIDO), dá baixa na conta a receber na conta bancária do Inter. Só a função inter chama.
create or replace function public.registrar_boleto_inter(p_id uuid, p_dados jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare b boletos_inter; c contas_receber; v_banco uuid; v_valor numeric; v_forma text; v_cliente text;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into b from boletos_inter where id = p_id for update;
  if b.id is null then return 'boleto não encontrado'; end if;
  update boletos_inter set
         situacao = coalesce(nullif(p_dados->>'situacao', ''), situacao),
         situacao_data = coalesce(nullif(p_dados->>'situacao_data', '')::date, situacao_data),
         nosso_numero = coalesce(nullif(p_dados->>'nosso_numero', ''), nosso_numero),
         linha_digitavel = coalesce(nullif(p_dados->>'linha_digitavel', ''), linha_digitavel),
         codigo_barras = coalesce(nullif(p_dados->>'codigo_barras', ''), codigo_barras),
         pix_copia_cola = coalesce(nullif(p_dados->>'pix_copia_cola', ''), pix_copia_cola),
         txid = coalesce(nullif(p_dados->>'txid', ''), txid),
         valor_recebido = coalesce(nullif(p_dados->>'valor_recebido', '')::numeric, valor_recebido),
         origem_recebimento = coalesce(nullif(p_dados->>'origem_recebimento', ''), origem_recebimento),
         motivo_cancelamento = coalesce(nullif(p_dados->>'motivo_cancelamento', ''), motivo_cancelamento),
         erro = case when p_dados ? 'erro' then nullif(p_dados->>'erro', '') else erro end,
         atualizado_em = now()
   where id = p_id returning * into b;

  if b.situacao <> 'RECEBIDO' or b.baixa_em is not null then return b.situacao; end if;
  if b.conta_receber_id is null then return 'pago (sem conta ligada)'; end if;
  select * into c from contas_receber where id = b.conta_receber_id for update;
  select nome into v_cliente from clientes where id = c.cliente_id;
  v_valor := coalesce(b.valor_recebido, b.valor);
  if c.id is null or c.status <> 'aberto' then
    update boletos_inter set erro = 'Boleto pago, mas a conta não estava em aberto: confira se o cliente pagou duas vezes.' where id = b.id;
    perform public.notificar('pagamento', 'Boleto do Inter pago, mas a conta não estava em aberto', concat_ws(' · ', v_cliente, c.descricao, public.brl(v_valor)),
      '/financeiro?aba=receber', '{financeiro}', b.unidade_id);
    return 'conta não estava em aberto';
  end if;
  if round(v_valor, 2) < round(c.valor, 2) then
    update boletos_inter set erro = 'Pago ' || public.brl(v_valor) || ' e a conta está em ' || public.brl(c.valor) || ': dê a baixa manual.' where id = b.id;
    perform public.notificar('pagamento', 'Boleto do Inter pago com valor menor que a conta', concat_ws(' · ', v_cliente, c.descricao, public.brl(v_valor)),
      '/financeiro?aba=receber', '{financeiro}', b.unidade_id);
    return 'valor menor que a conta';
  end if;

  select conta_bancaria_id into v_banco from inter_conexoes where id = b.conexao_id;
  v_forma := case when b.origem_recebimento = 'PIX' then 'pix' else 'boleto' end;
  begin
    update contas_receber
       set status = 'pago', data_pagamento = coalesce(b.situacao_data, v_hoje), valor_pago = v_valor, forma_pagamento = v_forma,
           conta_bancaria_id = coalesce(v_banco, c.conta_bancaria_id),
           motivo_alteracao = 'Pago pelo boleto do Banco Inter (' || case when v_forma = 'pix' then 'Pix do boleto' else 'boleto' end
             || ', nosso número ' || coalesce(b.nosso_numero, '?') || ')'
     where id = c.id;
    update boletos_inter set baixa_em = now(), erro = null where id = b.id;
  exception when others then
    update boletos_inter set erro = 'Pago no Inter, mas a baixa não foi feita: ' || sqlerrm where id = b.id;
    perform public.notificar('pagamento', 'Boleto do Inter pago: falta dar baixa', concat_ws(' · ', v_cliente, c.descricao, sqlerrm),
      '/financeiro?aba=receber', '{financeiro}', b.unidade_id);
    return 'baixa não feita: ' || sqlerrm;
  end;
  perform public.notificar('pagamento', 'Boleto pago: ' || public.brl(v_valor), concat_ws(' · ', v_cliente, c.descricao,
    case when v_forma = 'pix' then 'pago pelo Pix do boleto' else 'pago pelo boleto' end), '/financeiro?aba=receber', '{financeiro}', b.unidade_id);
  return 'baixa feita';
end $$;
revoke execute on function public.registrar_boleto_inter(uuid, jsonb) from public, anon, authenticated;

-- Regras do boleto de cada conta do Inter (administrador): multa %, juros % ao mês, dias para o Inter cancelar e mensagem
create or replace function public.inter_regras_boleto(p_conexao uuid, p_multa numeric, p_juros numeric, p_dias int, p_mensagem text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_erp_admin() then raise exception 'Só o administrador muda as regras do boleto.'; end if;
  if p_multa is null or p_multa < 0 or p_multa > 2 then raise exception 'Multa entre 0 e 2%% (limite do Código de Defesa do Consumidor).'; end if;
  if p_juros is null or p_juros < 0 or p_juros > 10 then raise exception 'Juros entre 0 e 10%% ao mês.'; end if;
  if p_dias is null or p_dias < 0 or p_dias > 60 then raise exception 'Dias para baixa entre 0 e 60.'; end if;
  update inter_conexoes set boleto_multa_pct = p_multa, boleto_juros_mes_pct = p_juros, boleto_dias_baixa = p_dias,
         boleto_mensagem = nullif(left(btrim(coalesce(p_mensagem, '')), 300), '')
   where id = p_conexao and status <> 'desligada';
  if not found then raise exception 'Conta do Inter não encontrada.'; end if;
end $$;
revoke execute on function public.inter_regras_boleto(uuid, numeric, numeric, int, text) from public, anon;
