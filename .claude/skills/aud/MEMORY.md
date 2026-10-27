# MEMORY — AUD (ERP Line – Auditor financeiro)
Atualizado em 27/10/2026.

## Estado agora
Fase 1 (diagnóstico) entregue à usuária em 27/10. Esperando ela aprovar as conferências novas e o plano da fase 2.
Nada programado ainda.

## No ar
- Nada deste chat ainda. Já existe a Auditoria financeira (`src/lib/auditoria.ts`) e o Perguntar à IA (`ia-busca`).

## Em andamento
- Nada programado. Pedido em Sobre → Pedidos: "Auditor Financeiro IA – fase 1: diagnóstico".

## Esperando a usuária
- Aprovar (ou mudar) as conferências novas da fase 1 e o plano da fase 2.
- Taxas das formas de pagamento estão todas em 0%: sem elas não dá para conferir bruto × taxa × líquido (GER/Config).

## Diagnóstico (27/10) — o que achei nas fontes
- Vendas: `pedidos` (origem tiny, whatsapp, balcao, loja, marketplace). Boa parte dos pedidos entregues que vieram
  do Tiny não tem parcela em `contas_receber` (recebimentos do Tiny não importados): é integração ausente, não
  divergência. Só comparar venda × recebimento a partir da data em que o ERP passou a lançar as parcelas.
- PDV de balcão: `pdv_caixas` e `pdv_caixa_movimentos` existem, mas quase sem uso (sem movimentos).
- Contas: `contas_receber`, `contas_pagar` (com `revisao`, `decisao`, `contador_status`), anexos em `documentos`.
  Quase nenhuma conta paga tem documento, NF-e ou anexo: "paga sem comprovante" precisa de data de corte e valor
  mínimo, senão vira milhares de alertas.
- Extratos: `extrato_lancamentos` + `extrato_importacoes` por `contas_bancarias` (OLIST, InfinitePay SC e SP,
  Mercado Pago SP, Inter, Nubank, Unicred). Inter chega pela API; o resto por arquivo. Cobertura de datas
  diferente por conta (Unicred e Mercado Pago param no começo/meio do ano).
- Cartão: OLIST tem linhas de taxa separadas no extrato; InfinitePay e Mercado Pago não (vêm líquidas).
  `formas_pagamento.taxa_percentual`/`tarifa_fixa` estão em 0 → falta a taxa contratada para comparar.
  Mercado Livre: `ml_pedidos` tem total, tarifa e frete (quase sem pedidos ainda).
- DRE: `src/lib/dre*.ts`, `dreExtrato.ts`, `fechamentoMes.ts`; observações em `dre_observacoes`.
- Exceções e tratativas: `src/lib/auditoria.ts` (28 tipos) + `auditoria_excecoes` (situação indicio/confirmado/
  resolvido/descartado, sem histórico próprio da tratativa). Calculado no navegador.
- Permissões: contas e extratos só financeiro e contador (vendas lê `contas_receber`); `auditoria_excecoes`
  financeiro e contador. Uso de IA em `ia_registros`.

## Decisões da usuária
- 27/10: começar pela MF, onde os dados já estão; as sorveterias entram depois, com o SOR.
- 27/10: o auditor é um chat próprio (AUD), só leitura.
- Fases: 1 diagnóstico; 2 chat de leitura; 3 conferências e provas; 4 margens, tendências e projeções
  (marcadas como estimativa); 5 alertas periódicos e fila de revisão (sem aviso externo sem autorização).

## Onde está
- Telas: `src/pages/Auditoria.tsx`, `src/pages/Conciliacao.tsx`.
- Regras: `src/lib/auditoria.ts`.
- Funções do Supabase: `ia-busca` (modelo do chat).

## Próximos passos (depois da aprovação)
1. Conferências novas como funções puras em `src/lib/` com testes (centavos inteiros), cada uma devolvendo valor,
   quantidade, período e registros de origem; "integração ausente" separado de divergência.
2. Fase 2: função `ia-auditor` no padrão do `ia-busca`: a IA só escolhe a conferência e o período; a conta roda
   com o login de quem perguntou; resposta no formato fixo; registro em `ia_registros`; interruptor em `ia-controle`.
