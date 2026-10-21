-- Pedido: "enviar código de rastreio por e-mail" (como no Tiny). O e-mail "Seu pedido foi enviado" já sai sozinho quando
-- o código entra; aqui é o reenvio pedido pela vendedora (nova chave a cada reenvio, para não ser barrado como repetido).
-- Devolve: 'enviado' | 'sem_codigo' | 'sem_email' (cliente sem e-mail, sem aceite de avisos ou avisos desligados).
create or replace function public.reenviar_rastreio(p_pedido uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_p pedidos; transp text; ok boolean;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into v_p from pedidos where id = p_pedido and excluida_em is null;
  if v_p.id is null then raise exception 'pedido não encontrado'; end if;
  if nullif(btrim(v_p.codigo_rastreio), '') is null then return 'sem_codigo'; end if;
  select nome into transp from transportadoras where id = v_p.transportadora_id;
  ok := public.avisar_cliente('cli_pedido_enviado', v_p.cliente_id,
    'enviado:' || v_p.id || ':' || btrim(v_p.codigo_rastreio) || ':reenvio:' || extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object('numero', v_p.numero, 'transportadora', transp, 'rastreio', btrim(v_p.codigo_rastreio), 'volumes', v_p.volumes,
                       'link', public.link_rastreio(v_p.transportadora_id, btrim(v_p.codigo_rastreio))));
  return case when ok then 'enviado' else 'sem_email' end;
end $$;
revoke execute on function public.reenviar_rastreio(uuid) from public, anon;
grant execute on function public.reenviar_rastreio(uuid) to authenticated;
