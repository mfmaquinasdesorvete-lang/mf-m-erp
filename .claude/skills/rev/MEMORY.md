# MEMORY — REV (ERP Line – Revisão: velocidade, links e repetidos)
Atualizado em 31/10/2026.

## Estado agora
31/10: segunda rodada feita, relatório em `.claude/skills/rev/auditoria-2026-10-31.md` (10 achados). Pacote de entrada 724 KB (era 918 em 27/10), Sobre 172 KB ao abrir. Publicado e conferido (index-BWBWH45K.js).
Primeira auditoria geral feita em 27/10: relatório em `.claude/skills/rev/auditoria-2026-10-27.md` (17 achados,
com o chat dono de cada um). Dois consertos de velocidade feitos e publicados.

## No ar
- 31/10 (conferido): index-BWBWH45K.js, entrada 724 KB e Sobre por aba (172 KB).
- 29/10 (conferido): site index-CCLdmYCi.js com tudo da auditoria (Produção em Fábrica e estoque, código sem uso apagado, consertos dos chats); pacote de entrada 813 KB. Banco: índices repetidos e tmp_oc_plano_2310 apagados pela usuária no SQL Editor.
- 27/10: site com o pacote de entrada mais leve e o Sobre sem o histórico repetido (index-Com_oaXI.js, conferido na Hostinger).

## Em andamento
- 31/10: achados da segunda rodada enviados ao GER (1, 2, 3, 5, 6, 7, 8), SEG (4 e 10), SOR (5) e ENT (6, auditor); esperando as respostas. O teste bancoSeguranca está vermelho pela função do GER (conta_receber_pix_do_dia).
- Respostas 31/10: ENT anotou o índice do auditor para a próxima publicação do banco; SEG disse que vigiar_sistema() é do GER (monitor), repassado ao GER; SOR escreveu a migração 20261101000205 (regras e índice de licenciados_marcas), falta aplicar com a aprovação da usuária.
- 31/10: o DOC foi juntado ao REV (os documentos de docs/ agora são meus; título da sessão atualizado).
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
- MKT apagou ligarAnuncio e separarCompatibilidade com o ok da usuária (a5ba412, foi na publicação index-BF--YF30).
- PRD: PainelProdutos e PainelMaquinas com SELECT_LISTA_PRODUTOS (da7570c), espera a próxima publicação.
- Ainda não enviados: PRD (2 e 6), FIS, TRA e MKT (9), DSG (16).

## Esperando a usuária
- Nada.

## Decisões da usuária
- Apagar o que está morto só com a confirmação dela.
- 27/10: autorizou apagar o que a auditoria achou sem uso. Apagados: KanbanPagar.tsx, BotaoFiltros e PainelFiltros, grupoInfo, notifyDesfazer, motivoNaoPagar, COLUNAS_PAGAR/colunaPagar, IconeTeste/IconeDevolucao, CAMPOS_GRUPO, embedVideo, comoSaiu, aplicarAumento, atendimentosMyFrost (e TIPOS_ATENDIMENTO), resumoMes, lerSerieMF, nomeComVariacao (com os testes deles). VISOES_PAGAR ficou: o teste do naVisaoPagar usa o tipo dele.
- 27/10: "Produção" vai para a área Fábrica e estoque (feito no menu.ts).

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

## Memória — antes chat DOC (juntado ao REV em 31/10/2026)
O chat DOC foi encerrado e o assunto dele passou para este chat. Abaixo, a skill/memória dele como estava; o que falar "eu" ou "DOC" agora é o REV.

## MEMORY — DOC (ERP Line – Documentos (.md))
Atualizado em 27/10/2026.

### Estado agora
Os 5 documentos pedidos estão prontos em `docs/`, todos gerados do código por um comando só.
Nada fica esperando: os documentos `.md` não vão para o site, então não há nada para publicar.

### No ar (na paineis-no-ar)
- `docs/modulos.md`: todas as áreas e telas na ordem do menu, quem pode abrir e os processos (ecebaf7).
- `docs/guia-por-perfil.md`: para cada perfil, as telas, as ações, os atalhos do celular e os passos nos processos (de4b14f).
- `docs/perguntas-frequentes.md`: 35 perguntas do dia a dia com o passo a passo (6145e5a).
- `docs/acesso-novo.md`: como dar acesso a alguém novo, perfis, 1º acesso e senha esquecida (e965cf0).
- `docs/glossario.md`: 53 termos em palavras simples, com as telas onde aparecem (0cb45b7).
- `docs/README.md`: o índice dos documentos (sai sozinho).
- Os 5 pedidos estão como feito no Sobre → Pedidos (grupos "Chats do Claude" e "Documentos", de 23/10).

### Em andamento
- Nada.

### Esperando a usuária
- (31/10, feito pelo REV) o teste de 27/10 foi escrito no detalhe dos 5 pedidos dos documentos, com versao ec5fd29.
- Já foi oferecido publicar algum documento como página (Artifact) para mostrar a alguém de fora; ela ainda não pediu.

### Decisões da usuária
- Quis todos os documentos sugeridos, feitos em sequência e sem pressa (23/10).
- Os documentos ficam em `docs/`, em português simples e sem dados da empresa (o repositório é público).
- Telas e processos só da conta master (Retaguarda, carteira pessoal, lojas licenciadas) ficam fora dos documentos.
- Tela cujo texto fala de dado sensível da empresa fica fora (lista `TELAS_FORA_DOS_DOCS` em `scripts/docs/base.mjs`);
  em 27/10 entrou a do histórico de ex-funcionários de antes da MF.
- Rodada de fechamento (27/10): nada novo sem ela pedir; "feito" só depois de testar (aqui: gerar de novo do código atual,
  conferir links e dados sensíveis).

### Onde está
- Gerador: `scripts/gerar-docs.mjs` (rodar na raiz: `npx tsx scripts/gerar-docs.mjs`).
- Um arquivo por documento em `scripts/docs/` e a base comum em `scripts/docs/base.mjs`.
- Fontes: `src/lib/menu.ts` (lido como texto), `src/lib/modulos.ts`, `src/lib/modulosDetalhe.ts`,
  `src/lib/permissoes.ts` e `src/lib/esquemas.ts`.
- As listas que escrevi à mão: as perguntas (`perguntas-frequentes.mjs`), as definições do glossário (`glossario.mjs`)
  e qual função dos esquemas cada perfil faz (`FUNCOES_DO_PERFIL` em `guia-por-perfil.mjs`).
- Banco: só `pedidos_checklist` (para o Sobre → Pedidos). Funções do Supabase: nenhuma.

### Próximos passos
1. Quando o menu, as telas ou os processos mudarem, gerar de novo, conferir o diff (sem dados da empresa) e os links.
2. Se o gerador parar com erro de tela, parte ou processo que sumiu, rever a pergunta ou o termo e não tirar a conferência.
3. Ideias para oferecer depois: um guia de cada processo com desenho, e um "o que mudou no ERP" por semana tirado do git.
