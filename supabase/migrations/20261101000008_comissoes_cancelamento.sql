-- =====================================================================
-- Comissão de venda cancelada (ou de recebimento estornado) sai mesmo quando já tinha ido para o contas a pagar:
-- a conta a pagar da comissão (ainda em aberto) perde o valor e, se não sobrar nada, é cancelada.
-- E comissão que volta do contas a pagar cancelado não reaparece se a venda já foi cancelada.
-- =====================================================================

create or replace function public.cancelar_comissoes(p_ids uuid[], p_motivo text default 'venda cancelada')
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_contas uuid[];
begin
  select array_agg(distinct conta_pagar_id) into v_contas from comissoes where id = any (p_ids) and status = 'a_pagar' and conta_pagar_id is not null;
  update comissoes set status = 'cancelada' where id = any (p_ids) and status = 'a_pagar';
  for r in
    select cp.id, coalesce(sum(c.valor) filter (where c.status = 'a_pagar'), 0) as restante
      from contas_pagar cp left join comissoes c on c.conta_pagar_id = cp.id
     where cp.id = any (coalesce(v_contas, '{}')) and cp.status = 'aberto'
     group by cp.id
  loop
    if r.restante <= 0 then
      update contas_pagar set status = 'cancelado', motivo_alteracao = 'Comissão cancelada: ' || p_motivo where id = r.id;
    else
      update contas_pagar set valor = r.restante, motivo_alteracao = 'Comissão cancelada: ' || p_motivo || ' (valor recalculado)' where id = r.id;
    end if;
  end loop;
  -- tira o vínculo das canceladas com a conta a pagar que não foi paga
  update comissoes set conta_pagar_id = null
   where id = any (p_ids) and status = 'cancelada' and conta_pagar_id in (select id from contas_pagar where status <> 'pago');
end $$;
revoke execute on function public.cancelar_comissoes(uuid[], text) from public, anon, authenticated;

-- Pedido cancelado: todas as comissões ainda não pagas
create or replace function public.trg_comissao_cancelamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    select array_agg(id) into v_ids from comissoes where pedido_id = new.id and status = 'a_pagar';
    if v_ids is not null then perform public.cancelar_comissoes(v_ids, 'pedido #' || new.numero || ' cancelado'); end if;
  end if;
  return new;
end $$;

-- Recebimento estornado: a comissão daquela parcela (comissão por recebimento)
create or replace function public.trg_comissao_recebimento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if new.pedido_id is null then return new; end if;
  if new.status = 'pago' and old.status is distinct from 'pago'
     and (select v.base from pedidos p join vendedores v on v.id = p.vendedor_id where p.id = new.pedido_id) = 'recebimento' then
    perform public.lancar_comissao(new.pedido_id, coalesce(new.valor_pago, new.valor), new.id, coalesce(new.descricao, 'Parcela'));
  elsif old.status = 'pago' and new.status <> 'pago' then
    select array_agg(id) into v_ids from comissoes where conta_receber_id = new.id and status = 'a_pagar';
    if v_ids is not null then perform public.cancelar_comissoes(v_ids, 'recebimento estornado'); end if;
  end if;
  return new;
end $$;

-- Conta a pagar da comissão cancelada: as comissões voltam para "a pagar", menos as de venda cancelada ou parcela não recebida
create or replace function public.trg_comissao_paga()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if new.status = 'pago' and old.status is distinct from 'pago' then
    update comissoes set status = 'paga', pago_em = coalesce(new.data_pagamento, current_date) where conta_pagar_id = new.id and status = 'a_pagar';
  elsif new.status = 'cancelado' and old.status <> 'cancelado' then
    update comissoes set conta_pagar_id = null where conta_pagar_id = new.id and status = 'a_pagar';
    select array_agg(c.id) into v_ids
      from comissoes c join pedidos p on p.id = c.pedido_id
      left join contas_receber r on r.id = c.conta_receber_id
     where c.status = 'a_pagar' and c.conta_pagar_id is null
       and (p.status = 'cancelado' or (c.conta_receber_id is not null and coalesce(r.status, 'cancelado') <> 'pago'));
    if v_ids is not null then update comissoes set status = 'cancelada' where id = any (v_ids); end if;
  end if;
  return new;
end $$;

-- Acerto: comissões "a pagar" de vendas que já estão canceladas
update public.comissoes c set status = 'cancelada'
  from public.pedidos p
 where p.id = c.pedido_id and c.status = 'a_pagar' and c.conta_pagar_id is null and p.status = 'cancelado';
