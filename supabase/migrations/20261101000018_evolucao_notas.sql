-- =====================================================================
-- Evolução das notas: o que já aconteceu com cada NF depois da SEFAZ, numa consulta só, para os ícones
-- ao lado de cada nota e a linha do tempo dentro dela.
--   emitidas: e-mail da DANFE ao cliente, contas a receber (lançadas, pagas, vencidas), estoque, etiqueta,
--             expedição/envio, entrega, cartas de correção e devolução
--   recebidas: contas a pagar da nota (lançadas, pagas, vencidas)
-- As notas importadas do Tiny são histórico (as etapas ficaram no sistema anterior) e não entram.
-- =====================================================================
create or replace function public.evolucao_notas()
returns table (
  nota_id uuid,
  email_status text, email_em timestamptz, email_possivel boolean,
  contas_qtd int, contas_pagas int, contas_vencidas int, contas_aberto numeric, pago_em date,
  estoque boolean,
  etiqueta_em timestamptz, etiqueta_vezes int,
  exp_status text, separando_em timestamptz, embalado_em timestamptz, despachado_em timestamptz, exp_entregue_em timestamptz,
  envio_status text, coletado_em date, entrega_prevista date, envio_entregue_em date, rastreio text,
  pedido_status text, cce int, devolucao boolean
)
language sql stable security definer set search_path = public as $$
  select n.id,
         av.status, av.enviado_em,
         coalesce(cfg.avisos_email_ativo, false) and coalesce(c.avisos_email, true)
           and trim(coalesce(c.email, '')) ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$',
         coalesce(cr.qtd, 0)::int, coalesce(cr.pagas, 0)::int, coalesce(cr.vencidas, 0)::int, coalesce(cr.aberto, 0), cr.pago_em,
         coalesce(n.estoque_lancado, false) or coalesce(p.estoque_baixado, false),
         et.impressa_em, coalesce(et.impressoes, 0),
         ex.status, ex.separando_em, ex.embalado_em, ex.despachado_em, ex.entregue_em,
         ev.status, ev.coletado_em, ev.entrega_prevista, ev.entregue_em,
         coalesce(ev.codigo_rastreio, ex.codigo_rastreio, p.codigo_rastreio),
         p.status, coalesce(cc.qtd, 0)::int,
         exists (select 1 from notas_fiscais d where d.nota_referenciada_id = n.id and d.excluida_em is null
                    and d.status in ('autorizada', 'processando', 'contingencia'))
    from notas_fiscais n
    left join configuracoes cfg on cfg.id = 1
    left join pedidos p on p.id = n.pedido_id
    left join clientes c on c.id = coalesce(p.cliente_id, n.cliente_id)
    left join lateral (
      select a.status, a.enviado_em from avisos a
       where a.tipo = 'cli_nfe' and a.chave = 'nfe:' || n.id::text order by a.created_at desc limit 1) av on true
    left join lateral (
      select count(*) qtd,
             count(*) filter (where r.status = 'pago') pagas,
             count(*) filter (where r.status = 'aberto' and r.vencimento < current_date) vencidas,
             sum(case when r.status = 'aberto' then r.valor - coalesce(r.valor_pago, 0) else 0 end) aberto,
             max(r.data_pagamento) pago_em
        from contas_receber r
       where r.status <> 'cancelado'
         and ((n.pedido_id is not null and r.pedido_id = n.pedido_id) or r.nota_fiscal_id = n.id)) cr on true
    left join lateral (
      select e.impressa_em, e.impressoes from etiquetas_envio e
       where e.impressa_em is not null and (e.nota_fiscal_id = n.id or (n.pedido_id is not null and e.pedido_id = n.pedido_id))
       order by e.impressa_em desc limit 1) et on true
    left join expedicoes ex on ex.pedido_id = n.pedido_id
    left join lateral (
      select v.status, v.coletado_em, v.entrega_prevista, v.entregue_em, v.codigo_rastreio from envios v
       where n.pedido_id is not null and v.pedido_id = n.pedido_id and v.status <> 'cancelado'
       order by v.created_at desc limit 1) ev on true
    left join lateral (
      select count(*) qtd from nfe_cartas_correcao k where k.nota_id = n.id and k.status = 'autorizada') cc on true
   where public.is_erp_user() and n.excluida_em is null and coalesce(n.origem, 'erp') <> 'importada'
$$;

create or replace function public.evolucao_recebidas()
returns table (nota_id uuid, contas_qtd int, contas_pagas int, contas_vencidas int, contas_aberto numeric, pago_em date)
language sql stable security definer set search_path = public as $$
  select n.id, count(cp.id)::int,
         (count(cp.id) filter (where cp.status = 'pago'))::int,
         (count(cp.id) filter (where cp.status = 'aberto' and cp.vencimento < current_date))::int,
         coalesce(sum(case when cp.status = 'aberto' then cp.valor - coalesce(cp.valor_pago, 0) else 0 end), 0),
         max(cp.data_pagamento)
    from nfe_recebidas n
    join contas_pagar cp on (cp.nfe_recebida_id = n.id or cp.id = n.conta_pagar_id) and cp.status <> 'cancelado'
   where public.is_erp_user() and n.excluida_em is null
   group by n.id
$$;

revoke execute on function public.evolucao_notas() from public, anon;
revoke execute on function public.evolucao_recebidas() from public, anon;
grant execute on function public.evolucao_notas() to authenticated;
grant execute on function public.evolucao_recebidas() to authenticated;
