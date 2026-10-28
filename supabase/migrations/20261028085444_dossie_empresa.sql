-- Dossiê da empresa (Painel do contador): quantos documentos de cada tipo o ERP tem em cada mês de uma unidade,
-- desde a abertura, para ver o que falta no histórico (fiscalização, contador, advogado, banco).
-- Só leitura e security invoker: cada tabela continua com a própria regra de acesso (financeiro e contador).
-- tipo: nfe_emitidas, nfe_recebidas, nfse, cte, guias, folha, obrigacoes, fechamento, extrato:<id da conta>.
-- completos: as que têm o arquivo (XML da NF-e) ou estão concluídas (obrigação feita, mês fechado).
create or replace function public.dossie_empresa(p_unidade uuid, p_desde date default null)
returns table (mes text, tipo text, qtd int, completos int)
language sql stable security invoker set search_path = public as $$
  with desde as (select date_trunc('month', coalesce(p_desde, '2000-01-01'::date))::date d)
  -- NF-e emitidas: data de emissão do XML; sem XML, a data em que a nota entrou no ERP
  select coalesce(substring(left(x.xml, 6000) from '<dhEmi>([0-9]{4}-[0-9]{2})'), to_char(n.created_at, 'YYYY-MM')) as mes,
         'nfe_emitidas', count(*)::int, count(x.nota_id)::int
    from notas_fiscais n left join notas_fiscais_xml x on x.nota_id = n.id
   where n.unidade_id = p_unidade and n.status in ('autorizada', 'cancelada') and n.excluida_em is null
     and coalesce(n.ambiente, 'producao') <> 'homologacao' and coalesce(n.tipo_operacao, 'saida') = 'saida'
   group by 1
  union all
  select to_char(r.data_emissao, 'YYYY-MM'), 'nfe_recebidas', count(*)::int, count(*) filter (where r.nfe_completa)::int
    from nfe_recebidas r where r.unidade_id = p_unidade and r.excluida_em is null and r.data_emissao >= (select d from desde)
   group by 1
  union all
  select m, 'nfse', count(*)::int, count(*)::int from (
    select to_char(coalesce(s.data_emissao, s.autorizada_em), 'YYYY-MM') m from nfse s
     where s.unidade_id = p_unidade and s.status = 'autorizada' and coalesce(s.ambiente, 'producao') <> 'homologacao'
    union all
    select to_char(i.data_emissao, 'YYYY-MM') from nfse_importadas i where i.unidade_id = p_unidade
  ) s where m is not null group by 1
  union all
  select to_char(c.emissao, 'YYYY-MM'), 'cte', count(*)::int, count(*)::int
    from ctes c where c.unidade_id = p_unidade and c.emissao is not null group by 1
  union all
  -- guias: contas de impostos (pela competência; completa = paga) e GNRE (completa = gerada)
  select m, 'guias', count(*)::int, count(*) filter (where pago)::int from (
    select to_char(coalesce(cp.competencia, cp.vencimento), 'YYYY-MM') m, cp.status = 'pago' pago
      from contas_pagar cp where cp.unidade_id = p_unidade and cp.categoria = 'impostos' and cp.status <> 'cancelado'
    union all
    select to_char(g.vencimento, 'YYYY-MM'), g.situacao = 'gerada' from gnre_guias g where g.unidade_id = p_unidade and g.situacao <> 'cancelada'
  ) g where m is not null group by 1
  union all
  select to_char(coalesce(cp.competencia, cp.vencimento), 'YYYY-MM'), 'folha', count(*)::int, count(*) filter (where cp.status = 'pago')::int
    from contas_pagar cp where cp.unidade_id = p_unidade and cp.categoria = 'folha' and cp.status <> 'cancelado' group by 1
  union all
  select left(o.competencia, 7), 'obrigacoes', count(*)::int, count(*) filter (where o.situacao <> 'pendente')::int
    from obrigacoes_cumpridas o where (o.unidade_id = p_unidade or o.unidade_id is null) and o.competencia ~ '^[0-9]{4}-[0-9]{2}$' group by 1
  union all
  select f.competencia, 'fechamento', 1, (f.status = 'fechado')::int
    from fechamentos f where f.unidade_id = p_unidade and f.competencia ~ '^[0-9]{4}-[0-9]{2}$'
  union all
  select to_char(l.data, 'YYYY-MM'), 'extrato:' || l.conta_bancaria_id, count(*)::int, count(*)::int
    from extrato_lancamentos l join contas_bancarias cb on cb.id = l.conta_bancaria_id
   where cb.unidade_id = p_unidade and l.data >= (select d from desde)
   group by 1, 2
$$;
revoke execute on function public.dossie_empresa(uuid, date) from public, anon;
grant execute on function public.dossie_empresa(uuid, date) to authenticated;
