-- =====================================================================
-- Contas fixas a pagar com forma de pagamento (Pix, boleto, transferência…) e chave Pix do favorecido.
-- Ex.: honorários do advogado, R$ 1.500 no último dia de cada mês, pagos por Pix.
-- A conta lançada leva na observação como pagar e a chave Pix do fornecedor.
-- =====================================================================
alter table public.fornecedores add column if not exists chave_pix text;

insert into public.categorias_financeiras (nome, tipo, grupo, ordem)
select 'serviços profissionais', 'despesa', 'despesa_operacional', 48
 where not exists (select 1 from public.categorias_financeiras where nome = 'serviços profissionais');

create or replace function public.forma_pagamento_rotulo(p text)
returns text language sql immutable as $$
  select case lower(coalesce(p, ''))
    when 'pix' then 'Pix' when 'boleto' then 'boleto' when 'transferencia' then 'transferência (TED)'
    when 'debito_automatico' then 'débito automático' when 'cartao' then 'cartão' when 'dinheiro' then 'dinheiro'
    else nullif(p, '') end
$$;

create or replace function public.gerar_recorrentes_interno(p_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_passo int; v_mes date; v_venc date; v_limite date; v_n int := 0; v_ok int; v_obs text;
begin
  for r in select * from contas_recorrentes where ativo and (p_id is null or id = p_id) loop
    v_passo := case r.frequencia when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 else 12 end;
    v_limite := least(coalesce(r.fim, 'infinity'::date), current_date + r.antecedencia_dias);
    v_mes := date_trunc('month', r.inicio)::date;
    -- como pagar: forma, chave Pix do fornecedor e a observação da conta fixa
    v_obs := concat_ws(' · ', 'Conta fixa lançada pelo ERP',
      'pagar por ' || forma_pagamento_rotulo(r.forma_pagamento),
      (select 'chave Pix: ' || nullif(btrim(f.chave_pix), '') from fornecedores f where f.id = r.fornecedor_id and lower(coalesce(r.forma_pagamento, '')) = 'pix'),
      nullif(btrim(r.observacoes), ''));
    while v_mes <= v_limite loop
      v_venc := least(v_mes + (r.dia_vencimento - 1), (v_mes + interval '1 month' - interval '1 day')::date);
      if v_venc >= greatest(r.inicio, r.created_at::date) and v_venc <= v_limite then
        if r.tipo = 'pagar' then
          insert into contas_pagar (descricao, fornecedor_id, categoria, rateio, valor, vencimento, unidade_id, observacoes, recorrente_id, competencia)
          values (r.descricao || ' · ' || to_char(v_mes, 'MM/YYYY'), r.fornecedor_id, coalesce(r.categoria, 'outros'), r.rateio, r.valor, v_venc,
                  r.unidade_id, v_obs, r.id, v_mes)
          on conflict (recorrente_id, competencia) where recorrente_id is not null do nothing;
        else
          insert into contas_receber (descricao, cliente_id, categoria, rateio, valor, vencimento, forma_pagamento, unidade_id, recorrente_id, competencia, parcela, total_parcelas)
          values (r.descricao || ' · ' || to_char(v_mes, 'MM/YYYY'), r.cliente_id, coalesce(r.categoria, 'outras receitas'), r.rateio, r.valor, v_venc,
                  coalesce(r.forma_pagamento, 'boleto'), r.unidade_id, r.id, v_mes, 1, 1)
          on conflict (recorrente_id, competencia) where recorrente_id is not null do nothing;
        end if;
        get diagnostics v_ok = row_count;
        v_n := v_n + v_ok;
      end if;
      v_mes := (v_mes + make_interval(months => v_passo))::date;
    end loop;
  end loop;
  return v_n;
end $$;
