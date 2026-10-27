# MEMORY — REV (ERP Line – Revisão: velocidade, links e repetidos)
Atualizado em 27/10/2026.

## Estado agora
Primeira auditoria geral feita em 27/10: relatório em `.claude/skills/rev/auditoria-2026-10-27.md` (17 achados,
com o chat dono de cada um). Dois consertos de velocidade feitos e publicados.

## No ar
- 27/10: site com o pacote de entrada mais leve e o Sobre sem o histórico repetido (index-Com_oaXI.js, conferido na Hostinger).

## Em andamento
- 27/10: achados enviados ao GER (1, 2, 7, 6, 14, 11, 12), CLI (3), SEG (4 e 10) e CAR (8 e 9); esperando as respostas.
- GER respondeu (27/10): pega a Auditoria financeira e as listas sem `select:` (clientes e produtos primeiro); `centavos()` numa troca separada com teste; rotas, menu e o que apagar dependem da usuária.
- CAR fez (27/10, migração 20261101000174): as 9 regras da carteira com (select auth.uid()) e os 5 índices; conferido pelo REV no banco (0 regras sem select, 9 regras).
- CLI fez (27/10, migração 20261101000174): os crons da Receita e das redes checam com receita_tem_pendente() e redes_tem_pendente() (51 ms as duas, antes 97 + 195 ms; conferido no cron.job). Clientes e Painel dos clientes usam SELECT_LISTA_CLIENTES (`src/lib/clientesLista.ts`), que foi passado ao GER para as outras telas. O site dele espera o ok da usuária.
- SEG fez (27/10, commit e73163d): o Monitor atualiza a saúde do sistema a cada 5 min (vai na próxima publicação do site). As regras de acesso repetidas (51 tabelas) entram aos poucos, tabela por tabela, testando cada papel.
- Os quatro chats responderam. 27/10: enviados também ao PRD (produtos sem select, SELECT_LISTA_PRODUTOS; rotas /estoque × /produtos/pecas), FIS (índice de certidoes, EmitirNfe e ComplianceFiscal), TRA (4 índices de frete, FreteVenda), MKT (índice de ml_historico, MercadoLivre.tsx, 2 funções sem uso) e DSG (Carregando do App.tsx); esperando as respostas.
- FIS fez (27/10, commit 9167ec3): índice certidoes_unidade_id_idx, conferido no banco. EmitirNfe e ComplianceFiscal continuam com clientes e produtos inteiros, de propósito: as conferências da NF-e (_shared) leem muitos campos e a consulta já vem do cache. Decisão aceita pelo REV; se um dia for prioridade, o FIS faz SELECT_CLIENTE_NFE com teste.
- TRA fez (27/10, commit dabb127): os 4 índices de frete (conferidos no banco) e o FreteVenda baixando só id, peso e medidas dos produtos do pedido (vai na próxima publicação do site).
- MKT fez (27/10, commit a4e7d80): índice ml_historico_conta_id_idx (conferido no banco); na tela do Mercado Livre os produtos só baixam com a aba Marketplace aberta (as colunas ficaram, a auditoria da aba usa quase todas). ligarAnuncio e separarCompatibilidade esperam a usuária.
- PRD fez (27/10, commit 7b2de6e): SELECT_LISTA_PRODUTOS (`src/lib/produtosLista.ts`, sem os textos longos) em GestaoPrecos, KitComponentes, CatalogoConfig e config/Catalogo; ImportarProdutos só id, id_externo e sku. Produtos.tsx fica com "*" (o formulário precisa dos textos). Passei a ele as linhas certas dos painéis (PainelProdutos:44, PainelMaquinas:52).
- /estoque e /produtos/pecas abrem Peças à venda de propósito (pedido da usuária, segundo o PRD): achado 12 fechado, não é para juntar.
- DSG fez (27/10, commit 92c3b57): App.tsx usa a peça Carregando de ui.tsx.
- Os nove chats responderam. 27/10: publicado pelo REV o site com os consertos de SEG, CLI, TRA, MKT, PRD e DSG (index-BF--YF30.js, conferido na Hostinger). O GER ainda está fazendo a Auditoria financeira e as listas dele.
- Ainda não enviados: PRD (2 e 6), FIS, TRA e MKT (9), DSG (16).

## Esperando a usuária
- Rodar no SQL Editor a parte 2 de `20261101000081_banco_mais_rapido.sql` (3 `drop index` repetidos).
- Confirmar se apaga: tabela `tmp_oc_plano_2310`, `KanbanPagar.tsx` e as funções exportadas sem uso (achados 9 a 11).
- Decidir a área do item Produção (as duas rotas da mesma tela são pedido dela, segundo o PRD).

## Decisões da usuária
- Apagar o que está morto só com a confirmação dela.

## Onde está
- Relatório: `.claude/skills/rev/auditoria-2026-10-27.md`.
- Consertos: `src/components/Layout.tsx` (alertas e Perguntar à IA sob demanda), `src/lib/pergunta.ts`,
  `src/lib/historicoGit.ts` (histórico do git num lugar só).
- Medidas de 27/10: pacote principal 918 → 827 KB (gzip 275 → 247 KB); Sobre 424 → 411 KB.

## Próximos passos
1. Mandar a cada chat dono a sua parte da tabela (GER: achados 1, 9, 10, 12-14; CLI: 3; SEG: 4 e 8; CAR: 6).
2. Próxima rodada: medir o tempo de abrir as telas mais usadas no navegador (Pedidos, Clientes, Financeiro).

## Como publicar o site (conferido em 27/10)
- `scripts/publicar-site.sh` → Hostinger `hosting_git_deploy-website-repository` (branch site, pasta `_deploy`) →
  `hosting_websites_deploy-static-site-archive` (`_deploy/site.zip`) → ler `index.html` com `hosting_files_website-content`
  (o curl para o site é bloqueado pela rede do ambiente).
