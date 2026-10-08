-- =====================================================================
-- Fluxo de pedidos automatizado e margem de contribuição
--   * NF-e automática: pedido aprovado (no ERP, na loja ou pela proposta)
--     tem a nota emitida sozinha (agendamento nfe-processar ou na hora)
--   * expedição: separar → conferir → embalar → despachar → entregue,
--     criada sozinha na aprovação ou quando a NF-e é autorizada
--   * custos do meio de pagamento, para a margem de contribuição
-- =====================================================================

alter table public.configuracoes
  add column nfe_automatica boolean not null default false,
  add column expedicao_apos text not null default 'nfe' check (expedicao_apos in ('aprovacao', 'nfe')),
  add column custos_pagamento jsonb not null default
    '{"cartao_pct": 3.5, "boleto_fixo": 3.0, "pix_pct": 0, "transferencia_pct": 0, "dinheiro_pct": 0}'::jsonb;

create table public.expedicoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos(id) on delete cascade,
  unidade_id uuid references public.unidades(id),
  status text not null default 'separar'
    check (status in ('separar', 'separando', 'conferido', 'embalado', 'despachado', 'entregue', 'cancelada')),
  itens_conferidos jsonb not null default '[]'::jsonb,   -- ids dos itens conferidos
  volumes int,
  peso_kg numeric(10,3),
  transportadora_id uuid references public.transportadoras(id),
  codigo_rastreio text,
  responsavel text,
  observacoes text,
  separando_em timestamptz, conferido_em timestamptz, embalado_em timestamptz, despachado_em timestamptz, entregue_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.expedicoes (status);
alter table public.expedicoes enable row level security;
create policy "erp_select" on public.expedicoes for select to authenticated using (public.is_erp_user());
-- mudanças de etapa só pela função avancar_expedicao (confere a sequência e a NF-e)

-- Cria a expedição no momento configurado; pedido cancelado cancela a expedição
create or replace function public.trg_expedicao_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_apos text := (select expedicao_apos from configuracoes where id = 1);
begin
  if (new.status = 'aprovado' and old.status = 'orcamento' and v_apos = 'aprovacao')
     or (new.status = 'faturado' and old.status is distinct from 'faturado') then
    insert into expedicoes (pedido_id, unidade_id, volumes, peso_kg, transportadora_id)
    values (new.id, new.unidade_id, new.volumes, new.peso_total_kg, new.transportadora_id)
    on conflict (pedido_id) do update set status = 'separar' where expedicoes.status = 'cancelada';
  elsif new.status = 'cancelado' and old.status <> 'cancelado' then
    update expedicoes set status = 'cancelada', updated_at = now() where pedido_id = new.id and status not in ('despachado', 'entregue');
  elsif new.status = 'entregue' and old.status <> 'entregue' then
    update expedicoes set status = 'entregue', entregue_em = coalesce(entregue_em, now()), updated_at = now() where pedido_id = new.id;
  end if;
  return null;
end $$;
create trigger trg_expedicao_pedido after update of status on public.pedidos
  for each row execute function public.trg_expedicao_pedido();

-- Avança a expedição. Despachar exige NF-e autorizada (mercadoria não circula sem nota)
-- e grava transportadora/rastreio no pedido, o que dispara o aviso de envio ao cliente.
create or replace function public.avancar_expedicao(p_expedicao uuid, p_etapa text, p_dados jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v expedicoes; v_ordem text[] := array['separar', 'separando', 'conferido', 'embalado', 'despachado', 'entregue'];
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;
  select * into v from expedicoes where id = p_expedicao for update;
  if not found then raise exception 'expedição não encontrada'; end if;
  if v.status = 'cancelada' then raise exception 'expedição cancelada'; end if;
  if array_position(v_ordem, p_etapa) is null then raise exception 'etapa inválida'; end if;
  if array_position(v_ordem, p_etapa) < array_position(v_ordem, v.status) then raise exception 'a expedição já passou desta etapa'; end if;

  if p_etapa = 'conferido' and jsonb_array_length(coalesce(p_dados->'itens_conferidos', v.itens_conferidos)) <
     (select count(*) from pedido_itens where pedido_id = v.pedido_id) then
    raise exception 'confira todos os itens antes de concluir a conferência';
  end if;
  if p_etapa = 'embalado' and coalesce((p_dados->>'volumes')::int, v.volumes, 0) < 1 then
    raise exception 'informe a quantidade de volumes';
  end if;
  if p_etapa = 'despachado' then
    if not exists (select 1 from notas_fiscais where pedido_id = v.pedido_id and status = 'autorizada') then
      raise exception 'o pedido ainda não tem NF-e autorizada: emita a nota antes de despachar';
    end if;
  end if;

  update expedicoes set
    status = p_etapa,
    itens_conferidos = coalesce(p_dados->'itens_conferidos', itens_conferidos),
    volumes = coalesce((p_dados->>'volumes')::int, volumes),
    peso_kg = coalesce((p_dados->>'peso_kg')::numeric, peso_kg),
    transportadora_id = coalesce(nullif(p_dados->>'transportadora_id', '')::uuid, transportadora_id),
    codigo_rastreio = coalesce(nullif(trim(p_dados->>'codigo_rastreio'), ''), codigo_rastreio),
    responsavel = coalesce(nullif(trim(p_dados->>'responsavel'), ''), responsavel),
    observacoes = coalesce(nullif(trim(p_dados->>'observacoes'), ''), observacoes),
    separando_em = case when p_etapa = 'separando' then now() else separando_em end,
    conferido_em = case when p_etapa = 'conferido' then now() else conferido_em end,
    embalado_em = case when p_etapa = 'embalado' then now() else embalado_em end,
    despachado_em = case when p_etapa = 'despachado' then now() else despachado_em end,
    entregue_em = case when p_etapa = 'entregue' then now() else entregue_em end,
    updated_at = now()
  where id = p_expedicao
  returning * into v;

  if p_etapa = 'despachado' then
    update pedidos set transportadora_id = coalesce(v.transportadora_id, transportadora_id), codigo_rastreio = coalesce(v.codigo_rastreio, codigo_rastreio),
      volumes = coalesce(v.volumes, volumes), peso_total_kg = coalesce(v.peso_kg, peso_total_kg), enviado_em = coalesce(enviado_em, current_date)
    where id = v.pedido_id;
  elsif p_etapa = 'entregue' then
    update pedidos set status = 'entregue' where id = v.pedido_id and status in ('aprovado', 'faturado');
  end if;
end $$;
revoke execute on function public.avancar_expedicao(uuid, text, jsonb) from public, anon;
grant execute on function public.avancar_expedicao(uuid, text, jsonb) to authenticated;

-- pedidos que já estavam faturados entram na expedição
insert into public.expedicoes (pedido_id, unidade_id, volumes, peso_kg, transportadora_id, codigo_rastreio, status, despachado_em)
select id, unidade_id, volumes, peso_total_kg, transportadora_id, codigo_rastreio,
       case when codigo_rastreio is not null then 'despachado' else 'separar' end,
       case when codigo_rastreio is not null then coalesce(enviado_em::timestamptz, now()) end
  from public.pedidos where status = 'faturado'
on conflict (pedido_id) do nothing;
