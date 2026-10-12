# Consultas ao banco do ERP (somente leitura)

Use apenas `select`. Nunca `insert`, `update`, `delete`, `drop` ou funções que alterem dados.
Troque `:ini` e `:fim` pelas datas do período (aaaa-mm-dd, fim exclusivo).

## Unidades (regime e configuração fiscal)
```sql
select codigo, nome, uf, regime_tributario, fabrica, icms_aliquota_interna, pis_cofins_exclui_icms,
       transf_icms_cst, pis_aliquota, cofins_aliquota, difal_ativo
from unidades where ativo;
```

## Saídas: receita (só CFOP de venda) e impostos por mês e unidade
Notas importadas de outro sistema podem ter transferência (x15x) sem o vínculo `transferencia_id`, e remessas
(conserto, comodato, demonstração, industrialização: x9xx) não são faturamento. Por isso a receita filtra o CFOP.
```sql
with itens as (
  select n.id, u.codigo, to_char(n.created_at, 'YYYY-MM') as mes, i->>'cfop' as cfop,
         coalesce((i->>'valor_bruto')::numeric, 0) - coalesce((i->>'valor_desconto')::numeric, 0) as valor,
         coalesce((i->>'icms_valor')::numeric, 0) as icms, coalesce((i->>'ipi_valor')::numeric, 0) as ipi,
         coalesce((i->>'pis_valor')::numeric, 0) + coalesce((i->>'cofins_valor')::numeric, 0) as pis_cofins,
         coalesce((i->>'icms_valor_uf_destino')::numeric, 0) as difal
  from notas_fiscais n
  join unidades u on u.id = n.unidade_id
  cross join lateral jsonb_array_elements(coalesce(n.payload->'items', '[]')) i
  where n.status = 'autorizada' and coalesce(n.ambiente, '') <> 'homologacao' and n.excluida_em is null
    and n.transferencia_id is null and n.tipo_operacao = 'saida'
    and n.created_at >= :ini and n.created_at < :fim
)
select codigo, mes,
       count(distinct id) filter (where (cfop ~ '^[567]1' and cfop !~ '^[567]15') or cfop ~ '^[567]40') as notas_venda,
       sum(valor) filter (where (cfop ~ '^[567]1' and cfop !~ '^[567]15') or cfop ~ '^[567]40') as receita,
       sum(icms) filter (where cfop !~ '^[567]15') as icms, sum(ipi) as ipi, sum(pis_cofins) as pis_cofins, sum(difal) as difal,
       sum(valor) filter (where cfop ~ '^[567]15') as transferencias, sum(valor) filter (where cfop ~ '^[567]9') as remessas
from itens group by 1, 2 order by 2, 1;
```

## Saídas por CFOP
```sql
select i->>'cfop' as cfop, count(distinct n.id) as notas, sum((i->>'valor_bruto')::numeric) as valor
from notas_fiscais n cross join lateral jsonb_array_elements(coalesce(n.payload->'items', '[]')) i
where n.status = 'autorizada' and n.created_at >= :ini and n.created_at < :fim
group by 1 order by 3 desc;
```

## Entradas: compras, manifestação e XML
```sql
select to_char(data_emissao, 'YYYY-MM') as mes, count(*) as notas, sum(valor_total) as valor,
       count(*) filter (where xml is null) as sem_xml,
       count(*) filter (where manifestacao is null or manifestacao = 'ciencia') as sem_manifestacao_conclusiva
from nfe_recebidas
where excluida_em is null and data_emissao >= :ini and data_emissao < :fim
group by 1 order by 1;
```

## Créditos destacados nas compras (do XML)
```sql
select to_char(data_emissao, 'YYYY-MM') as mes,
       sum((regexp_match(xml, '<vICMS>([0-9.]+)</vICMS>'))[1]::numeric) as icms,
       sum((regexp_match(xml, '<vIPI>([0-9.]+)</vIPI>'))[1]::numeric) as ipi
from nfe_recebidas
where xml is not null and excluida_em is null and data_emissao >= :ini and data_emissao < :fim
group by 1 order by 1;
```
(`regexp_match` pega o primeiro valor encontrado; para precisão use o grupo ICMSTot.)

## Contas a pagar por categoria (despesas com crédito)
```sql
select coalesce(categoria, '(sem categoria)') as categoria, count(*) as contas, sum(coalesce(valor_pago, valor)) as total
from contas_pagar
where status <> 'cancelado' and coalesce(competencia, vencimento) >= :ini and coalesce(competencia, vencimento) < :fim
group by 1 order by 3 desc;
```

## Impostos pagos (categoria "impostos")
```sql
select descricao, vencimento, valor, status from contas_pagar
where lower(categoria) like '%imposto%' and vencimento >= :ini and vencimento < :fim order by vencimento;
```

## Produtos com problema fiscal
```sql
select descricao, tipo, ncm, ipi_aliquota from produtos
where ativo and (length(regexp_replace(coalesce(ncm, ''), '\D', '', 'g')) <> 8 or (tipo = 'maquina' and ipi_aliquota is null));
```

## Vendas sem NF-e (90 dias)
```sql
select p.numero, p.status, p.valor_total, p.created_at from pedidos p
where p.status in ('faturado', 'entregue') and p.created_at > now() - interval '90 days'
  and not exists (select 1 from notas_fiscais n where n.pedido_id = p.id and n.status = 'autorizada');
```
