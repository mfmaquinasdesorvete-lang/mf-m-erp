# Regras de cálculo (estimativa gerencial)

As mesmas regras da tela Analista fiscal (`src/lib/analistaFiscal.ts`). Use-as para conferir e explicar.

## Saídas (débitos)
- Contam as NF-e **autorizadas**, de produção (não homologação), não excluídas, de saída, **sem transferência** entre
  SC e SP e **sem devolução de compra**.
- Impostos somados dos itens: ICMS, IPI, PIS, COFINS, DIFAL e FCP da UF do cliente, IBS e CBS.

## Entradas (créditos)
- Compra que dá crédito pelo CFOP do fornecedor: **x1xx** (venda de produção/revenda) e **x4xx** (com ST: só PIS/COFINS).
  Fora: x2xx (devoluções), x15x (transferências), x55x (ativo), x9xx (remessas e retornos).
- ICMS e IPI: o destacado no XML (grupo ICMSTot: vICMS, vIPI). Sem XML completo, não entra.
- PIS/COFINS: 9,25% sobre o valor dos itens elegíveis **menos o ICMS destacado** (Lei 14.592/2023).

## Despesas com crédito de PIS/COFINS
- Energia, aluguel (PJ), frete na venda, manutenção das máquinas: 9,25% do valor pago.

## Apuração do mês
- Saldo = débito − crédito. Negativo = saldo credor (passa para o mês seguinte).
- IRPJ estimado = 15% do lucro + 10% do que passar de R$ 20 mil no mês; CSLL = 9% do lucro (lucro do DRE do ERP, competência).

## Lucro Real x Presumido (12 meses)
- Real: PIS/COFINS = (receita − ICMS) × 9,25% − créditos; IRPJ = 15% + 10% acima de R$ 240 mil/ano; CSLL = 9% do lucro.
- Presumido: PIS/COFINS = (receita − ICMS) × 3,65%; base do IRPJ = 8% da receita (8,8% na parte acima de R$ 5 mi);
  base da CSLL = 12% (13,2% acima de R$ 5 mi); IRPJ = 15% + 10% da base acima de R$ 240 mil; CSLL = 9% da base.
- ICMS e IPI ficam fora (iguais nos dois).

## Exemplo conferido
Receita R$ 1.000.000, ICMS R$ 120.000, lucro R$ 100.000, créditos PIS/COFINS R$ 30.000:
- Real: PIS/COFINS 51.400 + IRPJ 15.000 + CSLL 9.000 = **R$ 75.400**
- Presumido: PIS/COFINS 32.120 + IRPJ 12.000 + CSLL 10.800 = **R$ 54.920**
(Neste exemplo o Presumido seria mais barato porque a margem de lucro de 10% é maior que a presunção e os créditos são poucos.)

## ICMS interestadual (Resolução do Senado 22/1989 e 13/2012)
- 4% importado (origem 1, 2, 3, 8); 7% de S/SE (exceto ES) para N, NE, CO e ES; 12% nos demais casos.
- Interno: SC 17%, SP 18% (conferir mudanças estaduais).
