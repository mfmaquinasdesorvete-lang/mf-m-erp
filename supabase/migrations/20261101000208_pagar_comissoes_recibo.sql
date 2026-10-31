-- Comissões (pedido da usuária, 31/10): pagar as comissões de uma pessoa com um clique. Lança a conta no contas a
-- pagar (gerar_pagamento_comissoes, que entra aprovada sozinha quando passa nas validações) e, se já foi pago, dá a
-- baixa na conta de onde saiu, emite o recibo (MF paga, a pessoa recebe) e avisa a pessoa no sino. A pessoa vê os
-- recibos das comissões dela na tela de Comissões (meus_recibos_comissao).

create or replace function public.pagar_comissoes(p_ids uuid[], p_data date, p_conta_bancaria uuid, p_forma text, p_ja_pago boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conta uuid; v_cp contas_pagar; v_vend vendedores; v_u unidades; v_rec recibos; v_ref text; v_total numeric;
begin
  perform public.exigir_papel('financeiro');
  if p_data is null then raise exception 'informe a data'; end if;
  if p_ja_pago and p_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'pagamento já feito não pode ter data no futuro'; end if;
  v_conta := public.gerar_pagamento_comissoes(p_ids, p_data);
  select * into v_cp from contas_pagar where id = v_conta;
  v_total := v_cp.valor;
  select v.* into v_vend from vendedores v where v.id = (select vendedor_id from comissoes where conta_pagar_id = v_conta limit 1);
  if not p_ja_pago then
    return jsonb_build_object('conta_id', v_conta, 'total', v_total, 'situacao', 'agendada');
  end if;
  if coalesce(v_cp.revisao, 'historico') not in ('aprovado', 'historico') then
    return jsonb_build_object('conta_id', v_conta, 'total', v_total, 'situacao', 'aprovacao');
  end if;
  perform public.baixar_conta('contas_pagar', v_conta, p_data, v_total, p_conta_bancaria);

  select * into v_u from unidades where id = coalesce(v_cp.unidade_id, public.unidade_matriz());
  select 'Comissões de vendas: ' || string_agg('#' || p.numero, ', ' order by p.numero)
    into v_ref from (select distinct p.numero from comissoes c join pedidos p on p.id = c.pedido_id where c.conta_pagar_id = v_conta) p;
  insert into recibos (tipo, unidade_id, conta_pagar_id, pagador_nome, pagador_doc, recebedor_nome, recebedor_doc, valor, referente,
                       forma_pagamento, data_pagamento, cidade)
  values ('pagamento', v_u.id, v_conta, coalesce(v_u.razao_social, v_u.nome), v_u.cnpj, v_vend.nome, nullif(regexp_replace(coalesce(v_vend.cpf_cnpj, ''), '\D', '', 'g'), ''),
          v_total, left(coalesce(v_ref, 'Comissões de vendas'), 500), nullif(btrim(p_forma), ''), p_data,
          nullif(concat_ws('/', v_u.municipio, v_u.uf), ''))
  returning * into v_rec;

  if v_vend.user_id is not null then
    insert into notificacoes (tipo, titulo, texto, link, destinatarios, remetente_id, remetente_nome, urgencia)
    values ('pagamento', 'Comissão paga: ' || public.brl(v_total),
            'Recibo nº ' || v_rec.numero || ' · ' || coalesce(v_ref, '') || ' · pago em ' || to_char(p_data, 'DD/MM/YYYY'),
            '/comissoes', array[v_vend.user_id], auth.uid(), (select nome from usuarios_erp where user_id = auth.uid()), 'normal');
  end if;
  return jsonb_build_object('conta_id', v_conta, 'total', v_total, 'situacao', 'paga', 'recibo_id', v_rec.id, 'recibo_numero', v_rec.numero);
end $$;
revoke execute on function public.pagar_comissoes(uuid[], date, uuid, text, boolean) from public, anon;
grant execute on function public.pagar_comissoes(uuid[], date, uuid, text, boolean) to authenticated;

-- os recibos das comissões de quem está logado (o vendedor vê os dele no painel; recibo de funcionário é restrito)
create or replace function public.meus_recibos_comissao()
returns setof recibos language sql stable security definer set search_path = public as $$
  select r.* from recibos r
   where r.cancelado_em is null and r.conta_pagar_id in (
     select c.conta_pagar_id from comissoes c join vendedores v on v.id = c.vendedor_id
      where v.user_id = auth.uid() and c.conta_pagar_id is not null)
   order by r.data_pagamento desc, r.numero desc;
$$;
revoke execute on function public.meus_recibos_comissao() from public, anon;
grant execute on function public.meus_recibos_comissao() to authenticated;
