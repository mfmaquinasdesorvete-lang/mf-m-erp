-- "Cliente desde" da página do cliente (/cliente/<link>): olhava só a data do cadastro no ERP e o primeiro pedido, então
-- cliente antigo trazido do Tiny aparecia como "cliente desde" o dia da importação (ex.: máquina de 2022 e "cliente
-- desde 15/10/2026"). Agora vale a data mais antiga entre o cadastro, o primeiro pedido, a compra da máquina do
-- cadastro, a venda das máquinas dele, a primeira nota e a primeira proposta.
create or replace function public.cliente_desde(p_cliente uuid)
returns date language sql stable security definer set search_path = public as $$
  select least(
    (select created_at::date from clientes where id = p_cliente),
    (select compra_maquina_em from clientes where id = p_cliente),
    (select min(coalesce(pe.aprovado_em, pe.created_at))::date from pedidos pe where pe.cliente_id = p_cliente and pe.excluida_em is null),
    (select min(e.data_venda) from equipamentos e where e.cliente_id = p_cliente),
    (select min(n.created_at)::date from notas_fiscais n where n.cliente_id = p_cliente and n.status = 'autorizada' and n.excluida_em is null),
    (select min(p.data) from propostas_tiny p where p.cliente_id = p_cliente)
  )
$$;
revoke execute on function public.cliente_desde(uuid) from public, anon;

-- troca só a conta do "cliente_desde" dentro de area_cliente (o resto da função fica como está)
do $$
declare
  v text := pg_get_functiondef('public.area_cliente(uuid)'::regprocedure);
  antigo text := $a$'cliente_desde', least(c.created_at::date, (select min(coalesce(pe.aprovado_em, pe.created_at))::date from pedidos pe where pe.cliente_id = c.id and pe.excluida_em is null))$a$;
begin
  if position(antigo in v) = 0 then
    if position('public.cliente_desde(c.id)' in v) > 0 then return; end if;
    raise exception 'area_cliente mudou: conferir o cliente_desde à mão';
  end if;
  execute replace(v, antigo, $n$'cliente_desde', public.cliente_desde(c.id)$n$);
end $$;
