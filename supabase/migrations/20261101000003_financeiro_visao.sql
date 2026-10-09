-- =====================================================================
-- Financeiro: visão geral (saldo de hoje, realizado x previsto), baixa parcial
-- e o agendamento automático (pg_cron) sem secret manual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Agendamento: o pg_cron chama as Edge Functions com Authorization: Bearer <token>.
-- O token é gerado e guardado no Vault pelo próprio banco (erp_cron_token);
-- as funções conferem por aqui, com a chave de serviço. Ninguém precisa copiar token.
-- ---------------------------------------------------------------------
create or replace function public.cron_token_valido(p_token text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  if coalesce(length(p_token), 0) < 32 then return false; end if;
  execute 'select exists (select 1 from vault.decrypted_secrets where name = ''erp_cron_token'' and decrypted_secret = $1)' into v using p_token;
  return coalesce(v, false);
exception when others then
  return false;
end $$;
revoke execute on function public.cron_token_valido(text) from public, anon, authenticated;
grant execute on function public.cron_token_valido(text) to service_role;

-- ---------------------------------------------------------------------
-- Baixa parcial: o que falta vira uma nova conta em aberto, ligada à original
-- ---------------------------------------------------------------------
alter table public.contas_receber add column if not exists conta_origem_id uuid references public.contas_receber(id);
alter table public.contas_pagar add column if not exists conta_origem_id uuid references public.contas_pagar(id);

create or replace function public.reais(v numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(round(coalesce(v, 0), 2), 'FM999G999G990D00'), ',.', '.,')
$$;

create or replace function public.baixar_conta(p_tabela text, p_id uuid, p_data date, p_valor numeric, p_conta_bancaria uuid,
  p_restante_vencimento date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r jsonb; v_valor numeric; v_rest numeric; v_novo uuid;
begin
  perform public.exigir_papel('financeiro');
  if p_tabela not in ('contas_receber', 'contas_pagar') then raise exception 'tabela inválida'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'informe o valor pago'; end if;
  if p_data is null then raise exception 'informe a data do pagamento'; end if;
  if p_conta_bancaria is not null and not exists (select 1 from contas_bancarias where id = p_conta_bancaria and ativo) then
    raise exception 'conta bancária não encontrada';
  end if;
  execute format('select to_jsonb(c) from %I c where id = $1 for update', p_tabela) into r using p_id;
  if r is null then raise exception 'conta não encontrada'; end if;
  if r->>'status' <> 'aberto' then raise exception 'esta conta não está em aberto'; end if;
  v_valor := (r->>'valor')::numeric;
  perform set_config('erp.acao_usuario', 'on', true);

  if p_restante_vencimento is not null and p_valor < v_valor then
    v_rest := round(v_valor - p_valor, 2);
    execute format('insert into %I select * from jsonb_populate_record(null::%I, $1) returning id', p_tabela, p_tabela) into v_novo
      using r || jsonb_build_object(
        'id', gen_random_uuid(), 'valor', v_rest, 'vencimento', p_restante_vencimento, 'status', 'aberto',
        'descricao', regexp_replace(r->>'descricao', ' \(restante\)$', '') || ' (restante)', 'conta_origem_id', p_id,
        'data_pagamento', null, 'valor_pago', null, 'conta_bancaria_id', null, 'id_externo', null, 'created_at', now(),
        'motivo_alteracao', 'Restante do pagamento parcial de ' || public.reais(p_valor) || ' em ' || to_char(p_data, 'DD/MM/YYYY'));
    execute format('update %I set valor = $2, status = ''pago'', data_pagamento = $3, valor_pago = $2, conta_bancaria_id = $4, motivo_alteracao = $5 where id = $1', p_tabela)
      using p_id, p_valor, p_data, p_conta_bancaria,
            'Pagamento parcial: o restante de ' || public.reais(v_rest) || ' ficou em aberto para ' || to_char(p_restante_vencimento, 'DD/MM/YYYY');
  else
    execute format('update %I set status = ''pago'', data_pagamento = $3, valor_pago = $2, conta_bancaria_id = $4,
                    motivo_alteracao = case when $2 <> valor then $5 else motivo_alteracao end where id = $1', p_tabela)
      using p_id, p_valor, p_data, p_conta_bancaria,
            case when p_valor < v_valor then 'Pago com desconto de ' || public.reais(v_valor - p_valor)
                 else 'Pago com juros/multa de ' || public.reais(p_valor - v_valor) end;
  end if;
  return v_novo;
end $$;
revoke execute on function public.baixar_conta(text, uuid, date, numeric, uuid, date) from public, anon;
grant execute on function public.baixar_conta(text, uuid, date, numeric, uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Dinheiro que entrou e saiu de cada conta bancária (realizado):
-- contas pagas/recebidas + linhas do extrato que não viraram conta (pendentes, ignoradas, transferências)
-- ---------------------------------------------------------------------
create or replace function public.movimentos_realizados(p_de date, p_ate date)
returns table (conta_bancaria_id uuid, dia date, entradas numeric, saidas numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.tem_papel('financeiro') or public.e_contador()) then raise exception 'sem permissão para esta ação'; end if;
  return query
  select m.cb, m.d, round(sum(greatest(m.v, 0)), 2), round(sum(greatest(-m.v, 0)), 2)
    from (
      select r.conta_bancaria_id cb, r.data_pagamento d, coalesce(r.valor_pago, r.valor) v
        from contas_receber r where r.status = 'pago' and r.conta_bancaria_id is not null and r.data_pagamento between p_de and p_ate
      union all
      select p.conta_bancaria_id, p.data_pagamento, -coalesce(p.valor_pago, p.valor)
        from contas_pagar p where p.status = 'pago' and p.conta_bancaria_id is not null and p.data_pagamento between p_de and p_ate
      union all
      select l.conta_bancaria_id, l.data, l.valor
        from extrato_lancamentos l where l.status in ('pendente', 'ignorado', 'transferencia') and l.data between p_de and p_ate
    ) m
   group by m.cb, m.d;
end $$;
revoke execute on function public.movimentos_realizados(date, date) from public, anon;
grant execute on function public.movimentos_realizados(date, date) to authenticated;

-- Saldo de hoje de cada conta: parte do último saldo informado pelo banco (OFX) ou do saldo inicial cadastrado
create or replace function public.saldos_bancarios()
returns table (conta_id uuid, nome text, unidade_id uuid, tipo text, saldo numeric, data_base date, saldo_base numeric, origem text)
language plpgsql stable security definer set search_path = public as $$
declare cb record; v_base numeric; v_data date; v_desde date; v_origem text; v_mov numeric;
begin
  if not (public.tem_papel('financeiro') or public.e_contador()) then raise exception 'sem permissão para esta ação'; end if;
  for cb in select * from contas_bancarias where ativo order by nome loop
    v_base := null; v_data := null;
    select i.saldo_final, i.saldo_final_data into v_base, v_data from extrato_importacoes i
     where i.conta_bancaria_id = cb.id and i.saldo_final is not null and i.saldo_final_data is not null
     order by i.saldo_final_data desc, i.created_at desc limit 1;
    if v_data is not null and v_data >= cb.saldo_inicial_data then
      v_origem := 'extrato'; v_desde := v_data + 1;         -- o saldo do banco já inclui o dia dele
    else
      v_base := cb.saldo_inicial; v_data := cb.saldo_inicial_data; v_origem := 'cadastro'; v_desde := cb.saldo_inicial_data;
    end if;
    select coalesce(sum(m.entradas - m.saidas), 0) into v_mov
      from public.movimentos_realizados(v_desde, current_date) m where m.conta_bancaria_id = cb.id;
    conta_id := cb.id; nome := cb.nome; unidade_id := cb.unidade_id; tipo := cb.tipo;
    saldo := round(v_base + v_mov, 2); data_base := v_data; saldo_base := v_base; origem := v_origem;
    return next;
  end loop;
end $$;
revoke execute on function public.saldos_bancarios() from public, anon;
grant execute on function public.saldos_bancarios() to authenticated;
