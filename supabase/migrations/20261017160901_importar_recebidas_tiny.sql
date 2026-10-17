-- Recebimentos do Tiny (Importar → Tiny pela API → "Buscar recebimentos"): as contas a receber que já estão pagas no
-- Tiny entram no ERP como contas recebidas, ligadas à venda do Tiny citada no histórico ("Ref. ao pedido de venda nº 614")
-- e ao cliente dela. Assim a conciliação do extrato acha sozinha o Pix ou o depósito de cada uma (mesmo valor e data
-- próxima) e mostra em "Com sugestão" — inclusive o sinal e o saldo das máquinas, que não batem com o valor da venda.
-- Entram como histórico (vieram de outro sistema, id_externo "tiny:cr:<id>"), sem passar pelas Aprovações.
-- Não duplica: conta que já veio do Tiny (pela API, que grava só o id, ou pelo backup, "tiny:cr:<id>") só é baixada se
-- ainda estiver em aberto e sem extrato ligado; venda que já tem conta lançada no ERP (ex.: o Pix ligado à venda) fica
-- de fora. Sem a data do pagamento, vale a do vencimento (e a descrição avisa).

create or replace function public.importar_recebidas_tiny(p_itens jsonb, p_unidade uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb; v_ext text; v_ped pedidos; v_cli uuid; v_id uuid; v_valor numeric; v_pago numeric; v_venc date; v_data date; v_desc text;
  v_criadas int := 0; v_baixadas int := 0; v_existentes int := 0; v_na_venda int := 0; v_ignoradas int := 0;
  v_com_venda int := 0; v_sem_data int := 0; v_erros jsonb := '[]'::jsonb;
begin
  perform public.exigir_papel('financeiro');
  if p_unidade is null or not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) > 500 then raise exception 'lista inválida'; end if;

  for v in select * from jsonb_array_elements(p_itens) loop
    begin
      v_ext := nullif(btrim(v->>'id_externo'), '');
      v_valor := nullif(v->>'valor', '')::numeric;
      v_pago := coalesce(nullif(v->>'pago', '')::numeric, v_valor);
      v_venc := nullif(v->>'vencimento', '')::date;
      v_data := coalesce(nullif(v->>'pagamento', '')::date, v_venc);
      if v_ext is null or coalesce(v_pago, 0) <= 0 or v_data is null then v_ignoradas := v_ignoradas + 1; continue; end if;

      -- já veio do Tiny: só baixa a que ainda está em aberto e sem extrato ligado
      select id into v_id from contas_receber where id_externo in (v_ext, 'tiny:cr:' || v_ext) limit 1;
      if v_id is not null then
        update contas_receber set status = 'pago', data_pagamento = v_data, valor_pago = v_pago,
               motivo_alteracao = 'Paga no Tiny (importação dos recebimentos)'
         where id = v_id and status = 'aberto' and not exists (select 1 from extrato_lancamentos e where e.conta_receber_id = v_id);
        if found then v_baixadas := v_baixadas + 1; else v_existentes := v_existentes + 1; end if;
        continue;
      end if;

      v_ped := null;
      if nullif(v->>'pedido', '') is not null then
        select * into v_ped from pedidos where numero_externo = v->>'pedido' and origem = 'tiny' order by created_at desc limit 1;
      end if;
      v_cli := null;
      if v_ped.id is not null then
        v_com_venda := v_com_venda + 1;
        -- a venda já tem conta lançada no ERP (não veio desta importação): não conta duas vezes
        if exists (select 1 from contas_receber r where r.pedido_id = v_ped.id and r.status <> 'cancelado'
                    and (r.id_externo is null or r.id_externo not like 'tiny:cr:%')) then
          v_na_venda := v_na_venda + 1; continue;
        end if;
        v_cli := v_ped.cliente_id;
      end if;
      if v_cli is null and nullif(v->>'cliente_externo', '') is not null then
        select id into v_cli from clientes where id_externo = v->>'cliente_externo' limit 1;
      end if;
      if v_cli is null and nullif(btrim(v->>'nome'), '') is not null then
        select id into v_cli from clientes
         where lower(btrim(nome)) = lower(btrim(v->>'nome')) or lower(btrim(nome_fantasia)) = lower(btrim(v->>'nome')) limit 1;
      end if;
      if nullif(v->>'pagamento', '') is null then v_sem_data := v_sem_data + 1; end if;

      v_desc := left(coalesce(nullif(btrim(v->>'historico'), ''), 'Recebimento do Tiny')
                || case when nullif(btrim(v->>'numero_doc'), '') is not null then ' (doc. ' || btrim(v->>'numero_doc') || ')' else '' end
                || case when nullif(v->>'pagamento', '') is null then ' · pago no Tiny, data do vencimento' else '' end, 300);
      insert into contas_receber (id_externo, descricao, cliente_id, pedido_id, categoria, valor, vencimento, status, data_pagamento, valor_pago, unidade_id)
      values ('tiny:cr:' || v_ext, v_desc, v_cli, v_ped.id, 'vendas', greatest(coalesce(v_valor, v_pago), v_pago), coalesce(v_venc, v_data),
              'pago', v_data, v_pago, coalesce(v_ped.unidade_id, p_unidade));
      v_criadas := v_criadas + 1;
    exception when others then
      if jsonb_array_length(v_erros) < 20 then v_erros := v_erros || jsonb_build_array(jsonb_build_object('id', v_ext, 'erro', sqlerrm)); end if;
    end;
  end loop;

  return jsonb_build_object('criadas', v_criadas, 'baixadas', v_baixadas, 'ja_existiam', v_existentes, 'ja_na_venda', v_na_venda,
                            'com_venda', v_com_venda, 'sem_data', v_sem_data, 'ignoradas', v_ignoradas, 'erros', v_erros);
end $$;
revoke execute on function public.importar_recebidas_tiny(jsonb, uuid) from public, anon;
grant execute on function public.importar_recebidas_tiny(jsonb, uuid) to authenticated;
