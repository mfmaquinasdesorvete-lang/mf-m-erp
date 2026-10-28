# MEMORY — AUD (ERP Line – Auditor financeiro)
Atualizado em 27/10/2026.

## Estado agora
Fase 1 no ar desde 27/10 (site 19e62bf): 6 conferências novas + histórico da tratativa na Auditoria financeira.
Rodada de fechamento (CLAUDE.md, 27/10): a fase 2 só começa quando a usuária aprovar de novo.

## No ar
- Rodada diária do auditor (28/10, site 29b0daa): função `auditor-diario`, agendamento `erp-auditor-diario` às 07:03
  de Brasília, tabelas `auditor_rodadas`/`auditor_achados`, cartão "Rodada de hoje" e "Rodar agora" (financeiro).
  Teste real: 1ª rodada 10 achados, 2ª rodada 0 novos. O FAZ lê a última linha de `auditor_rodadas`.
- Conferências novas na Auditoria financeira → Exceções (site 19e62bf). Conferido nos dados de 27/10: 5 entradas
  ignoradas, 0 vendas sem recebimento, 89 contas pagas sem documento desde 01/10, 0 despesas fora do padrão, extrato
  com buraco em OLIST, Mercado Pago, Nubank, Unicred e Inter (antes de 19/10, quando a API começou).

## Em andamento
- Nada. Rodada diária no ar (ver "No ar").

## Esperando a usuária
- Abrir a Auditoria financeira e ver o cartão "Rodada de hoje" (pedido 9f211251 → "feito" depois disso).
- Abrir Auditoria financeira → Exceções e confirmar que as conferências novas aparecem; só então marcar "feito".
- Cadastrar a taxa contratada nas formas de pagamento de cartão (todas em 0%), ligadas à conta bancária; sem ela a
  conferência do cartão só mostra a taxa efetiva.
- Aprovar a fase 2 (chat do auditor) quando a rodada de fechamento acabar.
- Unicred (28/10): ela mandou 5 OFX (jun/2025 a 28/10/2026, conferidos e sem lacuna) e decidiu: GER conserta a
  importação (OFX sem lançamento + período do arquivo) e põe o saldo inicial em R$ 28,09 em 17/10/2026. Levado ao GER
  (pedido 7d212117). GER pôs no ar em 28/10 (fadea68) e o saldo inicial foi conferido. Falta ela importar os 5
  arquivos; depois conferir em extrato_importacoes se os meses sem movimento ficaram como período coberto. Ainda faltam extratos de 05/04 a 31/05/2025 e 2023–2024.

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
- 28/10: pediu (via ELO e confirmou no chat) o auditor rodando sozinho todo dia de manhã, sem IA e sem aviso
  externo; o resumo vai no aviso único do FAZ. A fila usa a tratativa: Novo (sem tratativa) → Em análise → Resolvido/Descartado.
- 27/10: aprovou o plano (fase 1 e depois fase 2). Data de corte 01/10/2026 (`CORTE_AUDITOR`): antes dela,
  falta de dado é "dado incompleto", um aviso só.
- Fases: 1 diagnóstico; 2 chat de leitura; 3 conferências e provas; 4 margens, tendências e projeções
  (marcadas como estimativa); 5 alertas periódicos e fila de revisão (sem aviso externo sem autorização).

## Onde está
- Conferências do AUD: `supabase/functions/_shared/auditor.ts` (a mesma conta na tela e na rodada diária;
  `src/lib/auditorFinanceiro.ts` só reexporta; testes em `__tests__/auditorFinanceiro.test.ts`), chamadas no fim
  de `calcularExcecoes` (`src/lib/auditoria.ts`). Tipos: venda_sem_recebimento, recebimento_sem_venda, taxa_cartao,
  despesa_fora_padrao, extrato_desatualizado, dado_incompleto. `sem_documento` e `parcelas_divergentes` respeitam o corte.
- Limites: grupo "Auditoria" em `supabase/functions/_shared/ajustes.ts` (`auditor_*`); a tabela `config_ajustes`
  ainda não existe no banco, então vale o padrão.
- Histórico da tratativa: `src/components/auditoria/HistoricoTratativa.tsx` (lê `auditoria` da tabela auditoria_excecoes).
- Telas: `src/pages/Auditoria.tsx`, `src/pages/Conciliacao.tsx`. Modelo do chat: `ia-busca`.

## Próximos passos
1. Depois que ela conferir a tela, marcar o pedido da fase 1 como feito.
2. Fase 2: função `ia-auditor` no padrão do `ia-busca`: a IA só escolhe a conferência e o período; a conta roda
   com o login de quem perguntou; resposta no formato fixo; registro em `ia_registros`; interruptor em `ia-controle`.
3. Fase 5: fila Novo → Em análise → Resolvido/Descartado e gravidade crítica/informativa (hoje: alta/média/baixa e
   indício/confirmado/resolvido/descartado).
