# MEMORY — AUD (ERP Line – Auditor financeiro)
Atualizado em 27/10/2026.

## Estado agora
Fase 1 programada (27/10): 6 conferências novas + histórico da tratativa, na Auditoria financeira. Falta publicar o site.
Depois: fase 2 (chat do auditor).

## No ar
- Nada deste chat ainda (fase 1 montada na `paineis-no-ar`, esperando "Pode publicar").

## Em andamento
- Pedidos em Sobre → Pedidos: "conferências novas da fase 1" (fazendo) e "fase 2: chat do auditor" (fila).

## Esperando a usuária
- "Pode publicar" do site com a fase 1.
- Taxas das formas de pagamento estão todas em 0%: sem elas a conferência do cartão só mostra a taxa efetiva
  (dado incompleto). Cadastrar em Configurações → Formas de pagamento (com a conta bancária ligada).

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
- 27/10: aprovou o plano (fase 1 e depois fase 2). Data de corte 01/10/2026 (`CORTE_AUDITOR`): antes dela,
  falta de dado é "dado incompleto", um aviso só.
- Fases: 1 diagnóstico; 2 chat de leitura; 3 conferências e provas; 4 margens, tendências e projeções
  (marcadas como estimativa); 5 alertas periódicos e fila de revisão (sem aviso externo sem autorização).

## Onde está
- Conferências novas: `src/lib/auditorFinanceiro.ts` (testes em `__tests__/auditorFinanceiro.test.ts`), chamadas no fim
  de `calcularExcecoes` (`src/lib/auditoria.ts`). Tipos: venda_sem_recebimento, recebimento_sem_venda, taxa_cartao,
  despesa_fora_padrao, extrato_desatualizado, dado_incompleto. `sem_documento` e `parcelas_divergentes` respeitam o corte.
- Limites: grupo "Auditoria" em `supabase/functions/_shared/ajustes.ts` (`auditor_*`); a tabela `config_ajustes`
  ainda não existe no banco, então vale o padrão.
- Histórico da tratativa: `src/components/auditoria/HistoricoTratativa.tsx` (lê `auditoria` da tabela auditoria_excecoes).
- Telas: `src/pages/Auditoria.tsx`, `src/pages/Conciliacao.tsx`. Modelo do chat: `ia-busca`.

## Próximos passos
1. Publicar a fase 1 (com "Pode publicar") e conferir os números na tela.
2. Fase 2: função `ia-auditor` no padrão do `ia-busca`: a IA só escolhe a conferência e o período; a conta roda
   com o login de quem perguntou; resposta no formato fixo; registro em `ia_registros`; interruptor em `ia-controle`.
3. Fase 5: fila Novo → Em análise → Resolvido/Descartado e gravidade crítica/informativa (hoje: alta/média/baixa e
   indício/confirmado/resolvido/descartado).
