# MEMORY — CNF (ERP Line – Conferência dos pedidos)
Atualizado em 27/10/2026.

## Estado agora
Rodada de fechamento (desde 27/10): "feito" só vale depois de teste com tarefa real, descrito no detalhe.
Em 27/10 havia 450 "feito", só 12 com o teste descrito e nenhum conferido pela usuária. Cobrei os 19 chats donos
dos 438 sem teste, cada um com a lista de ids dele. Ainda espero as respostas.
A lista curta de 20 para ela conferir primeiro (dinheiro, nota, cliente) foi para o FAZ.
Todos os 22 chats têm MEMORY.md (conferido em 27/10).

## No ar
- Painel "Conferência dos pedidos" (artifact): números no alto, um cartão por chat, a lista do que foi cobrado e as
  respostas. É atualizado no mesmo link a cada rodada.
- Rodada: ler `pedidos_checklist`, `chats_claude` e `publicacoes` (só select), fazer `git fetch` da `paineis-no-ar` e
  da `site`, conferir cada commit de `versao` com `git merge-base --is-ancestor` e cobrar o chat dono com send_message.

## Em andamento
- Respostas dos chats sobre o teste dos "feito" (cobrados em 27/10). Conferir no detalhe se ficou
  "Testado em dd/mm: …" e quantos voltaram para "fazendo".

## Esperando a usuária
- Conferir os 20 da lista curta (com o FAZ) e marcar conferido em Sobre → Pedidos.
- Os 76 em "precisa de você" (27/10) agora vão no resumo da manhã do FAZ. Eu não aviso mais.

## Decisões da usuária
- Este chat só confere: não muda a situação nem os dados dos pedidos dos outros chats. Quem muda é o chat dono.
- 27/10: não mando aviso diário. Quem cobra a usuária é o FAZ: passo para ele o que espera por ela e o que ficou pronto.
- 27/10: rodada de fechamento: "feito" só com teste de tarefa real descrito no detalhe.
- Cobrança do cliente: não entra conta sem pagamento, de pedido cancelado, sem NF de venda, nem parcela no cartão.
- Compras de peças sempre com ordem de compra. Quando o valor diverge, a OC fica concluída, com o marcador
  "Comprado por valor divergente" e mostrando o preço da ordem e o preço comprado.
- Fornecedores homologados levam o selo verde HOMOLOGADO, trazido da categoria Homologado do Tiny.

## Onde está
- Telas: `src/components/sobre/PedidosChecklist.tsx`, `CentralChats.tsx`, `ResumoSobre.tsx`.
- Banco: `pedidos_checklist`, `chats_claude`, `publicacoes`, `aviso_claude()`.
- Código no ar: a última linha da branch `site` se chama "site <hash>". Os commits "site …" são da branch site e
  não entram no histórico do código.

## Próximos passos
1. Rodada a cada pedido da usuária ou a cada aviso. Não cobrar o mesmo item do mesmo chat antes de 24 horas.
2. Para o pedido "ERP pesado", conferir se o chat principal gravou a situação nova.
3. Conferir o index.html da Hostinger: a rede deste chat bloqueia o site, então isso fica com quem publica.
