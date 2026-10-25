# MEMORY — PRD (ERP Line – Cadastro de produtos)
Atualizado em 25/10/2026 (variações no banco).

## Estado agora
Cadastro limpo e no padrão do Google e dos marketplaces: sem repetidos conhecidos, sem "My Frost" nos textos, com
subtítulo, códigos dos fornecedores, abas novas e as 2 últimas compras. As variações têm tela, mas faltam no banco.

## No ar
- Campo Subtítulo, abaixo do nome, na ficha, na lista, na loja e na lista do Google (07e3724, migração 20261024011540).
- Nomes no padrão (nomePadrao com "10 A" e "O-Ring") e marca certa: "MF Máquinas" na peça feita aqui, a do fabricante
  na peça comprada, e vazia onde estava "My Frost".
- Sem "My Frost" nos cadastros (5d4c663 + dados de 24/10). Subtítulo: "Compatível com máquinas de sorvete expresso"
  + modelos; máquinas com o modelo na frente.
- Códigos dos fornecedores na ficha, na lista e na busca (e5671fb); itens de nota ligados aos produtos.
- Abas: Peças à venda (abre primeiro), Tornearia (marcador "Tornearia"), Insumos, Serviços e Todos; a contagem não
  inclui os inativos (9a88188).
- As 2 últimas compras (valor, data, fornecedor e condição, pelas notas) ao lado do custo (2119417); a aba Custos
  mostra a última compra à vista, que é o custo de referência (migração 20261025184259, condicao_compra).
- Kits de vedação 3, 5 e 7 Sabores conferidos com o catálogo do WhatsApp; preços do WhatsApp gravados.
- Repetidos unificados em 23 e 24/10; produtos da base antiga da My Frost sem uso inativados; peças da produção
  passadas para insumo.

## Em andamento
- Variações (produto pai e variações): tela no ar (3b69c49) e campos no banco (20261025021635 e 20261025021646).
  A regra fica na tela (erroVariacao em src/lib/variacoes.ts); o gatilho 20261101000140 não foi aplicado (trava).
  Pais criados em 25/10: PC-KIT-016 (kits completos 3, 5, 7 Sabores e A 200) e PC-KIT-017 (kits da chave extratora).

## Esperando a usuária
- Planilha de custo, peso, medidas e foto das peças que vendem (mandada em 24/10).
- Liberar no acesso à rede os sites dos fornecedores de refrigeração, para buscar peso e medidas.
- Teste com 3 fotos no padrão (fundo branco, quadrada); as fotos sem logo do Canva ficam com o MKT.

## Decisões da usuária
- Compra à vista ou a prazo: marcada na entrada da nota (o GER põe a escolha na tela); Pix e parcelas se marcam
  sozinhos pelo XML. A formação de preço usa o custo à vista.
- Unificar só com a confirmação dela; marcadores só somam.
- "Apoio da Mecânica" e "Mecânica Parte do Apoio" são diferentes (composição diferente): não unificar.
- Peça usinada que vende aparece em Peças à venda e em Tornearia.
- Máquinas ficam fora do catálogo do WhatsApp; peças com foto e preço entram.
- Uso interno (insumo, serviço, "não vende") não conta em peso e medidas.

## Onde está
- Telas: src/pages/Produtos.tsx, src/components/produtos/FichaProduto.tsx, src/components/FornecedoresProduto.tsx.
- Regras: src/lib/marketplace.ts (nomePadrao, separarCompatibilidade, gruposRepetidos), src/lib/variacoes.ts,
  src/lib/maquinas.ts (ultimasCompras).
- Banco: produtos (subtitulo; agrupador, produto_pai_id e variacao a criar), kit_componentes, produto_fornecedor,
  fornecimentos, marcadores; funções unificar_produtos, historico_custos e loja_dados.
- Funções do Supabase: catalogo-feed (lista do Google e do WhatsApp).

## Próximos passos
1. Avisar o MKT dos pais (um anúncio com variações na loja e no ML é dele).
2. Completar o cadastro dos 4 produtos criados pelo GER a partir de notas (3 controladores e o ferro chato).
3. Gravar custo, peso e foto quando a planilha voltar.
4. Teste das 3 fotos no padrão.
