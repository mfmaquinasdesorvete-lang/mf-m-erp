-- =====================================================================
-- Mercado Livre (fase A): depois da venda
--  * ml_pedidos ganha a situação do envio no Mercado Livre (status, substatus, modo, rastreio do ML) e o controle do
--    que o ERP manda para lá: a NF-e (XML) e o rastreio do envio por conta própria (ME1/personalizado);
--  * ml_registrar_envio: grava a situação do envio e reflete no ERP — enviado (data e rastreio no pedido, expedição
--    despachada) e entregue (pedido entregue, só com NF-e autorizada);
--  * ml_notas_pendentes / ml_marcar_nota: a fila das NF-e autorizadas que ainda não foram para o Mercado Livre (só quando
--    a conta está com "o ERP emite a nota"; enquanto o Tiny emitia, era ele quem mandava). Até 5 tentativas;
--  * ml_rastreios_pendentes / ml_marcar_rastreio: a fila dos envios por conta própria despachados na expedição com
--    código de rastreio que ainda não foram informados ao Mercado Livre. Até 5 tentativas;
--  * agendamento erp-mercadolivre-posvenda a cada 10 minutos, só com conta ativa e algo na fila.
-- Tudo só pela função mercadolivre (service role). Somente acréscimos.
-- =====================================================================

alter table public.ml_pedidos
  add column if not exists envio_status text,
  add column if not exists envio_substatus text,
  add column if not exists envio_modo text,
  add column if not exists rastreio_ml text,
  add column if not exists envio_atualizado_em timestamptz,
  add column if not exists nota_enviada_em timestamptz,
  add column if not exists nota_ml_id text,
  add column if not exists nota_erro text,
  add column if not exists nota_tentativas integer not null default 0,
  add column if not exists rastreio_enviado_em timestamptz,
  add column if not exists rastreio_erro text,
  add column if not exists rastreio_tentativas integer not null default 0;

comment on column public.ml_pedidos.envio_status is 'Situação do envio no Mercado Livre: pending, handling, ready_to_ship, shipped, delivered, not_delivered, cancelled';
comment on column public.ml_pedidos.envio_modo is 'Modo do envio: me2 (Mercado Envios), me1, custom (por conta própria) ou not_specified';
comment on column public.ml_pedidos.nota_enviada_em is 'Quando a NF-e (XML) foi anexada à venda no Mercado Livre';
comment on column public.ml_pedidos.rastreio_enviado_em is 'Quando o rastreio do envio por conta própria foi informado ao Mercado Livre';

