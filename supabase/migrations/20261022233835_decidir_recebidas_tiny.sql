-- Recebimentos do Tiny → aba "Decidir" (pedido de 22/10): os recebimentos que vieram do Tiny sem achar a venda nem o
-- cliente ficam numa lista para a pessoa decidir um por um: ligar ao cliente (e, se quiser, a uma venda dele) ou
-- descartar (fica cancelado, com o motivo, e sai da lista). Só mexe em conta que veio do Tiny ("tiny:cr:<id>") e
-- ainda está sem cliente; descartar não vale para a que já tem extrato ligado (a conciliação desfaz antes).

create or replace function public.decidir_recebida_tiny(p_id uuid, p_acao text, p_cliente uuid default null, p_pedido uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v contas_receber; v_ped pedidos; v_cli uuid;
begin
  perform public.exigir_papel('financeiro');
  select * into v from contas_receber where id = p_id for update;
  if v.id is null or coalesce(v.id_externo, '') not like 'tiny:cr:%' then raise exception 'recebimento do Tiny não encontrado'; end if;
  if v.cliente_id is not null then raise exception 'este recebimento já está ligado a um cliente'; end if;
  if v.status <> 'pago' then raise exception 'este recebimento já foi decidido'; end if;

  if p_acao = 'descartar' then
    if exists (select 1 from extrato_lancamentos e where e.conta_receber_id = v.id) then
      raise exception 'este recebimento já está ligado ao extrato: desfaça na conciliação antes de descartar';
    end if;
    update contas_receber set status = 'cancelado', motivo_alteracao = 'Descartado na importação do Tiny (aba Decidir)' where id = v.id;
    return jsonb_build_object('ok', true, 'acao', 'descartar');
  end if;

  if p_acao <> 'ligar' then raise exception 'ação inválida'; end if;
  if p_cliente is null then raise exception 'escolha o cliente'; end if;
  -- cliente unificado: vale o que ficou
  select coalesce(unificado_em, id) into v_cli from clientes where id = p_cliente;
  if v_cli is null then raise exception 'cliente não encontrado'; end if;
  if p_pedido is not null then
    select * into v_ped from pedidos where id = p_pedido;
    if v_ped.id is null then raise exception 'venda não encontrada'; end if;
    if v_ped.cliente_id is distinct from v_cli and v_ped.cliente_id is distinct from p_cliente then
      raise exception 'a venda escolhida é de outro cliente';
    end if;
  end if;
  update contas_receber set cliente_id = v_cli, pedido_id = coalesce(p_pedido, pedido_id),
         motivo_alteracao = 'Ligado ao cliente na importação do Tiny (aba Decidir)'
   where id = v.id;
  return jsonb_build_object('ok', true, 'acao', 'ligar');
end $$;
revoke execute on function public.decidir_recebida_tiny(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.decidir_recebida_tiny(uuid, text, uuid, uuid) to authenticated;
