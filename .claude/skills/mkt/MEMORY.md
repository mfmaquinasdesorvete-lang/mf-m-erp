# MEMORY — MKT (ERP Line – Marketplaces)
Atualizado em 25/10/2026.

## Estado agora
Mercado Livre ligado ao ERP: vendas entram sozinhas, estoque e preço vão para os anúncios, e os produtos da loja
viram anúncios novos por proposta (o ERP prepara, ela aprova). 59 anúncios ligados a produtos; nenhum com a marca
My Frost. Os outros canais (Google Shopping, WhatsApp, Shopee etc.) aparecem só como "conectar depois".

## No ar
- Mercado Livre → Painel: pedidos, tempos e histórico de tudo o que já foi vendido (migração 110).
- Mercado Livre → Produtos: os mesmos produtos da /loja, com e sem anúncio (112) e Outros marketplaces.
- Anúncios novos: preparar (categoria, atributos, preço) e publicar só os escolhidos (114, ml-novos.ts, novos.ts).
  Atributos obrigatórios com lista (tipo de alimentação, tipo de relé, voltagem) escolhidos pelo nome do produto.
- Atualizar e republicar anúncios (foto, descrição, título sem a marca My Frost) e copiar fotos de link (atualizar.ts).
- Mercado Envios como transportadora das vendas do Mercado Livre (124).
- Mínimo no anúncio (161): produto ativo sem estoque mostra o mínimo e não pausa.
- Várias fotos (176, fotos.ts, GaleriaLoja.tsx): a principal + a galeria do cadastro (produtos_midia) vão para a loja
  (miniaturas, zoom, tela cheia) e para os anúncios (até o máximo da categoria); botão "Mandar fotos para os anúncios".
- Simulador de canais (aba Simulador, simuladorCanais.ts, simular.ts, ação simular_canais): lucro por produto na loja
  (Pix, cartão, link) e no Mercado Livre (Clássico, Premium), preço mínimo, preço para o lucro desejado, verba de anúncio
  (ACoS/ROAS) e "como foi calculado"; imposto efetivo do FIS (25% loja, 27% ML) e crédito das compras (21,25%). No ar em 28/10.

## Em andamento
- Rodada de fechamento (27/10): os 10 pedidos "feito" testados com dados reais e com o teste escrito no detalhe.
  Anúncios em 27/10: 43 ativos, 9 em análise e 7 pausados pelo Mercado Livre (o ERP ainda não lê o motivo da pausa).

## Esperando a usuária
- EAN do compressor 1/5 (a categoria exige); a Condensadora Arame precisa de outra categoria (caiu em peça de carro).
- Foto nova do CLP: a logo My Frost está impressa no aparelho (as fotos do Canva têm a logo).
- Prints de outras fotos com a logo, se ela achar (o Cachorrinho já foi trocado em 25/10).
- Pôr 3 ou 4 fotos na galeria de uma peça para o teste real das várias fotos (loja e "Mandar fotos para os anúncios").
- Abrir a aba Simulador com um produto (teste real que falta para marcar feito).
- Kit Pá Agitadora Inox + Sanfona (PC-KIT-018): foto, catálogo e preço confirmado antes do anúncio.
- Imposto sobre a venda está 0% nas Configurações (perguntado ao FIS em 27/10).
- Planilha "Dados fiscais" do ML (29/10): os 47 preenchidos como nacionais; ela envia no Mercado Livre.
- Contar os anéis do pistão dos kits de vedação (kits 7, 11 e 15).
- Notas fiscais das vendas antigas do Mercado Livre sem NF (ela importa os XML).

## Decisões da usuária
- Estoque dos anúncios sai da Matriz SC; segurança de 1 unidade; mínimo de 1 no anúncio (estoque zerado na contagem
  de 24/10, sem lançar estoque falso).
- Sem marca no cadastro, a marca do anúncio é "MF Máquinas". Nenhum anúncio, título, foto ou descrição com "My Frost".
- Fiscal dos anúncios (29/10): nada é importado, tudo vai como nacional (origem 0, regra "Produtos nacionais").
- Preço do anúncio: o que deixa o valor da loja depois da tarifa e do frete grátis, terminado em ,90.
- Nada publica, pausa ou muda preço e estoque em lote sem o ok dela (mostrar a lista antes).

## Onde está
- Telas: src/pages/MercadoLivre.tsx, src/components/mercadolivre/ (Painel, ProdutosLojaML, AnunciosNovosML,
  EnvioEstoquePreco, OutrosMarketplaces)
- Banco: ml_contas, ml_anuncios, ml_anuncios_envio, ml_sync_fila, ml_propostas, ml_pedidos; ml_configurar_envio
- Funções do Supabase: mercadolivre (ações anuncios, preparar_anuncios, publicar_anuncios, atualizar_anuncios,
  republicar_anuncios, copiar_fotos, historico); partes puras em _shared/ml-anuncios.ts e _shared/ml-novos.ts

## Próximos passos
0. Ideias de 27/10 (depois do simulador): lucro real das vendas por canal e mês; projeção do período (com GER/AUD).
0. Kits O-Rings com variações (PRD fez o pai e as variações): anúncio único com escolha só com o ok dela.
1. Ler o motivo da pausa (sub_status) dos anúncios e mostrar na lista; ver os 7 pausados.
2. Publicar o compressor e a condensadora quando o EAN e a categoria estiverem certos.
3. Google Shopping: conferir se o feed está em dia; perguntas e pós-venda do Mercado Livre.
