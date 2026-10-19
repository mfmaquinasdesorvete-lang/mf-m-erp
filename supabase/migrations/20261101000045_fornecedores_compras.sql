-- O que a empresa compra de cada fornecedor, pelas notas recebidas: grupos pelo capítulo do NCM dos itens,
-- total comprado, nº de notas e a última compra. Usa as permissões de quem consulta (security invoker).
create or replace function public.fornecedores_compras()
returns table (fornecedor_id uuid, grupos text[], total numeric, notas bigint, ultima date)
language sql stable set search_path = public as $$
  with itens as (
    select r.fornecedor_id, i.valor_total,
      case left(regexp_replace(coalesce(i.ncm, ''), '\D', '', 'g'), 2)
        when '84' then 'Máquinas e peças' when '85' then 'Elétrica' when '73' then 'Parafusos e ferragens'
        when '72' then 'Aço e ferro' when '76' then 'Alumínio' when '74' then 'Cobre' when '39' then 'Plásticos'
        when '40' then 'Borracha e vedação' when '48' then 'Papel e embalagem' when '32' then 'Tintas'
        when '34' then 'Limpeza e lubrificantes' when '27' then 'Combustível' when '38' then 'Gases e químicos'
        when '29' then 'Gases e químicos' when '83' then 'Ferragens' when '82' then 'Ferramentas' when '90' then 'Instrumentos'
        when '94' then 'Móveis' when '44' then 'Madeira e MDF' when '70' then 'Vidro' when '68' then 'Pedra e cimento'
        when '87' then 'Veículos e peças' when '96' then 'Diversos' when '61' then 'Roupas e EPI' when '62' then 'Roupas e EPI'
        when '64' then 'Calçados e EPI' when '21' then 'Alimentos' when '19' then 'Alimentos' when '17' then 'Alimentos'
        when '04' then 'Alimentos' when '22' then 'Bebidas' when '' then null else 'Outros' end as grupo
    from nfe_recebidas r join nfe_recebida_itens i on i.nfe_id = r.id
    where r.fornecedor_id is not null and r.excluida_em is null
  ), g as (
    select fornecedor_id, grupo, sum(valor_total) v from itens where grupo is not null group by 1, 2
  ), top as (
    select fornecedor_id, (array_agg(grupo order by v desc))[1:2] grupos from g group by 1
  ), tot as (
    select fornecedor_id, sum(valor_total) total, count(*) notas, max(data_emissao)::date ultima
    from nfe_recebidas where fornecedor_id is not null and excluida_em is null group by 1
  )
  select tot.fornecedor_id, coalesce(top.grupos, '{}'), tot.total, tot.notas, tot.ultima
  from tot left join top using (fornecedor_id);
$$;
grant execute on function public.fornecedores_compras() to authenticated;
revoke execute on function public.fornecedores_compras() from anon, public;
