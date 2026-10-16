-- Portal do representante: os pedidos do histórico do Tiny (id_externo 'tiny:…') ficam fora das comissões previstas.
-- A importação do Tiny não lança comissão (a comissão desses pedidos foi acertada fora do ERP); sem este filtro o
-- portal mostrava como "prevista" a comissão de todo o histórico importado. As comissões lançadas continuam iguais.
-- Só troca a função (create or replace), com o mesmo retorno.
create or replace function public.portal_comissoes_linhas(p_vendedor uuid)
returns table(dia date, pedido_numero bigint, cliente text, descricao text, base numeric, percentual numeric, valor numeric, situacao text, pago_em date)
language sql stable security definer set search_path = public as $$
  with
  vend as (select * from public.vendedores where id = p_vendedor),
  peds as (
    select p.id, p.numero, p.status, p.valor_total, p.frete,
           (coalesce(p.aprovado_em, p.created_at) at time zone 'America/Sao_Paulo')::date aprovado,
           c.nome cliente,
           coalesce(p.comissao_percentual, public.comissao_percentual_pedido(p.id), vd.percentual) pct,
           case when vd.descontar_frete and coalesce(p.valor_total, 0) > 0
                then greatest(p.valor_total - coalesce(p.frete, 0), 0) / p.valor_total else 1 end fator,
           vd.base base_vendedor
      from public.pedidos p
      join vend vd on vd.id = p.vendedor_id
      left join public.clientes c on c.id = p.cliente_id
     where p.status in ('aprovado', 'faturado', 'entregue') and coalesce(p.valor_total, 0) > 0
       and coalesce(p.id_externo, '') not like 'tiny:%'
  ),
  lancadas as (
    select (c.created_at at time zone 'America/Sao_Paulo')::date dia, p.numero, cl.nome cliente, c.descricao,
           c.base, c.percentual, c.valor, case c.status when 'paga' then 'paga' else 'liberada' end situacao, c.pago_em
      from public.comissoes c
      left join public.pedidos p on p.id = c.pedido_id
      left join public.clientes cl on cl.id = p.cliente_id
     where c.vendedor_id = p_vendedor and c.status <> 'cancelada'
  ),
  prev_parcelas as (
    select r.vencimento dia, pd.numero, pd.cliente, coalesce(r.descricao, 'Parcela') descricao,
           round(r.valor * pd.fator, 2) base, round(pd.pct, 2) percentual,
           round(round(r.valor * pd.fator, 2) * pd.pct / 100, 2) valor
      from peds pd
      join public.contas_receber r on r.pedido_id = pd.id and r.status = 'aberto'
     where pd.base_vendedor = 'recebimento' and pd.pct > 0
       and not exists (select 1 from public.comissoes c where c.conta_receber_id = r.id and c.status <> 'cancelada')
  ),
  prev_pedidos as (
    select pd.aprovado dia, pd.numero, pd.cliente, 'Pedido #' || pd.numero descricao,
           round(pd.valor_total * pd.fator, 2) base, round(pd.pct, 2) percentual,
           round(round(pd.valor_total * pd.fator, 2) * pd.pct / 100, 2) valor
      from peds pd
     where pd.pct > 0
       and not exists (select 1 from public.comissoes c where c.pedido_id = pd.id and c.status <> 'cancelada')
       and (pd.base_vendedor = 'faturamento'
            or not exists (select 1 from public.contas_receber r where r.pedido_id = pd.id and r.status <> 'cancelado'))
  )
  select l.dia, l.numero, l.cliente, l.descricao, l.base, l.percentual, l.valor, l.situacao, l.pago_em from lancadas l
  union all
  select x.dia, x.numero, x.cliente, x.descricao, x.base, x.percentual, x.valor, 'prevista', null::date from prev_parcelas x
  union all
  select y.dia, y.numero, y.cliente, y.descricao, y.base, y.percentual, y.valor, 'prevista', null::date from prev_pedidos y;
$$;

revoke execute on function public.portal_comissoes_linhas(uuid) from public, anon, authenticated;
