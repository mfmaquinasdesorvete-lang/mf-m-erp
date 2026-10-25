-- =====================================================================
-- Compra à vista ou a prazo (pedido da usuária em 25/10): o preço de alguns itens (compressores) muda muito.
--  * nfe_recebidas.condicao_pagamento ('a_vista' | 'a_prazo') e prazo_dias: o que quem lança a nota escolhe.
--  * condicao_compra(nota): o que foi escolhido; senão o que o XML diz (parcelas com vencimento depois de 5 dias = a
--    prazo; Pix, dinheiro, débito ou depósito = à vista; cartão de crédito = cartão); senão "não informado".
--  * historico_custos passa a mostrar a condição no detalhe da compra ("NF 123 · Fornecedor · à vista").
-- Somente acréscimos.
-- =====================================================================
alter table public.nfe_recebidas add column if not exists condicao_pagamento text
  check (condicao_pagamento is null or condicao_pagamento in ('a_vista', 'a_prazo'));
alter table public.nfe_recebidas add column if not exists prazo_dias integer check (prazo_dias is null or prazo_dias >= 0);
comment on column public.nfe_recebidas.condicao_pagamento is 'À vista ou a prazo, escolhido na entrada da nota (vale mais que o XML)';

create or replace function public.condicao_compra(p_emissao timestamptz, p_xml text, p_condicao text, p_prazo integer)
returns text language sql immutable as $$
  select case
    when p_condicao = 'a_vista' then 'à vista'
    when p_condicao = 'a_prazo' then 'a prazo' || coalesce(' (' || p_prazo || ' dias)', '')
    else coalesce(
      (select 'a prazo (' || (max(m[1]::date) - p_emissao::date) || ' dias)'
         from regexp_matches(coalesce(p_xml, ''), '<dVenc>([0-9]{4}-[0-9]{2}-[0-9]{2})</dVenc>', 'g') m
       having max(m[1]::date) - p_emissao::date > 5),
      case
        when p_xml ~ '<tPag>(01|04|16|17)</tPag>' then 'à vista'
        when p_xml ~ '<tPag>03</tPag>' then 'cartão de crédito'
        else 'não informado'
      end)
  end
$$;

create or replace function public.historico_custos(p_produto uuid)
returns table (data timestamptz, evento text, detalhe text, quantidade numeric, valor_unitario numeric,
               preco_custo numeric, preco_venda numeric, saldo numeric, usuario text)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  v_ns text[] := array[array['n', 'http://www.portalfiscal.inf.br/nfe']];
  p produtos;
  v_codigos text[];
begin
  if not public.tem_algum_papel(array['financeiro', 'tecnico', 'compras']) then raise exception 'sem permissão'; end if;
  select * into p from produtos where id = p_produto;
  if p.id is null then return; end if;
  v_codigos := array(select distinct upper(regexp_replace(x, '\s', '', 'g'))
                       from unnest(array[p.sku, p.codigo_fabricante]
                                   || coalesce((select array_agg(codigo_fornecedor) from produto_fornecedor where produto_id = p.id), '{}')) x
                      where length(btrim(coalesce(x, ''))) >= 3);
  return query
  with ev as (
    select a.created_at as data, case when a.acao = 'insert' then 'cadastro' else 'alteracao' end as evento,
           nullif(btrim(coalesce(a.motivo, '')), '') as detalhe, null::numeric as quantidade, null::numeric as valor_unitario,
           case when a.acao = 'insert' or 'preco_custo' = any (a.campos) then nullif(a.depois->>'preco_custo', '')::numeric end as preco_custo,
           case when a.acao = 'insert' or 'preco_venda' = any (a.campos) then nullif(a.depois->>'preco_venda', '')::numeric end as preco_venda,
           a.usuario_nome as usuario
      from auditoria a
     where a.tabela = 'produtos' and a.registro_id = p_produto::text
       and (a.acao = 'insert' or 'preco_custo' = any (a.campos) or 'preco_venda' = any (a.campos))
  ), notas as (
    select n.id, n.data_emissao, n.emitente_nome, public.xml_ou_nulo(n.xml) as x,
           public.condicao_compra(n.data_emissao, n.xml::text, n.condicao_pagamento, n.prazo_dias) as condicao
      from nfe_recebidas n
     where public.tem_papel('financeiro', 'compras') and n.excluida_em is null and n.xml is not null
       and ((p.codigo_barras ~ '^\d{8,14}$' and n.xml like '%' || p.codigo_barras || '%')
            or exists (select 1 from unnest(v_codigos) c where n.xml ilike '%' || c || '%'))
  ), itens as (
    select nt.data_emissao, nt.emitente_nome, nt.condicao, coalesce((xpath('//n:ide/n:nNF/text()', nt.x, v_ns))[1]::text, '') as nnf,
           (xpath('/n:prod/n:cProd/text()', pr, v_ns))[1]::text as cprod, (xpath('/n:prod/n:cEAN/text()', pr, v_ns))[1]::text as cean,
           (xpath('/n:prod/n:qCom/text()', pr, v_ns))[1]::text as q, (xpath('/n:prod/n:vUnCom/text()', pr, v_ns))[1]::text as v
      from notas nt cross join lateral unnest(xpath('//n:det/n:prod', nt.x, v_ns)) pr
     where nt.x is not null
  ), compras as (
    select i.data_emissao as data, 'compra'::text as evento,
           'NF ' || i.nnf || ' · ' || coalesce(i.emitente_nome, '') || ' · ' || i.condicao as detalhe,
           case when i.q ~ '^\d+(\.\d+)?$' then i.q::numeric end as quantidade,
           case when i.v ~ '^\d+(\.\d+)?$' then round(i.v::numeric, 4) end as valor_unitario,
           null::numeric as preco_custo, null::numeric as preco_venda, null::text as usuario
      from itens i
     where (p.codigo_barras ~ '^\d{8,14}$' and i.cean = p.codigo_barras)
        or upper(regexp_replace(coalesce(i.cprod, ''), '\s', '', 'g')) = any (v_codigos)
  )
  select t.data, t.evento, t.detalhe, t.quantidade, t.valor_unitario, t.preco_custo, t.preco_venda,
         (select coalesce(sum(case m.tipo when 'saida' then -m.quantidade else m.quantidade end), 0)
            from estoque_movimentos m where m.produto_id = p_produto and m.created_at <= t.data) as saldo,
         t.usuario
    from (select * from ev union all select * from compras) t
   order by t.data desc
   limit 300;
end $function$;
