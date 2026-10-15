-- =====================================================================
-- Máquinas do cliente e garantia, para a OS (atendimento por vídeo chamada)
--  * configuracoes.taxa_diagnostico_video: o que se cobra pelo diagnóstico por vídeo chamada fora da garantia (R$ 150,00);
--  * maquinas_do_cliente(cliente): máquinas registradas (equipamentos), máquinas das NF-e de venda emitidas para o
--    cliente (lidas do XML; garantia contada da data da nota) e a data de compra do cadastro (no Tiny era o "Código").
--    Qualquer usuário do ERP vê (o técnico precisa); devolve só descrição, datas, número da nota e garantia.
-- Somente acréscimos.
-- =====================================================================

alter table public.configuracoes add column if not exists taxa_diagnostico_video numeric(12,2) not null default 150;
comment on column public.configuracoes.taxa_diagnostico_video is
  'Valor do diagnóstico por vídeo chamada de máquina fora da garantia (aparece na OS).';

create or replace function public.maquinas_do_cliente(p_cliente uuid)
returns table (fonte text, descricao text, quantidade numeric, data date, garantia_ate date, nota text, numero_serie text, equipamento_id uuid, origem text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_principal uuid; v_ids uuid[]; v_docs text[]; v_meses int;
begin
  if not public.is_erp_user() then raise exception 'sem permissão'; end if;
  select coalesce(c.unificado_em, c.id) into v_principal from clientes c where c.id = p_cliente;
  if v_principal is null then return; end if;
  -- o cadastro que ficou e os que foram unificados nele (o CPF/CNPJ deles fica guardado em dados_arquivados)
  select array_agg(c.id),
         array_agg(distinct d) filter (where length(d) in (11, 14))
    into v_ids, v_docs
    from clientes c
    cross join lateral (values (regexp_replace(coalesce(c.cpf_cnpj, c.dados_arquivados->>'cpf_cnpj', ''), '\D', '', 'g'))) x(d)
   where c.id = v_principal or c.unificado_em = v_principal;
  v_meses := coalesce((select garantia_meses_padrao from configuracoes limit 1), 12);

  return query
  with eq as (
    select e.descricao, e.data_venda, e.garantia_ate, e.numero_serie, e.id, e.origem
      from equipamentos e where e.cliente_id = any (v_ids)
  ),
  notas as (
    select n.numero, x.xml, substring(x.xml from '<dhEmi>(\d{4}-\d{2}-\d{2})')::date emissao
      from notas_fiscais n join notas_fiscais_xml x on x.nota_id = n.id
     where n.status = 'autorizada' and n.excluida_em is null
       and (n.cliente_id = any (v_ids) or regexp_replace(coalesce(n.destinatario_doc, ''), '\D', '', 'g') = any (coalesce(v_docs, '{}')))
       and coalesce(substring(x.xml from '<natOp>([^<]*)'), '') ~* 'venda'
  ),
  itens as (
    select nt.numero, nt.emissao,
           substring(d from '<cProd>([^<]*)</cProd>') cprod,
           btrim(regexp_replace(replace(substring(d from '<xProd>([^<]*)</xProd>'), '&amp;', '&'), '&#x?[0-9a-fA-F]+;|\s+', ' ', 'g')) xprod,
           nullif(substring(d from '<qCom>([0-9.]+)</qCom>'), '')::numeric qcom
      from notas nt cross join lateral regexp_split_to_table(nt.xml, '<det ') d
     where d ~ '^nItem='
  ),
  maquinas_nf as (
    select i.*, p.garantia_meses
      from itens i
      left join lateral (select pr.tipo, pr.garantia_meses from produtos pr where pr.sku = i.cprod and pr.unificado_em is null limit 1) p on true
     -- máquina: produto do tipo máquina, ou nome que começa por "My Frost"/"Máquina" e diz que é máquina de sorvete/açaí
     -- (peças como "Vedações My Frost Máquinas" ou "CLP Máquina de Sorvete" ficam de fora)
     where p.tipo = 'maquina'
        or (i.xprod ~* '^(my\s*frost|m[aá]quina)' and i.xprod ~* 'm[aá]quina\s+(de\s+)?(sorvete|a[cç]a[ií]|soft|expresso|milk|frozen|picol)')
  )
  select 'equipamento'::text, eq.descricao, 1::numeric, eq.data_venda, eq.garantia_ate, null::text, eq.numero_serie, eq.id, eq.origem
    from eq
  union all
  select 'nota', m.xprod, coalesce(m.qcom, 1), m.emissao,
         (m.emissao + make_interval(months => coalesce(nullif(m.garantia_meses, 0), v_meses)))::date,
         'NF-e ' || m.numero, null, null, null
    from maquinas_nf m
   where m.emissao is not null
     and not exists (select 1 from eq where eq.data_venda = m.emissao)
  union all
  select 'cadastro', 'Máquina (modelo não informado)', 1, c.compra_maquina_em,
         case when extract(day from c.compra_maquina_em) = 1
              then (date_trunc('month', c.compra_maquina_em) + make_interval(months => v_meses + 1) - interval '1 day')::date
              else (c.compra_maquina_em + make_interval(months => v_meses))::date end,
         null, null, null, null
    from clientes c
   where c.id = v_principal and c.compra_maquina_em is not null
     and not exists (select 1 from eq where to_char(eq.data_venda, 'YYYY-MM') = to_char(c.compra_maquina_em, 'YYYY-MM'))
     and not exists (select 1 from maquinas_nf m where to_char(m.emissao, 'YYYY-MM') = to_char(c.compra_maquina_em, 'YYYY-MM'))
  order by 4 desc nulls last;
end $$;
revoke execute on function public.maquinas_do_cliente(uuid) from public, anon;
grant execute on function public.maquinas_do_cliente(uuid) to authenticated;