-- ---------------------------------------------------------------------
-- Situação do envio
-- ---------------------------------------------------------------------
create or replace function public.ml_registrar_envio(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v ml_pedidos; v_status text := nullif(btrim(p ->> 'status'), ''); v_rastreio text := nullif(btrim(p ->> 'rastreio'), '');
begin
  select * into v from ml_pedidos where ml_order_id = (p ->> 'order_id')::bigint;
  if not found then return; end if;
  update ml_pedidos set
    envio_status = coalesce(v_status, envio_status),
    envio_substatus = nullif(btrim(p ->> 'substatus'), ''),
    envio_modo = coalesce(nullif(btrim(p ->> 'modo'), ''), envio_modo),
    rastreio_ml = coalesce(v_rastreio, rastreio_ml),
    envio_atualizado_em = now()
  where id = v.id;
  if v.pedido_id is null or v_status is null then return; end if;

  if v_status in ('shipped', 'delivered') then
    update pedidos set enviado_em = coalesce(enviado_em, current_date), codigo_rastreio = coalesce(codigo_rastreio, v_rastreio)
     where id = v.pedido_id;
    update expedicoes set status = 'despachado', despachado_em = coalesce(despachado_em, now()),
           codigo_rastreio = coalesce(codigo_rastreio, v_rastreio), updated_at = now()
     where pedido_id = v.pedido_id and status in ('separar', 'separando', 'conferido', 'embalado');
  end if;
  if v_status = 'delivered' and exists (select 1 from notas_fiscais where pedido_id = v.pedido_id and status = 'autorizada') then
    update pedidos set status = 'entregue' where id = v.pedido_id and status in ('aprovado', 'faturado');
    update expedicoes set status = 'entregue', entregue_em = coalesce(entregue_em, now()), updated_at = now()
     where pedido_id = v.pedido_id and status = 'despachado';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- NF-e para o Mercado Livre
-- ---------------------------------------------------------------------
create or replace function public.ml_notas_pendentes(p_limite integer default 20)
returns table (ml_pedido_id uuid, ml_order_id bigint, ml_pack_id bigint, chave text, xml_url text, xml text, unidade_codigo text)
language sql stable security definer set search_path = public as $$
  select distinct on (m.id) m.id, m.ml_order_id, m.ml_pack_id, n.chave, n.xml_url, x.xml, u.codigo
    from ml_pedidos m
    join ml_contas c on c.id = m.conta_id and c.emitir_nfe and c.status <> 'desligada'
    join notas_fiscais n on n.pedido_id = m.pedido_id and n.status = 'autorizada' and coalesce(n.ambiente, 'producao') <> 'homologacao'
    left join notas_fiscais_xml x on x.nota_id = n.id
    left join unidades u on u.id = n.unidade_id
   where m.nota_enviada_em is null and m.nota_tentativas < 5 and m.situacao <> 'cancelada'
     and coalesce(m.envio_status, '') <> 'cancelled'
   order by m.id, n.created_at desc
   limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

create or replace function public.ml_marcar_nota(p_ml_pedido uuid, p_ok boolean, p_ml_id text default null, p_erro text default null)
returns void language sql security definer set search_path = public as $$
  update ml_pedidos set
    nota_enviada_em = case when p_ok then now() else nota_enviada_em end,
    nota_ml_id = case when p_ok then coalesce(nullif(p_ml_id, ''), nota_ml_id) else nota_ml_id end,
    nota_erro = case when p_ok then null else left(p_erro, 500) end,
    nota_tentativas = case when p_ok then nota_tentativas else nota_tentativas + 1 end
  where id = p_ml_pedido;
$$;

-- ---------------------------------------------------------------------
-- Rastreio do envio por conta própria (ME1 / personalizado)
-- ---------------------------------------------------------------------
create or replace function public.ml_rastreios_pendentes(p_limite integer default 20)
returns table (ml_pedido_id uuid, ml_order_id bigint, shipment_id bigint, rastreio text)
language sql stable security definer set search_path = public as $$
  select m.id, m.ml_order_id, m.shipment_id, btrim(e.codigo_rastreio)
    from ml_pedidos m
    join ml_contas c on c.id = m.conta_id and c.status <> 'desligada'
    join expedicoes e on e.pedido_id = m.pedido_id and e.status in ('despachado', 'entregue') and nullif(btrim(e.codigo_rastreio), '') is not null
   where m.shipment_id is not null and m.envio_modo in ('me1', 'custom', 'not_specified')
     and m.rastreio_enviado_em is null and m.rastreio_tentativas < 5 and m.situacao <> 'cancelada'
     and coalesce(m.envio_status, '') not in ('shipped', 'delivered', 'cancelled')
   order by m.created_at
   limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

create or replace function public.ml_marcar_rastreio(p_ml_pedido uuid, p_ok boolean, p_erro text default null)
returns void language sql security definer set search_path = public as $$
  update ml_pedidos set
    rastreio_enviado_em = case when p_ok then now() else rastreio_enviado_em end,
    rastreio_erro = case when p_ok then null else left(p_erro, 500) end,
    rastreio_tentativas = case when p_ok then rastreio_tentativas else rastreio_tentativas + 1 end
  where id = p_ml_pedido;
$$;

-- tela: tentar de novo as que deram erro (vendas ou financeiro)
create or replace function public.ml_tentar_de_novo(p_ml_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_algum_papel(array['vendas', 'financeiro']) then raise exception 'acesso negado'; end if;
  update ml_pedidos set
    nota_tentativas = case when nota_enviada_em is null then 0 else nota_tentativas end, nota_erro = null,
    rastreio_tentativas = case when rastreio_enviado_em is null then 0 else rastreio_tentativas end, rastreio_erro = null
  where id = p_ml_pedido;
end $$;

revoke execute on function public.ml_registrar_envio(jsonb) from public, anon, authenticated;
revoke execute on function public.ml_notas_pendentes(integer) from public, anon, authenticated;
revoke execute on function public.ml_marcar_nota(uuid, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.ml_rastreios_pendentes(integer) from public, anon, authenticated;
revoke execute on function public.ml_marcar_rastreio(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.ml_registrar_envio(jsonb) to service_role;
grant execute on function public.ml_notas_pendentes(integer) to service_role;
grant execute on function public.ml_marcar_nota(uuid, boolean, text, text) to service_role;
grant execute on function public.ml_rastreios_pendentes(integer) to service_role;
grant execute on function public.ml_marcar_rastreio(uuid, boolean, text) to service_role;
revoke execute on function public.ml_tentar_de_novo(uuid) from public, anon;
grant execute on function public.ml_tentar_de_novo(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Agendamento: a cada 10 minutos, só com conta ativa e algo na fila
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'erp-mercadolivre-posvenda') then
    perform cron.schedule('erp-mercadolivre-posvenda', '*/10 * * * *', $c$ select public.chamar_funcao('mercadolivre', '{"acao":"pos_venda"}'::jsonb, 120000)
      where exists (select 1 from public.ml_contas where status = 'ativa')
        and (exists (select 1 from public.ml_notas_pendentes(1)) or exists (select 1 from public.ml_rastreios_pendentes(1))) $c$);
  end if;
end $$;
