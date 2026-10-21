-- Rastreio automático ao cliente (pedido de 19/10): quando o envio (Fretes) ganha ou troca o código de rastreio, o
-- código vai para o pedido e o cliente recebe o e-mail "Seu pedido foi enviado" com o link para acompanhar.
-- Envio sem pedido (OS, remessa) avisa direto o cliente do envio. Só dispara na mudança: envios antigos não mandam nada.

create or replace function public.link_rastreio(p_transportadora uuid, p_codigo text)
returns text language sql stable set search_path = public as $$
  select case when nullif(btrim(t.rastreio_url), '') is null then null
              when t.rastreio_url like '%{codigo}%' then replace(replace(replace(t.rastreio_url, '{codigo}', p_codigo), '{nf}', ''), '{cnpj}', '')
              when t.rastreio_url like '%{nf}%' or t.rastreio_url like '%{cnpj}%' then null
              else t.rastreio_url end
    from transportadoras t where t.id = p_transportadora
$$;

create or replace function public.trg_aviso_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli text; transp text;
begin
  select nome into cli from public.clientes where id = new.cliente_id;
  if new.status = 'aprovado' and old.status = 'orcamento' then
    perform public.avisar_equipe('pedido_aprovado', 'aprovado:' || new.id,
      jsonb_build_object('numero', new.numero, 'cliente', cli, 'valor', new.valor_total, 'vendedor', new.vendedor, 'forma', new.forma_pagamento));
  end if;
  if coalesce(new.codigo_rastreio, '') <> '' and new.codigo_rastreio is distinct from old.codigo_rastreio then
    select nome into transp from public.transportadoras where id = new.transportadora_id;
    perform public.avisar_cliente('cli_pedido_enviado', new.cliente_id, 'enviado:' || new.id || ':' || new.codigo_rastreio,
      jsonb_build_object('numero', new.numero, 'transportadora', transp, 'rastreio', new.codigo_rastreio, 'volumes', new.volumes,
                         'link', public.link_rastreio(new.transportadora_id, new.codigo_rastreio)));
  end if;
  return null;
end $$;

create or replace function public.trg_envio_rastreio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_codigo text := nullif(btrim(new.codigo_rastreio), ''); transp text;
begin
  if v_codigo is null or (tg_op = 'UPDATE' and v_codigo is not distinct from nullif(btrim(old.codigo_rastreio), '')) then return null; end if;
  if new.pedido_id is not null then
    -- o gatilho do pedido manda o e-mail (uma vez por código)
    update public.pedidos
       set codigo_rastreio = v_codigo, transportadora_id = coalesce(transportadora_id, new.transportadora_id)
     where id = new.pedido_id and codigo_rastreio is distinct from v_codigo;
  elsif new.cliente_id is not null then
    select coalesce(nome, new.transportadora_nome) into transp from public.transportadoras where id = new.transportadora_id;
    perform public.avisar_cliente('cli_pedido_enviado', new.cliente_id, 'envio:' || new.id || ':' || v_codigo,
      jsonb_build_object('numero', new.numero, 'transportadora', coalesce(transp, new.transportadora_nome), 'rastreio', v_codigo,
                         'volumes', new.qtd_volumes, 'link', public.link_rastreio(new.transportadora_id, v_codigo)));
  end if;
  return null;
end $$;
create or replace trigger trg_envio_rastreio after insert or update of codigo_rastreio on public.envios
  for each row execute function public.trg_envio_rastreio();
