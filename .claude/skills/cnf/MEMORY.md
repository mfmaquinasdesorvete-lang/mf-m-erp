# MEMORY — CNF (ERP Line – Conferência dos pedidos)
Atualizado em 25/10/2026.

## Estado agora
Desde 23/10 faço rodadas de conferência do checklist (Sobre → Pedidos) e cobro os chats.
Na última rodada nenhum pedido feito estava sem conferir e nenhum estava parado.
Depois das quedas da Hostinger e do Supabase (24/10), conferi os 140 commits dos pedidos feitos: todos estão no
código do site reenviado.

## No ar
- Painel "Conferência dos pedidos" (artifact): números no alto, um cartão por chat, a lista do que foi cobrado e as
  respostas. É atualizado no mesmo link a cada rodada.
- Rodada: ler `pedidos_checklist`, `chats_claude` e `publicacoes` (só select), fazer `git fetch` da `paineis-no-ar` e
  da `site`, conferir cada commit de `versao` com `git merge-base --is-ancestor` e cobrar o chat dono com send_message.

## Em andamento
- Conferir quais chats criaram a própria `MEMORY.md` (pedido de 25/10) e mandar a lista ao ELO.

## Esperando a usuária
- Os itens em "precisa de você" dos outros chats (perto de 57 em 24/10). Eu aviso uma vez por dia pelo aviso_claude,
  sem cobrar item por item.

## Decisões da usuária
- Este chat só confere: não muda a situação nem os dados dos pedidos dos outros chats. Quem muda é o chat dono.
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
