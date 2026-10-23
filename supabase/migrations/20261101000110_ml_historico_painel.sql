-- Mercado Livre: histórico de tudo o que já foi vendido na conta (só para ver e medir, não vira pedido no ERP) e o
-- painel da primeira aba (pedidos de hoje, a enviar, faturamento, tarifas, tempos de despacho e entrega, mais vendidos).
-- A função mercadolivre (ação "historico" e a sincronização de 30 em 30 minutos) busca as vendas para trás, dos
-- pedidos recentes aos arquivados, e completa cada uma com as datas do envio.

create table if not exists public.ml_historico (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.ml_contas(id) on delete cascade,
  ml_order_id bigint not null unique,
  ml_pack_id bigint,
  data_venda timestamptz,
  status text,
  total numeric(14,2),
  pago numeric(14,2),
  tarifa numeric(14,2),
  comprador text,
  itens jsonb not null default '[]'::jsonb,
  qtd_itens integer not null default 0,
  pagamento_id bigint,
  pago_em timestamptz,
  shipment_id bigint,
  logistica text,
  envio_status text,
  envio_substatus text,
  pronto_em timestamptz,
  despachado_em timestamptz,
  entregue_em timestamptz,
  envio_buscado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ml_historico_data on public.ml_historico (data_venda desc);
create index if not exists ml_historico_envio on public.ml_historico (shipment_id) where shipment_id is not null;

alter table public.ml_historico enable row level security;
do $$ begin
  create policy ml_historico_select on public.ml_historico for select to authenticated
    using (public.tem_algum_papel(array['vendas', 'financeiro', 'marketplace']));
exception when duplicate_object then null; end $$;
grant select on public.ml_historico to authenticated;

-- até onde a busca para trás já chegou
alter table public.ml_contas
  add column if not exists historico_ate timestamptz,
  add column if not exists historico_fonte text not null default 'recentes',
  add column if not exists historico_completo boolean not null default false,
  add column if not exists historico_em timestamptz;

/** Painel do Mercado Livre: números do período (últimos p_dias; 0 = tudo) e o "agora" (hoje, a enviar, em trânsito). */
create or replace function public.ml_painel(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_desde timestamptz;
  v_antes timestamptz;
  v_mensal boolean := coalesce(p_dias, 0) = 0 or p_dias > 92;
  r jsonb;
begin
  if not public.tem_algum_papel(array['vendas', 'financeiro', 'marketplace']) then raise exception 'acesso negado'; end if;
  v_desde := case when coalesce(p_dias, 0) > 0 then (v_hoje - (p_dias - 1))::timestamp at time zone 'America/Sao_Paulo' else '-infinity'::timestamptz end;
  v_antes := case when coalesce(p_dias, 0) > 0 then v_desde - make_interval(days => p_dias) else null end;

  with v as (
    select h.*, (h.data_venda at time zone 'America/Sao_Paulo')::date as dia,
           coalesce(h.status, '') not in ('cancelled', 'invalid') as valida
    from public.ml_historico h
  ), per as (select * from v where data_venda >= v_desde)
  select jsonb_build_object(
    'agora', (select jsonb_build_object(
        'hoje', count(*) filter (where dia = v_hoje and valida),
        'hoje_valor', coalesce(sum(total) filter (where dia = v_hoje and valida), 0),
        'ontem', count(*) filter (where dia = v_hoje - 1 and valida),
        'sete_dias', count(*) filter (where dia > v_hoje - 7 and valida),
        'a_enviar', count(*) filter (where valida and envio_status in ('pending', 'handling', 'ready_to_ship')),
        'em_transito', count(*) filter (where valida and envio_status = 'shipped'),
        'ultima_venda', max(data_venda) filter (where valida)
      ) from v),
    'periodo', (select jsonb_build_object(
        'pedidos', count(*) filter (where valida),
        'cancelados', count(*) filter (where not valida),
        'faturamento', coalesce(sum(total) filter (where valida), 0),
        'tarifas', coalesce(sum(tarifa) filter (where valida), 0),
        'unidades', coalesce(sum(qtd_itens) filter (where valida), 0),
        'compradores', count(distinct comprador) filter (where valida)
      ) from per),
    'anterior', case when v_antes is null then null else (select jsonb_build_object(
        'pedidos', count(*) filter (where valida),
        'faturamento', coalesce(sum(total) filter (where valida), 0)
      ) from v where data_venda >= v_antes and data_venda < v_desde) end,
    'tempos', (select jsonb_build_object(
        'despacho_horas', round((avg(extract(epoch from despachado_em - coalesce(pago_em, data_venda))) filter (where despachado_em > coalesce(pago_em, data_venda)) / 3600)::numeric, 1),
        'despacho_n', count(*) filter (where despachado_em > coalesce(pago_em, data_venda)),
        'entrega_horas', round((avg(extract(epoch from entregue_em - despachado_em)) filter (where entregue_em > despachado_em) / 3600)::numeric, 1),
        'entrega_n', count(*) filter (where entregue_em > despachado_em),
        'total_horas', round((avg(extract(epoch from entregue_em - data_venda)) filter (where entregue_em > data_venda) / 3600)::numeric, 1)
      ) from per where valida),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object('chave', chave, 'pedidos', pedidos, 'faturamento', faturamento) order by chave), '[]'::jsonb)
      from (select case when v_mensal then to_char(dia, 'YYYY-MM') else to_char(dia, 'YYYY-MM-DD') end as chave,
                   count(*) as pedidos, coalesce(sum(total), 0) as faturamento
            from per where valida group by 1) s),
    'mais_vendidos', (select coalesce(jsonb_agg(x order by (x->>'unidades')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('titulo', i->>'titulo', 'unidades', sum(coalesce((i->>'quantidade')::numeric, 1)),
                                  'valor', sum(coalesce((i->>'quantidade')::numeric, 1) * coalesce((i->>'preco')::numeric, 0))) as x
        from per, jsonb_array_elements(per.itens) i where per.valida
        group by i->>'titulo' order by sum(coalesce((i->>'quantidade')::numeric, 1)) desc limit 8) t),
    'ultimas', (select coalesce(jsonb_agg(jsonb_build_object('order_id', ml_order_id, 'data', data_venda, 'status', status,
        'total', total, 'comprador', comprador, 'titulo', itens->0->>'titulo', 'itens', jsonb_array_length(itens),
        'envio', envio_status) order by data_venda desc), '[]'::jsonb)
      from (select * from v order by data_venda desc nulls last limit 12) u),
    'historico', (select jsonb_build_object('vendas', count(*), 'primeira', min(data_venda),
        'completo', (select bool_or(historico_completo) from public.ml_contas where status <> 'desligada'),
        'ate', (select min(historico_ate) from public.ml_contas where status <> 'desligada'),
        'atualizado_em', (select max(historico_em) from public.ml_contas where status <> 'desligada')) from v)
  ) into r;
  return r;
end $$;
grant execute on function public.ml_painel(integer) to authenticated;
