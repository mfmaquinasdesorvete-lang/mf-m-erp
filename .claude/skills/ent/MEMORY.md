# MEMORY — ENT (ERP Line – Entradas nas contas da MF)
Atualizado em 28/10/2026.

## Estado agora
Auditoria a fundo das entradas feita em 23 e 24/10. Cerca de 300 entradas saíram de "pendente"
(transferências entre contas, empresa ligada e sócia, cashback, vendas ligadas). Ainda há cerca de 630
pendentes, quase todas sem venda, nota ou conta a receber no sistema que expliquem a entrada.

## No ar
- Data de abertura da conta (contas_bancarias.aberta_em / aberta_em_so_ano): no cartão e no cadastro
  (migração 20261101000191; publicado em 28/10, site 2581db4). Olist sem data: a usuária confirma.
- Link de pagamento (28/10, migração 20261101000192): o link do pedido dá baixa em todas as parcelas; sem taxa
  quando o cliente paga os juros; a conciliação automática liga o depósito do cartão do dia seguinte ao link pago
  (`conciliar_deposito_link`, cobrancas_link.extrato_lancamento_id). Teste real 29/10: depósito do pedido 621 ligou sozinho. Falta o do 630 e um link novo de várias parcelas.
- Banco Inter SC: saldo inicial corrigido; extrato, ERP e banco batem (26/10).
- Sem mudança de código nem de banco neste chat; só dados (conciliações) e esta skill (commit 5cc1dfd).
- Tela "Entradas acima de R$ 5 mil" (já existia): anotação na própria linha do extrato.

## Em andamento
- Entradas grandes sem dono: 11 sem venda nem nota; a usuária responde uma a uma.
- Pix pequenos sem dono na InfinitePay SC (3) e devoluções de Pix sem a saída achada.
- Depósitos de cartão (InfinitePay e Olist/Zoop) x vendas: sem o relatório de vendas por transação só se
  liga um a um, pela regra do dia útil seguinte e da taxa.

## Esperando a usuária
- Pedido de 28/10 (FIS coordena): extratos da MF SC desde a abertura (06/2022). Faltam Unicred 06/2022–12/2024,
  Sicoob inteiro, e saber quais bancos a MF usou em 2022–2023. Passo a passo enviado ao FAZ.
  Datas de abertura informadas em 28/10; a da Olist (12/2025) não bate com o extrato (desde 04/2025): ela confirma
  e confere o cartão da conta no ar (pedido em Sobre → Pedidos como "precisa de você").
- Mandar o extrato da InfinitePay SC de 29/10 em diante (depósito do pedido #630).
- Dizer o que foi cada entrada grande sem venda nem nota (licença, venda sem pedido, empréstimo, aporte).
- Fatura ou relatório de fretes do Olist Envios (item do frete descontado).
- Relatório de vendas da InfinitePay e da Olist por transação.
- Extratos que faltam: Unicred depois de 04/2025, Nubank SP depois de 09/2026, Mercado Pago SP depois de
  05/2026 (e dois meses de 2025 em PDF).
- Chaves da API do Inter SP, se a conta existir; envio diário do OFX da Olist para o e-mail do ERP.

## Decisões da usuária
- MF não é My Frost: licença de loja licenciada não é receita da MF (vai como recebido por conta de
  terceiros; a loja é ligada pelo chat SOR).
- Transferência entre contas da MF, da sócia ou da empresa ligada não é receita (painel Entre contas).
- Mudança em lote só depois de mostrar a lista e ela confirmar.
- A conta do Mercado Pago SP recebia vendas da SC em 2025.
- Cliente que paga Soft Premium pelo cartão da MF: é da Soft (Entre contas).
- Desconto dado ao cliente: ajustar a venda e ligar o valor recebido.
- Venda cancelada sem nota não é cobrança do cliente.
- Telas com período abrem no filtro "Esta semana" (ela troca quando quiser).
- Nome padrão da família no ERP: o que ela definiu (está no banco); não mudar o texto do extrato.

## Onde está
- Telas: `src/pages/EntradasGrandes.tsx`, `src/components/financeiro/ConciliacaoLote.tsx`,
  `src/pages/PartesRelacionadas.tsx`, `src/pages/Conciliacao.tsx`.
- Banco: `extrato_lancamentos` (status, conta_receber_id, par_transferencia_id, observacao),
  `contas_receber`, `pedidos`, `notas_fiscais`, `notas_legado`, `partes_relacionadas`, `licenciados_*`.
- Funções do banco: `vincular_lancamento`, `conciliar_lancamento`, `receber_venda_do_extrato`,
  `marcar_transferencia`, `ignorar_lancamento`, `anotar_lancamento`.
- Funções do Supabase: `inter` (extrato e saldo do Inter SC), e-mail com OFX (`_shared/extrato-email.ts`).

## Próximos passos
1. Quando chegarem extratos novos: conferir duplicados pelo identificador e ligar as entradas às vendas.
2. Ligar as entradas grandes conforme ela for respondendo.
3. Com o relatório de vendas do cartão, fechar os depósitos da InfinitePay e da Olist.
