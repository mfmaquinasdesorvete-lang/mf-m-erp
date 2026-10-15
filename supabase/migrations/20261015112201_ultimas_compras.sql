-- =====================================================================
-- Ordem de compra → "ver últimas compras": o que já foi comprado do fornecedor (pedidos de compra e notas de
-- fornecedor, com os itens lidos do XML) e a busca de outros produtos pelas primeiras letras (todos os fornecedores).
-- Notas só para quem vê as notas de fornecedor (financeiro). Somente acréscimos: duas funções novas.
-- =====================================================================
create or replace function public.xml_ou_nulo(t text)
returns xml language plpgsql immutable set search_path = public as $$
begin
  return t::xml;
exception when others then
  return null;
end $$;

create or replace function public.ultimas_compras(p_fornecedor uuid default null, p_busca text default null, p_limite int default 300)
returns table (tipo text, numero text, ref_id uuid, data date, descricao text, quantidade numeric, unidade text, valor_unitario numeric,
               fornecedor text, produto_id uuid)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ns text[] := array[array['n', 'http://www.portalfiscal.inf.br/nfe']];
  v_b text := nullif(btrim(p_busca), '');
  v_notas boolean := public.tem_papel('financeiro');
begin
  if not public.tem_papel('financeiro', 'tecnico') then raise exception 'sem permissão'; end if;
  -- sem fornecedor, só com busca de 3 letras ou mais (senão seria a lista de tudo)
  if p_fornecedor is null and coalesce(length(v_b), 0) < 3 then return; end if;
  return query
  with oc as (
    select 'pedido'::text as tipo, pc.numero::text as numero, pc.id as ref_id, coalesce(pc.enviado_em, pc.created_at)::date as data,
           i.descricao::text as descricao, i.quantidade::numeric as quantidade, coalesce(nullif(p.unidade, ''), 'UN')::text as unidade,
           i.custo_unitario::numeric as valor_unitario, coalesce(f.nome_fantasia, f.nome)::text as fornecedor, i.produto_id as produto_id
      from pedido_compra_itens i
      join pedidos_compra pc on pc.id = i.pedido_compra_id
      left join produtos p on p.id = i.produto_id
      left join fornecedores f on f.id = pc.fornecedor_id
     where pc.excluida_em is null and pc.status <> 'cancelado'
       and (p_fornecedor is null or pc.fornecedor_id = p_fornecedor)
       and (v_b is null or i.descricao ilike v_b || '%' or i.descricao ilike '% ' || v_b || '%' or p.sku ilike v_b || '%')
  ), notas as (
    select n.id, n.data_emissao, n.fornecedor_id, n.emitente_nome, public.xml_ou_nulo(n.xml) as x
      from nfe_recebidas n
     where v_notas and n.excluida_em is null and n.xml is not null
       and (p_fornecedor is null or n.fornecedor_id = p_fornecedor)
       and n.data_emissao >= now() - interval '3 years'
       -- só abre o XML das notas que têm o texto procurado
       and (v_b is null or n.xml ilike '%' || v_b || '%')
  ), nf as (
    select 'nota'::text as tipo, coalesce((xpath('//n:ide/n:nNF/text()', nt.x, v_ns))[1]::text, '') as numero, nt.id as ref_id,
           nt.data_emissao::date as data, (xpath('/n:prod/n:xProd/text()', pr, v_ns))[1]::text as descricao,
           case when (xpath('/n:prod/n:qCom/text()', pr, v_ns))[1]::text ~ '^\d+(\.\d+)?$' then (xpath('/n:prod/n:qCom/text()', pr, v_ns))[1]::text::numeric end as quantidade,
           coalesce((xpath('/n:prod/n:uCom/text()', pr, v_ns))[1]::text, 'UN') as unidade,
           case when (xpath('/n:prod/n:vUnCom/text()', pr, v_ns))[1]::text ~ '^\d+(\.\d+)?$' then round((xpath('/n:prod/n:vUnCom/text()', pr, v_ns))[1]::text::numeric, 4) end as valor_unitario,
           coalesce(f.nome_fantasia, f.nome, nt.emitente_nome)::text as fornecedor, null::uuid as produto_id
      from notas nt
      left join fornecedores f on f.id = nt.fornecedor_id
      cross join lateral unnest(xpath('//n:det/n:prod', nt.x, v_ns)) pr
     where nt.x is not null
  )
  select * from (select * from oc union all
                 select * from nf where v_b is null or nf.descricao ilike v_b || '%' or nf.descricao ilike '% ' || v_b || '%') t
   order by t.data desc nulls last, t.numero desc
   limit greatest(1, least(coalesce(p_limite, 300), 1000));
end $$;
revoke execute on function public.xml_ou_nulo(text) from public, anon;
revoke execute on function public.ultimas_compras(uuid, text, int) from public, anon;
grant execute on function public.ultimas_compras(uuid, text, int) to authenticated;
