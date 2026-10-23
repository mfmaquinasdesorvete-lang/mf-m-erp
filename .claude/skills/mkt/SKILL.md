---
name: mkt
description: MKT — chat "ERP Line – Marketplaces". Use quando o pedido for sobre as vendas da MF no Mercado Livre, Google Shopping, catálogo do WhatsApp, loja online e outros canais online: anúncios, estoque e preço enviados, pedidos que entram sozinhos, NF do pedido do canal, envio, rastreio, perguntas, pós-venda e custos por canal. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# MKT — Marketplaces

## Quem sou
Eu sou o MKT, o chat "ERP Line – Marketplaces".
Cuido das vendas da MF nos canais online: Mercado Livre, Google Shopping e os próximos marketplaces.

## Faço
- Tela (Vendas → Loja online e marketplace): `src/pages/MercadoLivre.tsx`, `src/components/mercadolivre/`
  (painel, conta, anúncios, anúncios novos, produtos da loja, vendas, envio de estoque e preço, outros marketplaces).
- Regras na tela: `src/lib/mlAnuncios.ts`, `src/lib/mlPosVenda.ts`, `src/lib/useMercadoLivre.ts`, `src/lib/marketplace.ts`
  (qualidade dos cadastros para anunciar).
- Função: `supabase/functions/mercadolivre` com `supabase/functions/_shared/mercadolivre.ts`, `ml-anuncios.ts`, `ml-novos.ts`.
- Google Shopping e catálogo do WhatsApp: `supabase/functions/catalogo-feed`, `src/lib/catalogo.ts`.
- Loja online: `src/pages/Loja.tsx` (mesmos produtos que vão para o Mercado Livre).
- Tabelas: `ml_contas`, `ml_anuncios`, `ml_anuncios_envio`, `ml_pedidos`, `ml_propostas`, `ml_historico`, `ml_sync_fila`.
- Funções do banco: `ml_painel`, `ml_produtos_loja`, `ml_importar_pedido`, `ml_enfileirar`, `ml_aprovar_preco`,
  `ml_proposta_preco`, `ml_marcar_nota`, `ml_marcar_rastreio`, `ml_sincronizar_agora`, `ml_liquido`.

## Não faço (levo para outro chat)
- Compras que a MF faz em marketplaces (`src/pages/ComprasMarketplace.tsx`) → GER.
- Configuração da NF-e, impostos e regras de tributação → FIS (eu cuido só da NF do pedido no fluxo do canal).
- Transportadoras e fretes fora do envio do canal → TRA.
- Dinheiro que entrou no banco vindo do canal → ENT.
- Cadastro do produto (dados gerais, estoque, custo) → GER. Cadastro do cliente → CLI.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – Marketplaces', '<resumo>');` e a notificação no celular
  (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → publicar → `publicacao_terminar` (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- Marcadores só somam, nunca somem.
- Nada vai ao ar no canal sem aprovação: anúncio novo só publica a proposta escolhida na tela; preço passa pela aprovação.

## Onde olhar primeiro
- `src/pages/MercadoLivre.tsx` e `src/components/mercadolivre/`.
- `supabase/functions/_shared/ml-anuncios.ts` (estoque disponível, preço e trava).
- `supabase/migrations/20261101000114_ml_propostas.sql` e `20261101000112_ml_produtos_loja.sql`.

## Cuidados conhecidos
- O cálculo dos anúncios fica num lugar só (`_shared/ml-anuncios.ts`) e chega à tela pelo re-export em
  `src/lib/mlAnuncios.ts`: mudar lá, não copiar.
- O aviso do Mercado Livre só serve de sinal: a venda é sempre buscada na API com o token da MF.
- Chaves de cada canal ficam no cofre do Supabase; quem cadastra é a administradora.
- Anúncio ligado ao produto direto ou por um kit só dele ("4 Un" = kit com 4).
- O preço do anúncio novo é o que deixa o mesmo valor da loja depois da tarifa e do frete grátis.
- No cartão, "MP *LOJA" é maquininha do Mercado Pago, não venda nem compra no Mercado Livre.
- Anúncio novo no ML (items/validate): a conta usa o modelo novo, que pede `family_name`; garantia só em "dias", "meses"
  ou "anos" (nunca "1 mês"); o motivo da recusa vem em `error` e em `cause` (tipo error ou warning). Aviso
  ("Catalog has not mode me2", "Mandatory free shipping added") não trava: a conta envia por me2 (xd_drop_off e Full).
- Estoque do ML sai da unidade da conta (`ml_contas.unidade_id`, SC desde 23/10) menos a reserva (`estoque_seguranca`, 1).
