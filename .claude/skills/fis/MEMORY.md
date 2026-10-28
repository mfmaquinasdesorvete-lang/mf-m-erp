# MEMORY — FIS (ERP Line – Fiscal e contábil)
Atualizado em 28/10/2026 (Dossiê da empresa).

## Estado agora
A emissão da NF-e, o DIFAL, as certidões e a previsão de imposto por máquina estão no ar. O que falta depende
quase todo da usuária ou do contador: confirmar regras, tirar certidões, decidir as notas de valor menor e trazer as
guias e os parcelamentos que chegam na caixa do contador.

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
- NF-e do restante do pedido (entrega parcial) e cartão de vendas sem as transferências: no ar (e529b35, c289b2c).
  Falta o teste real: emitir a NF do restante de um pedido com entrega parcial; só então "feito" no checklist.

- Dossiê da empresa (pedido de 28/10 pelo ELO, histórico da MF SC desde a abertura): tela no Painel do contador
  (aba Dossiê; lib/dossie.ts; função dossie_empresa; unidades.aberta_em) e o pacote do contador agora pega a NF-e
  pelo mês de emissão do XML (notas_emitidas_no_mes). Montado, falta publicar e testar no ar. Depois: lista do que
  falta com o FAZ, importar o que chegar (TIN, GER, ENT).

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
- Dossiê da MF SC (para o FAZ cobrar; o que só ela busca):
  1. SEFAZ SC (com o certificado): XML das NF-e emitidas e das recebidas (destinadas) de 06/2022 a 07/2024.
  2. e-CAC: comprovantes de arrecadação (DARF/DAS) desde 06/2022; SEFAZ SC: DAE pagos desde 06/2022.
  3. Contador (atual e o antigo): recibos do SPED Fiscal, EFD-Contribuições, DCTF/DCTFWeb, ECD e ECF desde 2022,
     balanços e a folha de 06/2022 a 07/2024.
  4. Bancos: extratos OFX da Unicred depois de 04/2025 e antes de 01/2025, InfinitePay antes de 08/2024, OLIST antes
     de 04/2025, Sicoob (conta encerrada) do período em que existiu.
- Números da série 1 da SC sem nota no ERP (levantado pelo TIN em 28/10): 16 sem rastro e 10 só no Tiny sem XML
  (provável rejeição). Nenhuma inutilização registrada no ERP. Ela confere na SEFAZ SC (consulta de inutilizações)
  e no Tiny; o que não estiver inutilizado, inutilizar pelo ERP (Notas → Conformidade) com o ok dela e do contador.
  Ela acha que nenhum foi inutilizado. Sobram 16 sem rastro e as 10 do Tiny.
- Pedido 415 (máquina, marcado uso interno / My Frost, entregue, sem NF): ela diz para onde foi; ver se precisa de nota.
- NF 14 (venda) foi anulada pela NF 15 (entrada de ajuste, estorno): o cartão Vendas agora tira a saída estornada
  (montado, falta publicar).
- Guia do parcelamento do Simples (vence 30/10) chegou na caixa do contador: ela confere de qual empresa é e paga.

- Fim de ano do contador (calendário recebido pelo FUN em 28/10): o escritório para de 18/12 a 04/01. Datas que ele
  pede em dezembro: 10/12 ISS de novembro; 18/12 DARF INSS/IRRF (e do 13º), FGTS e ICMS; 23/12 PIS/COFINS/IPI
  (o DAS de 22/12 é das empresas do Simples, não da MF). Em dezembro, cobrar as guias da MF até 18/12.

## Decisões da usuária
- As listas de notas (emitidas e recebidas) abrem na semana atual.
- Tudo que não é da MF vai para o painel pessoal (CAR). A Soft Premium não é deste ERP: não buscar nada dela.
- Marcadores só se somam; avisos nas notas usam o marcador "Rever com o contador" e a observação interna.
- Imposto efetivo das peças para o simulador do MKT: 25% na loja e 27% no Mercado Livre (bruto, sem crédito);
  gravar nas Configurações → Formação de preço só com o ok dela.
- Contador novo desde 10/2026; o e-mail que ele usa é só para guias e impostos de todas as empresas e está ligado
  no ERP (Configurações → Caixa de e-mail → "Contador", só a Caixa de entrada). Não tem histórico antigo.
- Funcionários (RH) é o chat FUN; a folha fiscal (eSocial, INSS, FGTS, DCTFWeb) fica no FIS.

## Onde está
- Telas: src/components/contador/Certidoes.tsx, src/components/contador/Dossie.tsx, src/components/produtos/ImpostosVenda.tsx,
  src/components/fiscal/DifalPorEstado.tsx, src/components/nfe/NotasConsertoOS.tsx, src/pages/AnalistaFiscal.tsx.
- Regras: src/lib/certidoes.ts, src/lib/impostoMaquina.ts, src/lib/difal.ts, src/lib/consertoOS.ts.
- Cálculo da nota: supabase/functions/_shared/nfe-impostos.ts (itensVenda, regraAplicavel).
- Banco: certidoes, parcelamentos, regras_tributacao, notas_fiscais (marcadores, observacao_interna),
  difal_vendas_interestaduais().

## Próximos passos
1. Teste real da NF-e do restante (checklist) quando a usuária emitir.
2. Ler a caixa "Contador" do ERP (tabela emails) a cada pedido: guias da MF vão ao Painel do contador; das outras
   empresas, ao CAR (MYF para a My Frost antiga, SOR para as lojas; Soft Premium não se mexe).
3. Regra da entrada para conserto 1915/2915 quando o contador passar o cBenef.
4. Ajudar o MYF na parte técnica da auditoria da My Frost (anexos do Simples, ST, DIFAL).
