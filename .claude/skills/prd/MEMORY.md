# MEMORY — PRD (ERP Line – Cadastro de produtos)
Atualizado em 28/10/2026 (revisão de custos e chaves extratoras).

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

- Listas leves (achado do REV de 27/10): Preços, Kits, Catálogo e Importar baixam só as colunas que usam
  e os painéis Produtos e Máquinas (`SELECT_LISTA_PRODUTOS` em src/lib/produtosLista.ts, no ar em index-D4bgblTr). O cadastro segue com "*" porque abre o formulário pela lista.

- Custos aprovados em 27/10: PC-VED-014 pela última compra e PC-VED-001 pela sugestão do fornecedor.

- Painéis Produtos e Máquinas leves e avisos do Painel de Produtos abrindo no problema: no ar em 27/10 (index-BKEMOzUS).

- Revisão de custos (28/10): 14 kits com custo = soma das peças; 12 peças pela última compra (as 6 exatamente 13%
  abaixo ficaram: crédito de ICMS); chaves extratoras como variações do pai PC-CHV-023, rodízios do pai CP-EST-035 e cubas GN do pai PC-ACE-001, conexões de ar do pai CP-ELE-036 (cotovelo
  repetido CP-ELE-006 unificado no PC-MEC-021, confirmado),
  iguais ao Tiny (preço das cubas = o do pai, a confirmar com ela).

- Kits com os códigos e preços do Tiny e a composição conferida (28/10; 7 Sabores com 14 o-rings dos pistões); custo dos kits = soma das peças (decisão dela, não o custo do Tiny).
- Tubos inox dos cilindros (CP-CIL-001 açaí, CP-CIL-002 sorvete, em metro) com fornecedores, preços e contatos
  (Vtk preferido, Jati SP, Jatinox Araucária, Krominox), 28/10.

- Cálculos Internos do Tiny (14 kits, 193 linhas) conferidos com o ERP em 28/10: batem. Reativadas 4 peças elétricas
  das fichas (CP-ELE-003, 004, 010, 014), confirmado.

## Em andamento
- 29/10 Kit: aba "Peças do kit" no cadastro (como a aba "kits" do Tiny: preço e custo por peça, totais, preço do kit e
  economia) e o custo do kit sozinho: gatilhos zz_custo_kit_peca (produtos.preco_custo) e zz_custo_kit_composicao
  (kit_componentes) chamam recalcular_custo_kit (migração 20261101000196; funções fechadas para a API). Kit dentro de
  kit sobe pelo próprio gatilho. PC-KIT-012 e PC-MEC-010 acertados pela soma em 29/10.
- 29/10 Planilha composicao_fabricados_kits de 29/10 conferida com o ERP: bate, menos o o-ring do dosador (Tiny usa
  V3D01UN = PC-VED-011; o ERP usa PC-VED-014 nos kits 3, 5 e 7 Sabores; no 3 Sabores o Tiny põe 1 e o ERP 4) e o
  7 Sabores (Tiny: 15 pistões, 4 gaiolas, 4 dosadores inox, 8 V3D01UN; o ERP segue o que ela disse em 28/10). Q.050 e
  Q.063 vieram com quantidades de produção (5×, 17×), não por unidade: ignoradas. Esperando ela decidir.
- 29/10 Cadastro de produto em abas, como o de clientes (CrudPage: emAbas, completude, curto nas seções): o salvo abre
  em abas (O básico, Custo e preço, Fiscal, Compra e estoque, Códigos, Medidas, Catálogo, Anúncio, Ficha técnica,
  Documentos) com "Cadastro x% completo" e atalhos do que falta; o novo segue passo a passo com "Ver tudo em abas".
- 28/10 Insumo que não vende (MDF dos quiosques, tubos do dosador): só custo. Na edição saem preço, margem, preço
  sugerido e IPI; na lista aparece "não vende" no lugar do preço. O banco já não sugere preço para quem não vende
  (registrar_sugestao_preco); a última sugestão aberta de um insumo assim foi fechada como substituída.
