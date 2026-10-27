# MEMORY — FIS (ERP Line – Fiscal e contábil)
Atualizado em 27/10/2026 (lista de risco).

## Estado agora
A emissão da NF-e, o DIFAL, as certidões e a previsão de imposto por máquina estão no ar. O que falta depende
quase todo da usuária ou do contador: confirmar regras, tirar certidões, decidir as notas de valor menor e trazer as
guias e os parcelamentos que estão no e-mail do contador.

## No ar
- Analista fiscal → DIFAL por estado (30d1de1; migração difal_por_estado).
- Ciclo do conserto na OS: nota de entrada e nota de volta pela aba Notas da OS (69f3522).
- Regras de tributação do retorno de conserto 5916/6916 (iguais a uma nota de retorno já autorizada).
- Painel do contador → Certidões, com validade e aviso antes de vencer (6000486; migração certidoes_mf).
- Impostos na venda de cada máquina: quadro no cadastro e Máquinas → Impostos (d9913d8).
- Cartão "Vendas" nas Notas emitidas: soma só a venda e mostra à parte as transferências SC↔SP e as remessas e
  devoluções a fornecedor (as devoluções emitidas são de compra, não abatem venda). Documentos → impostos.
- Marcador "Rever com o contador" nas notas de conserto antigas (5915/6915 para cliente), na nota de conserto
  emitida como venda e nas notas de pedidos do Tiny com valor menor que a venda.

## Em andamento
- Observações dos 2 parcelamentos da prefeitura de SC: o banco pediu confirmação e não gravou. Texto: pagamentos
  achados nos extratos, provável quitação, confirmar com a certidão municipal.
- Observação de uma nota que confere com o pedido (o problema é o outro pedido que foi junto sem nota): não gravou
  pelo mesmo motivo.

## Esperando a usuária
Lista em ordem de risco entregue em 27/10 (planilha "fiscal pendente em ordem de risco"):
1. Pedidos entregues sem nota: 9 de outubro (WhatsApp) e 5 do Tiny. Ela emite a NF-e pelo pedido.
2. Notas com valor menor que a venda: 5 conferidas e 6 do Tiny a conferir item a item (eu). Contador decide a
   NF complementar.
3. Parcelamento do Simples antigo: sem pagamento nos extratos depois de 10/2025. Ela confere no e-CAC.
4. Certidões: federal e estadual vencidas; municipal, FGTS e trabalhista a tirar e cadastrar.
5. Pedidos aprovados que vão sair: emitir a NF antes de despachar.
6. Contador: regras 5916/6916, cBenef 1915/2915, nota de conserto emitida como venda, notas antigas de conserto.
7. Parcelamentos da prefeitura: confirmar quitação com a certidão municipal.
8. XML do diesel em NF-e recebidas.
- Conectar o Gmail do contador da MF (anotado na SKILL).

## Decisões da usuária
- As listas de notas (emitidas e recebidas) abrem na semana atual.
- Tudo que não é da MF vai para o painel pessoal (CAR). A Soft Premium não é deste ERP: não buscar nada dela.
- Marcadores só se somam; avisos nas notas usam o marcador "Rever com o contador" e a observação interna.
- Funcionários (RH) é o chat FUN; a folha fiscal (eSocial, INSS, FGTS, DCTFWeb) fica no FIS.

## Onde está
- Telas: src/components/contador/Certidoes.tsx, src/components/produtos/ImpostosVenda.tsx,
  src/components/fiscal/DifalPorEstado.tsx, src/components/nfe/NotasConsertoOS.tsx, src/pages/AnalistaFiscal.tsx.
- Regras: src/lib/certidoes.ts, src/lib/impostoMaquina.ts, src/lib/difal.ts, src/lib/consertoOS.ts.
- Cálculo da nota: supabase/functions/_shared/nfe-impostos.ts (itensVenda, regraAplicavel).
- Banco: certidoes, parcelamentos, regras_tributacao, notas_fiscais (marcadores, observacao_interna),
  difal_vendas_interestaduais().

## Próximos passos
1. Gravar as duas observações pendentes quando o banco deixar.
2. Com o Gmail do contador: cadastrar os parcelamentos federais e conferir as guias da época do Simples.
3. Regra da entrada para conserto 1915/2915 quando o contador passar o cBenef.
4. Ajudar o MYF na parte técnica da auditoria da My Frost (anexos do Simples, ST, DIFAL).
