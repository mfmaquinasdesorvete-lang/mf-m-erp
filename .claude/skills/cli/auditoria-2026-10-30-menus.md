# Auditoria dos menus · Ficha 360, página do cliente e ficha para assinar · 30/10/2026

Pedido da usuária: reavaliar os menus da Ficha 360, de como o cliente vê a página dele e de como vê a assinatura, e
ter na lista de clientes um ícone para enviar a assinatura e outro para ver como o cliente vê.
Telas: `src/components/FichaCliente.tsx`, `src/pages/AreaCliente.tsx` (/cliente/<link>), `src/pages/FichaPublica.tsx`
(/ficha/<código>), `src/pages/Clientes.tsx`.

## Feito nesta rodada

| # | O que | Onde |
|---|---|---|
| F1 | Ícone "Enviar a ficha para assinar" (abre o WhatsApp com o link; sem WhatsApp, copia o link) e ícone "Ver como o cliente vê" em cada linha | Lista de clientes (`AcoesClienteLista`) |
| F2 | Situação da ficha (assinada, aguardando, não assinada) e o botão de enviar no alto da Ficha 360 | Ficha 360 |
| F3 | Abas da página do cliente sem a barra de rolagem; no computador quebram linha, no celular deslizam | Página do cliente |
| F4 | "Cliente desde" pela data mais antiga (cadastro, pedido, compra da máquina, máquinas, notas, propostas); antes usava a data da importação do Tiny | Banco (`cliente_desde`, migração 20261101000200) |

## Achados e propostas (ela escolheu as quatro em 30/10; feitas no mesmo dia)

| # | Achado | Proposta |
|---|---|---|
| P1 | Ficha 360 tem três abas que se cruzam: "Máquinas e compras", "Compras" e "O que compra" | Ficar com "Máquinas" (máquinas e notas) e "Compras" (pedidos e o que compra juntos): 6 abas em vez de 7 |
| P2 | No alto da Ficha 360 os atalhos têm quatro jeitos diferentes (botão, botão sem borda, link azul, selo) | Uma fila só de botões iguais: WhatsApp · Enviar ficha · Copiar link do cliente · Ver como o cliente vê |
| P3 | A página do cliente não mostra a ficha cadastral | Em "Meus dados": "Ficha assinada em dd/mm (baixar comprovante)" ou o botão "Conferir e assinar" quando falta |
| P4 | Depois de assinar, a ficha não leva à página do cliente | Botão "Ver minha página" no fim da assinatura |
| P5 | Feito em parte: "(opcional)" nos campos, foco no campo com erro, CNPJ da MF no rodapé, topo sem degradê. Fica para depois o rascunho (item 9 do DSG). Resto da auditoria do DSG na ficha para assinar: o que é opcional, foco no campo com erro, rascunho, CNPJ da MF no rodapé, topo sem degradê | Fazer junto com P3 e P4 |

Teste depois de publicar: na lista, enviar a ficha de um cliente pelo ícone (o WhatsApp abre com o link) e abrir
"Ver como o cliente vê"; conferir o "Cliente desde" de um cliente antigo do Tiny.
