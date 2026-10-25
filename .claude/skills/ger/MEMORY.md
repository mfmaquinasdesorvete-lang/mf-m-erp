# MEMORY — GER (ERP Line – continuação (22/10))
Atualizado em 25/10/2026.

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
- Base comum de Configurações (pedido do ELO, a partir de `.claude/configuravel/README.md`):
  catálogo em `supabase/functions/_shared/ajustes.ts` (3 prazos e 12 mensagens de WhatsApp, padrão = texto de hoje)
  e migração `20261101000156_config_ajustes.sql`, já no repositório. Faltam: aplicar no banco, criar as páginas
  "Prazos e padrões" e "Mensagens ao cliente", ligar as telas, o teste ajustes.test.ts e a parte "como ligar um item
  novo" no README. Depois: e-mails automáticos, cobrança de 3 dias antes e 1 dia depois pela régua, nome fantasia no
  lugar do nome escrito à mão, etapas "dinheiro" e "prazos". Avisar o ELO quando a base estiver no ar (TRA e TEC
  entram depois).

## Esperando a usuária
- Rodar no SQL Editor a criação da tabela `config_ajustes` (o MCP pede confirmação e expira). Depois eu crio as funções.
- Apagar a tabela `tmp_oc_plano_2310` no SQL Editor.
- Fazer a contagem do estoque com o que existe (o estoque foi zerado).
- Pedidos aprovados sem pagamento e sem NF (três): cancelar ou esperar.
- Pagamentos de um prestador esperam a planilha do Tiny (TIN).

## Decisões da usuária
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
1. Com a tabela criada: funções `config_ajuste_salvar` e `cfg_num`, páginas de Configurações e as telas lendo o catálogo.
2. Pedir "Pode publicar", avisar o ELO, marcar "Feito" em `.claude/configuravel`.
3. E-mails automáticos e a cobrança fora da régua; depois dinheiro e prazos.
