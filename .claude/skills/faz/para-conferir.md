# Pronto para ela conferir (lista do CNF, 27/10)
Ela confere no ERP e marca "conferido" em Sobre → Pedidos (`conferido = true`); pode trocar itens. Em 27/10: 450
pedidos "feito", nenhum conferido. No resumo da manhã: mostrar 3 por dia e tirar os que ela já conferiu
(`select left(id::text,8), conferido from pedidos_checklist where left(id::text,8) in (...)`).

Dinheiro
1. 58104de6 · Cobrança só de quem deve (cancelado e sem NF de venda ficam fora) · Financeiro → Cobrança
2. c6e0c647 · Parcelas no cartão fora da cobrança do cliente · Financeiro → Cobrança
3. ce6f0636 · Quadro "Agradecer pagamento" separado de "Cobrar hoje" · Financeiro → Cobrança
4. b3f768db · Aprovações só com o desta semana · Financeiro → Aprovações
5. b5b051c4 · A pagar e Aprovações só com boletos e Pix; compras do cartão numa linha · Financeiro
6. 85de1da1 · Contas a pagar e a receber mais claras · Financeiro
7. 4bd8f164 · Raio-X previsto × realizado · Financeiro
8. 40a0cb83 · Etiqueta de pago / não pago nos cartões dos pedidos · Vendas

Compras e custo
9. 7f35a5e5 · Toda compra de peças com ordem de compra (valor divergente com marcador) · Compras
10. a8d2634a · Só a compra à vista muda o custo · Compras
11. bd07864a · Ordem de compra anda sozinha (pago, nota, despacho) · Compras

Nota fiscal
12. 95487ebf · NF-e não autoriza sozinha: tela "Conferir a NF-e" · Fiscal
13. 21bd5e57 · NF-e menor que o pedido só com motivo permitido · Fiscal
14. b369f5d6 · Emitir NF-e em lote · Fiscal
15. 0117350c · Pedidos pagos sem nota saem da fila da NF-e · Vendas/Fiscal
16. d15ad20d · Notas emitidas: transferências separadas das remessas · Fiscal
17. d606273b · Previsão de imposto de cada máquina no cadastro · Fiscal

Cliente
18. 2156fcf3 · Máquina vendida com NF-e entra sozinha na ficha do cliente, com o nº de série · Clientes
19. 398101b0 · Ficha 360: máquinas, compras, valores e nota (chave de 44) · Clientes
20. e9ded9b5 · Clientes com nome ou CPF/CNPJ iguais: unificar · Clientes
