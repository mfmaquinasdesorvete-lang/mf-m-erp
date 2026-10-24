-- Painel da My Frost (empresa anterior), a primeira aba da Retaguarda → My Frost (pedido da usuária, 24/10): os números
-- prontos numa chamada só — vendas, devoluções e remessas por ano (notas válidas), clientes, máquinas (e quantas estão
-- ligadas à proposta e à nota), negociado × valor na nota, modelos mais vendidos, propostas, fretes por transportadora e
-- protestos. Só a conta master (as tabelas por trás também são só dela).
create or replace function public.painel_my_frost()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_erp_master() then raise exception 'só a conta master vê o painel da My Frost'; end if;
  with n as (
    select extract(year from data)::int ano, valor, cliente_id,
           case when natureza ilike '%estorno%' then 'estorno' when natureza ilike '%devol%' then 'devolucao'
                when natureza ilike '%venda%' then 'venda' else 'remessa' end grupo
      from notas_legado where origem = 'My Frost' and situacao = 'autorizada' and tipo = 'saida'
  ), m as (
    select e.descricao, e.ligacao_venda, e.nota_legado_id, e.valor_negociado, nl.valor valor_nota
      from equipamentos e left join notas_legado nl on nl.id = e.nota_legado_id where e.origem = 'My Frost'
  ), f as (
    select transportadora, sum(valor) filter (where tipo = 'cte') cte, sum(valor) filter (where tipo = 'fatura') fatura, count(*) n
      from my_frost_fretes group by 1
  )
  select jsonb_build_object(
    'anos', (select coalesce(jsonb_agg(x order by x->>'ano'), '[]') from (
        select jsonb_build_object('ano', ano,
          'vendas', coalesce(sum(valor) filter (where grupo = 'venda'), 0), 'qtd_vendas', count(*) filter (where grupo = 'venda'),
          'devolucoes', coalesce(sum(valor) filter (where grupo = 'devolucao'), 0),
          'remessas', coalesce(sum(valor) filter (where grupo = 'remessa'), 0)) x
        from n where ano is not null group by ano) a),
    'clientes', (select count(distinct cliente_id) from n where grupo = 'venda'),
    'maquinas', (select count(*) from m),
    'maquinas_ligadas', (select count(*) from m where ligacao_venda is not null),
    'negociado', (select coalesce(sum(valor_negociado), 0) from m where nota_legado_id is not null and valor_negociado is not null),
    'na_nota', (select coalesce(sum(n2.valor), 0) from notas_legado n2 where n2.id in
                 (select nota_legado_id from m where nota_legado_id is not null and valor_negociado is not null)),
    'comparadas', (select count(*) from m where nota_legado_id is not null and valor_negociado is not null),
    'abaixo_80', (select count(*) from m where valor_negociado is not null and valor_nota is not null and valor_nota < valor_negociado * 0.8),
    'modelos', (select coalesce(jsonb_agg(x order by (x->>'qtd')::int desc), '[]') from (
        select jsonb_build_object('modelo', regexp_replace(descricao, '^My Frost\s+', '', 'i'), 'qtd', count(*)) x
          from m group by regexp_replace(descricao, '^My Frost\s+', '', 'i') order by count(*) desc limit 8) t),
    'propostas', (select count(*) from propostas_tiny where empresa = 'my_frost'),
    'propostas_total', (select coalesce(sum(total), 0) from propostas_tiny where empresa = 'my_frost'),
    'fretes', (select coalesce(jsonb_agg(jsonb_build_object('transportadora', transportadora, 'valor', coalesce(nullif(cte, 0), fatura, 0), 'n', n)
                 order by coalesce(nullif(cte, 0), fatura, 0) desc), '[]') from f),
    'protestos', (select jsonb_build_object('anuencias', count(*) filter (where tipo = 'anuencia'), 'quitacoes', count(*) filter (where tipo = 'quitacao'),
                 'avisos', count(*) filter (where tipo = 'aviso_cartorio'), 'urgentes', count(*) filter (where observacao ilike 'URGENTE%')) from my_frost_protestos)
  ) into r;
  return r;
end $$;
revoke all on function public.painel_my_frost() from public, anon;
grant execute on function public.painel_my_frost() to authenticated;
