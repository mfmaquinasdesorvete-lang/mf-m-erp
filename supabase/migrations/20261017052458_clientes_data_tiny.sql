-- Clientes novos pela data real, não pela importação. Os cadastros vieram do Tiny e das planilhas em outubro de 2026,
-- e o painel contava todos como "novos" (2.132 em 30 dias). Agora:
--   * clientes.cadastro_origem_em guarda a data de cadastro no Tiny (preenchida pela função tiny-importar, ação
--     "datas_contatos", e pela importação dos contatos);
--   * clientes_desde passa a considerar essa data (fonte "tiny") e marca como "importado" o cadastro que só tem a data
--     da importação (veio com o ID do Tiny ou junto com outros 5 ou mais no mesmo minuto) — esse não conta como novo.
-- Nada é apagado.

alter table public.clientes add column if not exists cadastro_origem_em date;
comment on column public.clientes.cadastro_origem_em is 'Data de cadastro do contato no sistema de origem (Tiny), quando veio de importação';

create or replace view public.clientes_desde with (security_invoker = true) as
select distinct on (x.cliente_id) x.cliente_id, x.desde, x.fonte
  from (
    select c.id as cliente_id, c.cadastro_origem_em as desde, 'tiny'::text as fonte, 0 as ordem from public.clientes c where c.cadastro_origem_em is not null
    union all
    select c.id, c.compra_maquina_em, 'compra_maquina', 1 from public.clientes c where c.compra_maquina_em is not null
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
    -- só a data em que entrou no ERP: cadastro feito aqui, ou importação (ID do Tiny ou lote no mesmo minuto)
    select c.id, c.created_at::date,
           case when c.id_externo is not null or count(*) over (partition by date_trunc('minute', c.created_at)) >= 5 then 'importado' else 'cadastro' end, 9
      from public.clientes c
  ) x
 where x.desde between date '1990-01-01' and current_date
 order by x.cliente_id, x.desde, x.ordem;

revoke all on public.clientes_desde from anon;
grant select on public.clientes_desde to authenticated;

/**
 * Grava a data de cadastro no Tiny dos contatos já importados ([{id_externo, data}]), sem mexer em mais nada.
 * Devolve {recebidos, gravados}. Financeiro (quem importa do Tiny).
 */
create or replace function public.datas_contatos_tiny(p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para importar cadastros'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 1000 then raise exception 'lista inválida'; end if;
  update clientes c set cadastro_origem_em = i.data
    from (select nullif(btrim(e->>'id_externo'), '') as id_externo, (e->>'data')::date as data from jsonb_array_elements(p_itens) e) i
   where i.id_externo is not null and i.data between date '1990-01-01' and current_date
     and c.id_externo = i.id_externo and c.cadastro_origem_em is distinct from i.data;
  get diagnostics v_n = row_count;
  return jsonb_build_object('recebidos', jsonb_array_length(p_itens), 'gravados', v_n);
end $$;
revoke execute on function public.datas_contatos_tiny(jsonb) from public, anon;
grant execute on function public.datas_contatos_tiny(jsonb) to authenticated;
