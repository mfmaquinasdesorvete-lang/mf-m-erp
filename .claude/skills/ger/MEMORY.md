# MEMORY — GER (ERP Line – continuação (22/10))
Atualizado em 27/10/2026.

## Estado agora
Vendas, compras, financeiro, assistência e estoque funcionando no ar. O trabalho grande aberto é "menos dependente
do código" (levar regras e mensagens para Configurações), parado esperando a tabela nova no banco.

## No ar
- Máquinas: o selo "N clientes" do modelo abre a lista de quem tem a máquina, e o cliente abre a ficha (25/10).
- Acompanhamento de compras (Fábrica e estoque): peça pedida → OC → nota → transporte → chegou (973698c,
  função `acompanhamento_compras`).
- Compra só entra no estoque quando chega (CT-e entregue ou botão "Chegou") e pede conferência (migração 129).
- OC retroativa das notas de compra de peças, item sem cadastro e marcador "Comprado por valor divergente" (130).
- Excluir documento levando os ligados (OS ↔ pedido, envios, contas, OC ↔ notas), tudo ou nada (131).
- Boletos pagos no Inter casados com as contas a pagar; gastos de cartão agrupados por dia em Aprovações.
- "Agradecer pagamento" fica em Vendas (não em Cobrança). Painéis: só cobra de quem deve e ignora "não pagar".

## Em andamento
- PRIORIDADE (ELO, 27/10): plano da virada do Tiny em `.claude/skills/ger/virada-tiny.md` (data proposta 09/11; TIN importa os recebimentos dos pedidos do Tiny sem conta a receber). Rodada de fechamento: função nova só se ela pedir; "feito" só depois de testar no ar.
- Base comum de Configurações (pedido do ELO, a partir de `.claude/configuravel/README.md`):
  catálogo em `supabase/functions/_shared/ajustes.ts` (3 prazos e 12 mensagens de WhatsApp, padrão = texto de hoje)
  e migração `20261101000156_config_ajustes.sql`, já no repositório. Faltam: aplicar no banco, criar as páginas
  "Prazos e padrões" e "Mensagens ao cliente", ligar as telas, o teste ajustes.test.ts e a parte "como ligar um item
  novo" no README. Depois: e-mails automáticos, cobrança de 3 dias antes e 1 dia depois pela régua, nome fantasia no
  lugar do nome escrito à mão, etapas "dinheiro" e "prazos". Avisar o ELO quando a base estiver no ar (TRA e TEC
  entram depois).

## Esperando a usuária
- Publicar a função nfe-recebidas (guarda o XML da nota do fornecedor; commit 7a2ef1b) — pedido a8d2634a volta a "feito" depois do teste.
- Nota de peças sem OC (4 de 26/10): quer OC automática para as novas?
- Prestador (a0f29e4a, daa9722f): extrato completo da OLIST de setembro e confirmar os dois empréstimos (estão cancelados no ERP).
- Virada do Tiny: confirmar a data (proposta 09/11), passar as taxas das formas de pagamento e a lista do que a equipe ainda faz no Tiny.
- Rodar no SQL Editor a criação da tabela `config_ajustes` (o MCP pede confirmação e expira). Depois eu crio as funções.
- Apagar a tabela `tmp_oc_plano_2310` no SQL Editor (ela disse que vai apagar, 27/10).
- Fazer a contagem do estoque com o que existe (o estoque foi zerado).
- Pedidos aprovados sem pagamento e sem NF (três): cancelar ou esperar.
- Pagamentos de um prestador esperam a planilha do Tiny (TIN).

## Decisões da usuária
- "Produção" fica na área Fábrica e estoque, depois de Produtos e estoque; o quadro antigo de contas a pagar (KanbanPagar) foi apagado (REV, 27/10).
- Tela com período abre em "Esta semana" (27/10, pelo ELO): Gastos separados e Início também. Ficam como estão: Cartão (abre no cartão tocado), Conferir itens das notas (fila do ano), Garantias e Propostas do Tiny (sem período).
- Relatório de vendas para imprimir (botão "Relatório" em Vendas): vendas aprovadas, faturadas e entregues do período, cartões (faturamento, lucro, custo, ticket), gráfico por dia, por vendedor e a lista com total e lucro; lucro = total − frete − custo do cadastro, item sem custo marcado com * (27/10).
- Nota do fornecedor liga sozinha à OC (mesmo fornecedor e valor até 2%); lista de Compras mostra o passo da OC (26/10).
- Marcadores: juntar e excluir escondem o antigo (ativo = false), não apagam (migração 160). Juntados: Comprou Usada, Tiny, Técnicos My (26/10).
- Parcela de acordo de renegociação entra já aprovada (migração 159); 2ª revisão só acima de R$ 1.000 (Configurações, alçada) (26/10).
- Aprovações: o que é de antes da semana e já foi pago ou cancelado sai da fila (só conciliar); conta em aberto antiga fica na fila para ela olhar; cancelada não aparece na fila (26/10).
- Contas a pagar e a receber: lista com 4 cartões no topo (vencidas, hoje, esta semana, para decidir), lista em aberto/pagas/todas com o período, um botão (Nova conta) e o resto no "Mais"; saiu o quadro com colunas (26/10).
- Venda de máquina é "Proposta Comercial": PDF no layout da antiga do Tiny (foto, ficha técnica, preço de lista e desconto, assinatura do vendedor) (26/10).
- Custo do produto só pela compra à vista; a compra a prazo fica no histórico e não muda o custo (25/10).
- Pedido pago sem NF = retirado ou enviado por fora: vira "entregue" e sai da fila da NF-e.
- Pedido sem pagamento vindo do Tiny não aprovado não existiu.
- Compras: entrada no estoque só na entrega; Aprovações mostra boletos e Pix, e o cartão vai num quadro só por dia.
- O valor de hoje vira o padrão em Configurações: nada muda até ela editar.
- O nome padrão de um sócio foi unificado no banco pelo ELO; não escrever nomes no código.

## Onde está
- Telas: `src/pages/` (Pedidos, Producao, Financeiro, Assistencia, AcompanhamentoCompras), `src/components/compras/`,
  `src/components/config/`.
- Banco: pedidos, pedidos_compra, nfe_oc_vinculos, nfe_recebidas, ctes, contas_*, config_ajustes (a criar).
- Funções do Supabase: inter, nfe-recebidas-sync, infinitepay, proposta-enviar.

## Próximos passos
- Teste da rodada de fechamento (CNF, 27/10): 17 testados (14 passaram, 3 voltaram); faltam 122 "feito" sem teste. Daqui o site não abre (rede): testar pelo banco de produção e pelo código no site.zip.
0. Auditoria do REV de 27/10 (.claude/skills/rev/auditoria-2026-10-27.md): Auditoria financeira leve (colunas e período) e `select:` nas listas das telas do GER; depois `centavos()` única; /estoque × /produtos/pecas espera a usuária (com o PRD).
1. Com a tabela criada: funções `config_ajuste_salvar` e `cfg_num`, páginas de Configurações e as telas lendo o catálogo.
2. Pedir "Pode publicar", avisar o ELO, marcar "Feito" em `.claude/configuravel`.
3. E-mails automáticos e a cobrança fora da régua; depois dinheiro e prazos.