- 28/10 Material cortado em peças (aproveitamento): produtos.material_formato (barra/tubo/chapa) e
  material_comprimento/largura/espessura_mm; produto_componentes.uso (como a peça foi medida). Migração
  20261101000193 aplicada. Conta em src/lib/material.ts (peças por barra com perda do corte, peças por chapa no
  melhor sentido, kg pela densidade do inox 7,93 / ferro 7,85); calculadora src/components/producao/CalculoMaterial.tsx
  na receita da Tornearia e no botão da régua na ficha técnica. A quantidade gravada fica na unidade de compra.
- 28/10 "Impostos na venda" saiu do cadastro do produto (pedido dela: é do financeiro) e foi para Gestão de preços →
  Impostos na venda (só quem vê o financeiro). O anúncio (título, marketplace, SEO) virou o último passo do cadastro novo.
- 28/10 Cadastro curto: kit novo (6 passos, custo = soma das peças, sem Compra e estoque; ao salvar abre a escolha
  das peças, aoSalvar no CrudPage) e componente de fabricação novo (4 passos: básico, fiscal, compra e estoque com o
  custo, códigos). Corrigido no CrudPage: "Próximo" do penúltimo passo salvava sem mostrar o último (botão sem key).
- 28/10 Cadastro novo de produto em 7 passos curtos (Produtos.tsx, campo `mostrar` novo em CrudPage): básico → custo e
  preço → fiscal → compra e estoque → códigos e variação → peso e medidas → catálogo. O que só funciona salvo (galeria,
  fornecedores, histórico) e o anúncio ficam na edição; componente que não vende pula medidas, catálogo e anúncio.
- 28/10 Tornearia separada da ficha das máquinas: aba "Peças (receita)" em /produtos/tornearia?aba=receita
  (src/components/producao/ReceitasTornearia.tsx, conta da barra em src/lib/tornearia.ts). A receita fica em
  produto_componentes da peça (a OP já usa). Barra redonda inox por kg: põe o comprimento em mm e grava kg
  (densidade 7,93). Próximas abas que ela quer: Insumos (saldo da barra e quantas peças dá), Pedidos (OP da
  tornearia: enviado → em produção → pronto → conferido) e Painel; OP e estoque são do GER, combinar antes.
- Rodada de fechamento (27/10): nada novo sem pedido dela; "feito" só depois de testar no ERP no ar.
- 27/10: os pedidos antigos do assunto foram testados (select e site publicado) a pedido do CNF; o site do ERP não abre
  daqui, então teste de tela com clique fica com a usuária.
- Variações (produto pai e variações): tela no ar (3b69c49) e campos no banco (20261025021635 e 20261025021646).
  A regra fica na tela (erroVariacao em src/lib/variacoes.ts); o gatilho 20261101000140 não foi aplicado (trava).
  Pais criados em 25/10: PC-KIT-016 (kits completos 3, 5, 7 Sabores e A 200) e PC-KIT-017 (kits da chave extratora).

## Esperando a usuária
- Ficha dos fabricados aqui (28/10): 5 com ficha copiada da composição (PC-CHV-004, 006, PC-MEC-001, PC-KIT-002, 013).
  Falta ela exportar do Tiny a composição das outras chaves e das peças da tornearia (o Tiny no ERP só tem vendas).
- Preço e foto do Kit Pá Agitadora + Sanfona (PC-KIT-018, hoje 187,60 = soma dos avulsos; sem foto e fora do catálogo;
  quando tiver os dois, marcar no catálogo e avisar o MKT para o anúncio) e 18 sugestões de preço que sobem.
- Custo do Disjuntor WEG MDW 25 A 4 polos (CP-ELE-010): não achado nas NF da My Frost no e-mail (só MDW-C 20 e 40 A da
  WEG, 2020; 40 A 4 polos a 53,30). Plugue 3P+T gravado a 58,86 (NF Alfatronic 22/11/2022).
