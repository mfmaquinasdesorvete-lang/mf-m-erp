# Virada do Tiny — plano (GER com o TIN, 27/10/2026)

A virada já aconteceu em **28/09/2026**: a usuária confirmou em 27/10 (com print do Tiny) que a equipe não usa mais o Tiny;
as últimas vendas lá (6, de 28/09) e a última NF estão no ERP. Desde então tudo é feito só no ERP.

**09/11/2026** (proposta) é o prazo para fechar o que ficou para trás (lista abaixo). A decisão que sobra para a usuária
é **quando cancelar a assinatura do Tiny**, depois do backup final (TIN) e da última importação.

## Como está hoje (levantado no banco em 27/10)
- Vendas: desde 28/09 nenhum pedido novo entrou pelo Tiny; os de outubro foram todos feitos no ERP. ✅
- Notas fiscais: em outubro o ERP autorizou poucas notas em produção e teve várias com erro. As notas das
  vendas de outubro precisam sair do ERP; entender se a equipe ainda emite no Tiny. ⚠️
- Recebimentos do Tiny: ~320 pedidos do Tiny entregues ou faturados (02/2025 a 09/2026) estão sem conta a receber
  no ERP. Sem isso, Cobrança, DRE e conciliação ficam furados. ❌ (TIN)
- Aprovações: a fila foi limpa em 26/10; hoje sobram poucas contas em revisão (não ~1.100). ✅
- Bancos: as 7 contas ativas têm saldo inicial, mas alguns extratos estão parados (um banco sem extrato desde 2025,
  outros parados em maio e setembro de 2026). ⚠️
- Formas de pagamento: as 16 estão com taxa 0% — o lucro e o líquido do cartão saem errados. ❌

## O que precisa estar pronto antes da virada
| # | O quê | Quem | Situação |
|---|---|---|---|
| 1 | Recebimentos dos pedidos do Tiny sem conta a receber: ela clica "Buscar recebimentos do Tiny" e "Atualizar cadastros do Tiny" (sem código novo); TIN confere o que sobrar | usuária + TIN | até 05/11 |
| 2 | Contas a pagar e a receber em aberto no Tiny conferidas com as do ERP (nada só no Tiny) | TIN + GER | a fazer |
| 3 | Taxas das formas de pagamento (cartão crédito/débito, Pix maquininha, boleto, marketplaces) | usuária informa, GER grava | a fazer |
| 4 | Extratos em dia em todos os bancos ativos (ou desativar a conta que não é mais usada) e saldo de hoje conferido | usuária + ENT | a fazer |
| 5 | NF-e: emitir as notas das vendas de outubro pelo ERP e zerar os erros de emissão | FIS + GER | a fazer |
| 6 | Estoque: contagem feita e lançada (o estoque foi zerado) | usuária + GER | esperando |
| 7 | O que a equipe ainda faz no Tiny | usuária | feito: nada desde 28/09 (confirmado em 27/10) |
| 8 | Teste do começo ao fim no ERP no ar: pedido → NF → conta a receber → recebimento → conciliação | GER | depois de 1–5 |
| 9 | Na virada: última rodada dos três botões e a equipe para de lançar no Tiny (o ERP só lê do Tiny, não há integração para desligar) | usuária + TIN | no dia |

## Última importação antes de cancelar o Tiny (TIN, 27/10)
- No dia, a usuária clica em Importar: "Buscar histórico do Tiny" a partir de 28/09 (pedidos, NF-e/NFS-e, propostas e
  OCs lançados no Tiny depois disso; não duplica, pelo ID do Tiny), "Buscar recebimentos do Tiny" (nunca foi rodado;
  as recebidas sem dono vão para a aba "Decidir", com o ENT) e "Atualizar cadastros do Tiny".
- Contas a pagar em aberto e pagas depois de 20/10 entram e as pagas esperam o ok dela em Aprovações.
- O TIN confere se as contagens batem com as do Tiny e faz o backup final; só então ela cancela a assinatura.
- Dá para adiantar o item 1 rodando "Buscar recebimentos do Tiny" já agora (precisa do login dela).

## Depois da virada
- Última importação do Tiny (o que entrou até o dia) e conferência dos totais do mês.
- Uma semana de acompanhamento: tudo o que a equipe pedir no Tiny vira pedido no ERP.
