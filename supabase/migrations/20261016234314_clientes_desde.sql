-- "Cliente desde" de verdade. Os cadastros foram trazidos para o ERP em outubro de 2026, então a data do cadastro
-- (created_at) é a da importação. Vale a data mais antiga com prova: compra da máquina, primeira venda (inclusive as
-- do Tiny), primeira NF-e emitida, proposta, nota ou compra da My Frost, máquina vendida, OS ou NFS-e; sem nada disso,
-- a data do cadastro. A vista respeita as permissões de quem consulta (security_invoker).
create or replace view public.clientes_desde with (security_invoker = true) as
select distinct on (x.cliente_id) x.cliente_id, x.desde, x.fonte
  from (
    select c.id as cliente_id, c.compra_maquina_em as desde, 'compra_maquina'::text as fonte, 1 as ordem from public.clientes c where c.compra_maquina_em is not null
    union all
    select p.cliente_id, min(p.created_at)::date, 'venda', 2 from public.pedidos p where p.cliente_id is not null and p.excluida_em is null group by p.cliente_id
    union all
    select n.cliente_id, min(n.created_at)::date, 'nfe', 3 from public.notas_fiscais n where n.cliente_id is not null and n.excluida_em is null group by n.cliente_id
    union all
    select t.cliente_id, min(t.data), 'proposta', 4 from public.propostas_tiny t where t.cliente_id is not null group by t.cliente_id
    union all
    select l.cliente_id, min(l.data), 'my_frost', 5 from public.notas_legado l where l.cliente_id is not null group by l.cliente_id
    union all
    select l.cliente_id, min(l.data), 'my_frost', 5 from public.compras_legado l where l.cliente_id is not null group by l.cliente_id
    union all
    select e.cliente_id, min(e.data_venda), 'maquina', 6 from public.equipamentos e where e.cliente_id is not null group by e.cliente_id
    union all
    select o.cliente_id, min(coalesce(o.data_entrada, o.created_at::date)), 'os', 7 from public.ordens_servico o where o.cliente_id is not null and o.excluida_em is null group by o.cliente_id
    union all
    select s.cliente_id, min(s.data_emissao)::date, 'nfse', 8 from public.nfse s where s.cliente_id is not null group by s.cliente_id
    union all
    select c.id, c.created_at::date, 'cadastro', 9 from public.clientes c
  ) x
 where x.desde between date '1990-01-01' and current_date
 order by x.cliente_id, x.desde, x.ordem;

revoke all on public.clientes_desde from anon;
grant select on public.clientes_desde to authenticated;