- Preço de venda da Sanfona (Tiny 47,60 × ERP 37,60) e do Separador do Cubo (Tiny 75 × ERP 91); O-Ring do dosador no
  kit 3 Sabores (Tiny 1 pacote de 5 × ERP 4 un.).
- Vendas antigas sem produto (GER bd91b01 já acha pelo nome limpo): "Quiosque MDF", "Kit Carenagem" (KITREP), "Kit tampa
  superior + cuba" (KITT) e "Kit tampa frontal + pezinhos" (KITTS) não têm cadastro; "Vedacoes (Orings) My Frost
  Maquinas" pode ser mais de um kit. Ela diz se cadastra (com custo) e qual kit é.
- Custo de 3 peças que deixam kits baixos: Cubo do Redutor avulso (PC-MEC-004), Kit Corrente + 2 Engrenagens
  (PC-MEC-008) e O-Ring Anel Preto (PC-VED-009).
- Preço de venda das cubas GN (hoje o do pai, 158,13) e da conexão reta fêmea (hoje 6,67, igual ao custo).
- Custo das 16 peças feitas aqui que vendemos sem custo (planilha custo_pecas_feitas_aqui.xlsx, 28/10); inclui as chaves
  5 e 7 Sabores com custo acima do preço e a Italianinha.
- Fichas técnicas × lista "Produto x Fornecedor" (27/10): grupos gravados em todas as linhas; 57 cadastros novos
  criados a partir das compras (CP-ELE-020 a 035, CP-EST-031 a 034, CP-CON-006 a 031, CP-MAT-001 a 007, CP-REF-016,
  CP-MEC-005 a 007), ligados aos códigos dos fornecedores e às linhas de pedido de compra. Sem compra nenhuma (ficaram de
  fora): Thermoval, adesivos, bolinha de baquelite, madeira pinus, prego, grade, placa do painel, flange de motor,
  peças de inox da dosadora, cabo PP 4x4, fio 0,75 amarelo. Falta ela dizer quais itens entram em cada máquina.
- Preço do PC-MEC-002 "Cubo + Separador do Cubo" (achado do MKT, 27/10): custa menos que o PC-MEC-018 "Separador do
  Cubo" sozinho e não é kit (sem componentes). Saber se o nome está errado (só o cubo?) ou se o preço está errado.
- Planilha de custo, peso, medidas e foto das peças que vendem (mandada em 24/10).
- Planilha de custo dos 36 sem custo (26/10): usinadas = valor da tornearia de fora por peça (+ material se a MF
  fornece); compradas = custo por unidade. O Tiny não tem esse custo (backup zerado; API só com o login dela).
- Liberar no acesso à rede os sites dos fornecedores de refrigeração, para buscar peso e medidas.
- Teste com 3 fotos no padrão (fundo branco, quadrada); as fotos sem logo do Canva ficam com o MKT.

## Decisões da usuária
- Kits com várias unidades para o Mercado Livre (28/10): sanfona com 3 (PC-VED-004, kit), pá + sanfona (PC-KIT-018).
  Cada kit novo: kit_componentes com as unidades; custo = soma; anúncio com o MKT.
- Preços para revisar após troca de custo: recusar as sugestões que baixam o preço; as que sobem ela aprova (28/10).
- Custo de kit = soma das peças do ERP (28/10), mesmo quando o Tiny tem outro custo.
- Chaves extratoras, rodízios, cubas GN e conexões de ar como variações, iguais ao Tiny (28/10).
- Peça usinada: a tornearia é de fora e cobra por peça; o custo vem desse valor (sem ficha técnica por enquanto).
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
- GER: vendas das notas com nome antigo ("My Frost") ou código lixo ("CFOP6101") ficam sem custo no DRE; pedido a ele
  para achar pela descrição normalizada e mostrar "vendas sem custo" (28/10).
1. Avisar o MKT dos pais (um anúncio com variações na loja e no ML é dele).
2. Completar o cadastro dos 4 produtos criados pelo GER a partir de notas (3 controladores e o ferro chato).
3. Gravar custo, peso e foto quando a planilha voltar.
4. Teste das 3 fotos no padrão.
