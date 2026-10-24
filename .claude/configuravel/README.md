# Menos dependente do código

Pedido da usuária em 24/10/2026: o que hoje só muda mexendo no código e é regra do negócio
(taxas, prazos, percentuais, mensagens ao cliente, listas de opções, regras "se X então Y")
deve poder ser mudado por ela numa tela de Configurações.

Levantamento só de leitura, com arquivo e linha de cada item:

- `telas.md`: 160 itens nas telas (`src/`).
- `servidor.md`: 94 itens nas funções do Supabase e no banco (`supabase/`).

## Regras para quem for levar um item para a tela

1. Use a base comum (etapa 1). Não crie outra tabela ou outra página de configuração por conta própria.
2. O valor de hoje vira o valor inicial da configuração. Nada muda para a usuária até ela editar.
3. Se a mesma regra está na tela e no banco (por exemplo a tolerância do frete ou a janela da conciliação),
   o banco lê a mesma configuração. Nunca deixe dois números diferentes para a mesma regra.
4. Texto para o cliente vira modelo com variáveis ({cliente}, {empresa}, {valor}, {vencimento}…) e um
   botão "voltar ao texto padrão".
5. O nome da empresa nos textos vem de Configurações → Empresa (nome fantasia), nunca escrito à mão.
6. Ao terminar um item, marque-o como feito na tabela (coluna nova "Feito", com o commit) e no Sobre → Pedidos.

## Ordem (as etapas dependem da primeira)

1. **Base comum (GER):** em Configurações, uma página "Prazos e padrões" (números: dias, %, R$, com explicação
   e valor padrão) e uma página "Mensagens ao cliente" (modelos de WhatsApp e e-mail com variáveis e prévia).
   Uma função para ler as duas pelas telas e pelo banco.
2. **Dinheiro:** multa e juros da baixa (GER), PIS/COFINS no custo das compras pela unidade (FIS), tarifa e frete
   grátis do Mercado Livre (MKT), janelas da conciliação do extrato (ENT), pontos do risco do despacho e
   padrões do pedido, da OS e das parcelas (GER).
3. **Mensagens ao cliente:** WhatsApp e e-mails automáticos (GER, TRA, TEC), e os e-mails de cobrança que
   rodam fora da régua (GER).
4. **Prazos dos alertas:** Fluxo de vendas, painéis, reposição de estoque, garantia e preventiva (GER),
   validade e tolerância do frete (TRA).
5. **O resto:** listas de opções, feriados de SC e SP, itens dos outros chats.
