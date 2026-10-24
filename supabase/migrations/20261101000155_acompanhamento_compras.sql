-- Acompanhamento de compras (pedido de 24/10): uma linha por peça pedida, com as etapas lado a lado:
-- ordem de compra ao fornecedor → nota emitida (ligada à OC) → transporte (CT-e ou nota "a caminho") → chegou.
-- Entram as OC em cotação e em aberto, e as recebidas ou canceladas nos últimos p_dias (para ver o que acabou de chegar).
-- O técnico (que compra peças) vê sem valores; financeiro e compras veem com valores.
create or replace function public.acompanhamento_compras(p_dias int default 30)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_precos boolean := public.tem_papel('financeiro', 'compras');
  v_desde date := current_date - greatest(coalesce(p_dias, 30), 0);
  v_r jsonb;
begin
  if not public.tem_papel('financeiro', 'compras', 'tecnico') then raise exception 'sem permissão'; end if;

  with ocs as (
    select pc.* from public.pedidos_compra pc
     where pc.excluida_em is null
       and (pc.status in ('cotacao', 'enviado', 'parcial')
            or (pc.status = 'recebido' and coalesce(pc.recebido_em::date, pc.created_at::date) >= v_desde)
            or (pc.status = 'cancelado' and pc.created_at::date >= v_desde))
  ), notas as (
    -- notas ligadas a cada OC, com o transporte (o CT-e mais novo que cita a nota)
    select l.pedido_compra_id, n.id, ltrim(substr(n.chave, 26, 9), '0') as numero, n.data_emissao, n.chegou_em, n.chegou_como,
           n.processamento, n.situacao, n.conferencia,
           t.ocorrencia, t.ocorrencia_em, t.prev_entrega, t.numero as cte_numero, tr.nome as cte_transportadora
      from public.nfe_oc_vinculos l
      join public.nfe_recebidas n on n.id = l.nfe_id and n.excluida_em is null
      left join lateral (
        select c.* from public.ctes c
         where c.nfe_recebida_id = n.id or n.chave = any(coalesce(c.nfe_chaves, '{}'))
         order by coalesce(c.ocorrencia_em, c.criado_em) desc nulls last limit 1
      ) t on true
      left join public.transportadoras tr on tr.id = t.transportadora_id
     where l.ativo and l.pedido_compra_id in (select id from ocs)
  ), soltas as (
    -- nota do mesmo fornecedor, emitida depois do pedido e ainda sem OC: provável nota desta compra, falta ligar
    select o.id as pedido_compra_id, count(*) as qtd
      from ocs o
      join public.fornecedores f on f.id = o.fornecedor_id
      join public.nfe_recebidas n on n.excluida_em is null and n.situacao <> 'cancelada'
        and coalesce(n.finalidade, 'normal') <> 'devolucao'
        and n.data_emissao >= coalesce(o.enviado_em, o.created_at) - interval '2 days'
        and (n.fornecedor_id = o.fornecedor_id
             or (coalesce(f.cnpj, '') <> '' and regexp_replace(coalesce(n.emitente_cnpj, ''), '\D', '', 'g') = regexp_replace(f.cnpj, '\D', '', 'g')))
     where o.status in ('enviado', 'parcial')
       and not exists (select 1 from public.nfe_oc_vinculos l where l.nfe_id = n.id and l.ativo)
     group by o.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'descricao', coalesce(nullif(i.descricao, ''), p.descricao), 'sku', p.sku, 'produto_id', i.produto_id,
           'quantidade', i.quantidade, 'recebida', coalesce(i.quantidade_recebida, 0),
           'valor', case when v_precos then i.quantidade * i.custo_unitario end,
           'oc_id', o.id, 'oc_numero', o.numero, 'oc_status', o.status, 'oc_data', coalesce(o.data, o.created_at::date),
           'enviado_em', o.enviado_em, 'recebido_em', o.recebido_em, 'previsao', o.previsao_entrega,
           'fornecedor', f.nome, 'unidade_id', o.unidade_id, 'op_numero', op.numero,
           'transportadora', tr.nome,
           'notas_soltas', coalesce(s.qtd, 0),
           'notas', coalesce((select jsonb_agg(jsonb_build_object(
                'id', n.id, 'numero', n.numero, 'emissao', n.data_emissao, 'chegou_em', n.chegou_em, 'chegou_como', n.chegou_como,
                'processamento', n.processamento, 'conferencia', n.conferencia,
                'ocorrencia', n.ocorrencia, 'ocorrencia_em', n.ocorrencia_em, 'prev_entrega', n.prev_entrega,
                'cte', n.cte_numero, 'cte_transportadora', n.cte_transportadora) order by n.data_emissao)
              from notas n where n.pedido_compra_id = o.id), '[]'::jsonb)
         ) order by coalesce(o.data, o.created_at::date) desc, o.numero desc, i.descricao), '[]'::jsonb)
    into v_r
    from ocs o
    join public.pedido_compra_itens i on i.pedido_compra_id = o.id
    left join public.produtos p on p.id = i.produto_id
    left join public.fornecedores f on f.id = o.fornecedor_id
    left join public.ordens_producao op on op.id = o.ordem_producao_id
    left join public.transportadoras tr on tr.id = o.transportadora_id
    left join soltas s on s.pedido_compra_id = o.id;
  return v_r;
end $$;

revoke all on function public.acompanhamento_compras(int) from public, anon;
grant execute on function public.acompanhamento_compras(int) to authenticated;
