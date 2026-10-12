# Checklist de auditoria fiscal

Para cada item: confira, classifique (**problema** = corrigir já; **alerta** = conferir; **ok**) e registre
o que fazer e quem faz. Itens marcados com (ERP) já são conferidos pela tela Analista fiscal / Compliance fiscal.

## Cadastro da empresa e das unidades
- [ ] CNPJ, IE e endereço de SC e SP corretos (ERP).
- [ ] Regime Lucro Real (CRT 3) nas duas unidades (ERP).
- [ ] "Excluir o ICMS da base do PIS/COFINS" ligado (Tema 69) (ERP).
- [ ] CST de transferência SC ↔ SP sem ICMS (41), salvo opção do contador pela LC 204/2023 (ERP).
- [ ] Alíquotas internas de ICMS (SC 17%, SP 18%) e tabela de DIFAL/FCP de todas as UFs preenchida.

## Produtos
- [ ] NCM com 8 dígitos e coerente com a TIPI (ERP).
- [ ] Máquinas fabricadas com alíquota de IPI (ERP).
- [ ] CEST quando houver substituição tributária; origem da mercadoria (0 nacional, 1/2 importado) correta.
- [ ] Produto importado com origem 1 ou 2 (ICMS interestadual de 4%).

## Clientes
- [ ] CPF/CNPJ válidos; contribuinte com IE; não contribuinte sem IE (ERP, Compliance).
- [ ] UF e endereço completos (a UF decide ICMS interestadual e DIFAL).

## Notas emitidas (saídas)
- [ ] Nenhuma NF-e com erro, denegada ou parada em contingência (ERP).
- [ ] Sem buracos na numeração (inutilizar os números pulados) (ERP).
- [ ] Toda venda entregue/faturada tem NF-e (ERP).
- [ ] CFOP coerente: 5101/6101 produção própria, 5102/6102 revenda, 5151/6151-5152/6152 transferência, 5949/6949 remessas.
- [ ] DIFAL só em venda a não contribuinte de outro estado (ERP mostra o total).
- [ ] Devolução de compra emitida com referência à nota original.
- [ ] Notas de assistência técnica (serviço) com NFS-e; peças aplicadas com NF-e quando houver venda de mercadoria.

## Notas recebidas (entradas)
- [ ] Manifestação conclusiva em até 180 dias (confirmação, desconhecimento ou não realizada) (ERP).
- [ ] XML completo de todas as compras (sem ele o crédito de ICMS/IPI não aparece) (ERP).
- [ ] Compras de insumo x uso e consumo bem separadas (uso e consumo não dá crédito de ICMS).
- [ ] Ativo imobilizado lançado como ativo (CIAP).
- [ ] Notas de fornecedor do Simples: crédito de ICMS só o informado no campo próprio.

## Financeiro
- [ ] Toda conta a pagar com categoria do plano (ERP).
- [ ] Despesas que dão crédito separadas: energia, aluguel PJ, frete, manutenção (ERP).
- [ ] Nada de DAS/Simples num CNPJ do Lucro Real (ERP).
- [ ] Impostos pagos conferidos com a apuração (DARF, guia de ICMS de SC e de SP, DIFAL/GNRE).
- [ ] Multas e juros por atraso de imposto (sinal de rotina a melhorar).

## Obrigações (com o contador)
- [ ] EFD ICMS/IPI e EFD-Contribuições entregues todo mês.
- [ ] DCTFWeb, EFD-Reinf e eSocial em dia.
- [ ] ECD e ECF anuais; LALUR/LACS com as exclusões (Lei do Bem, JCP, doações).
- [ ] Certidões negativas (federal, SC, SP, FGTS, trabalhista) válidas.

## Reforma tributária
- [ ] NF-e com os campos de IBS/CBS em 2026 (ERP).
- [ ] Classificação tributária (cClassTrib) por operação (ERP → Regras).
- [ ] Plano de preços e fornecedores para 2027 (CBS plena).
