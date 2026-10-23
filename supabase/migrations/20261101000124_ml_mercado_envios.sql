-- Mercado Envios como forma de transporte das vendas do Mercado Livre: a venda que sai pelo envio do Mercado Livre
-- (Coleta / agência, Flex, Full) entra no ERP com a transportadora "Mercado Envios" do cadastro. Assim aparece na
-- forma de envio da lista de vendas e no filtro. Envio por conta própria ("custom") não muda, e transportadora já
-- escolhida no pedido fica.

create or replace function public.ml_eh_mercado_envios(p_logistica text)
returns boolean language sql immutable as $$
  select coalesce(p_logistica, '') not in ('', 'custom', 'not_specified', 'default');
$$;

/** A transportadora "Mercado Envios" do cadastro (a de nome exato; sem ela, a primeira ativa com esse começo). */
create or replace function public.ml_transportadora_envios()
returns uuid language sql stable security definer set search_path = public as $$
  select id from transportadoras
   where ativo and nome ilike 'mercado envios%' and unificado_em is null
   order by (lower(btrim(nome)) = 'mercado envios') desc, created_at limit 1;
$$;

create or replace function public.trg_ml_pedido_transportadora()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_transp uuid;
begin
  if new.pedido_id is null or not public.ml_eh_mercado_envios(coalesce(new.logistica, new.envio_modo)) then return new; end if;
  v_transp := public.ml_transportadora_envios();
  if v_transp is null then return new; end if;
  update pedidos set transportadora_id = v_transp where id = new.pedido_id and transportadora_id is null;
  return new;
end $$;

create or replace trigger trg_ml_pedido_transportadora after insert or update of pedido_id, logistica, envio_modo on public.ml_pedidos
  for each row execute function public.trg_ml_pedido_transportadora();

-- (dados, aplicados à parte em 23/10) os serviços do Mercado Envios no cadastro somam coleta, flex, full e
-- envios_agora; as vendas do Mercado Livre que já estavam no ERP ficaram com a transportadora Mercado Envios.
