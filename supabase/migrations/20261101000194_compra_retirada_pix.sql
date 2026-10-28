-- Nota de compra (pedido da usuária, 28/10): compra que alguém da MF foi buscar (retirada no local, sem frete) e paga
-- no Pix na hora.
-- 1. "Retirada no local": a compra já chegou com quem foi buscar; não espera CT-e nem o botão "Chegou".
-- 2. "À vista no Pix (já pago)": dá baixa nas contas a pagar em aberto da nota, pagas no Pix na data da compra (sem
--    conta bancária: o extrato do banco liga o pagamento depois, na conciliação).

alter table public.nfe_recebidas add column if not exists retirada_local boolean not null default false;

create or replace function public.nfe_retirada_salvar(p_nfe uuid, p_sim boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_papel('financeiro', 'compras') then raise exception 'sem permissão'; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  update public.nfe_recebidas set retirada_local = coalesce(p_sim, false) where id = p_nfe and excluida_em is null;
  if not found then raise exception 'nota não encontrada'; end if;
  if p_sim then perform public.nfe_marcar_chegada(p_nfe, 'recebido', auth.uid()); end if;
end $$;
revoke execute on function public.nfe_retirada_salvar(uuid, boolean) from public, anon;
grant execute on function public.nfe_retirada_salvar(uuid, boolean) to authenticated;

create or replace function public.nfe_pago_no_pix(p_nfe uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n public.nfe_recebidas; c record; v_forma uuid; v_dia date; k int := 0; v_total numeric := 0;
begin
  perform public.exigir_papel('financeiro');
  select * into n from public.nfe_recebidas where id = p_nfe and excluida_em is null;
  if not found then raise exception 'nota não encontrada'; end if;
  select id into v_forma from public.formas_pagamento where ativo and nome ilike 'pix à vista' limit 1;
  if v_forma is null then select id into v_forma from public.formas_pagamento where ativo and nome ilike 'pix' limit 1; end if;
  v_dia := least(coalesce((n.data_emissao at time zone 'America/Sao_Paulo')::date, current_date), current_date);
  perform set_config('erp.acao_usuario', 'on', true);
  update public.nfe_recebidas set condicao_pagamento = 'a_vista', prazo_dias = null where id = p_nfe;
  for c in select id, valor from public.contas_pagar where nfe_recebida_id = p_nfe and status = 'aberto' order by vencimento loop
    if v_forma is not null then update public.contas_pagar set forma_pagamento_id = v_forma where id = c.id; end if;
    perform public.baixar_conta('contas_pagar', c.id, v_dia, c.valor, null);
    k := k + 1;
    v_total := v_total + c.valor;
  end loop;
  return jsonb_build_object('pagas', k, 'total', round(v_total, 2), 'dia', v_dia);
end $$;
revoke execute on function public.nfe_pago_no_pix(uuid) from public, anon;
grant execute on function public.nfe_pago_no_pix(uuid) to authenticated;

-- a tela da nota lê também a retirada e se as contas da nota já foram pagas no Pix
create or replace function public.nfe_condicao(p_nfe uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n public.nfe_recebidas; v_abertas int; v_abertas_valor numeric; v_pix boolean;
begin
  if not public.tem_papel('financeiro', 'compras') then raise exception 'sem permissão'; end if;
  select * into n from public.nfe_recebidas where id = p_nfe;
  if not found then return null; end if;
  select count(*) filter (where cp.status = 'aberto'), coalesce(sum(cp.valor) filter (where cp.status = 'aberto'), 0),
         count(*) filter (where cp.status = 'aberto') = 0 and count(*) filter (where cp.status = 'pago' and f.nome ilike 'pix%') > 0
    into v_abertas, v_abertas_valor, v_pix
    from public.contas_pagar cp left join public.formas_pagamento f on f.id = cp.forma_pagamento_id
   where cp.nfe_recebida_id = p_nfe;
  return jsonb_build_object(
    'condicao_pagamento', n.condicao_pagamento, 'prazo_dias', n.prazo_dias,
    'pelo_xml', public.condicao_compra(n.data_emissao, n.xml::text, null, null),
    'vale', public.condicao_compra(n.data_emissao, n.xml::text, n.condicao_pagamento, n.prazo_dias),
    'atualiza_custo', public.compra_atualiza_custo(p_nfe),
    'retirada_local', n.retirada_local, 'chegou_em', n.chegou_em,
    'contas_abertas', v_abertas, 'contas_abertas_valor', round(v_abertas_valor, 2), 'paga_pix', coalesce(v_pix, false));
end $$;
