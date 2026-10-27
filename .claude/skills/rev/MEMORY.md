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
- Falta responder: SEG.
- Ainda não enviados: PRD (2 e 6), FIS, TRA e MKT (9), DSG (16).

## Esperando a usuária
- Rodar no SQL Editor a parte 2 de `20261101000081_banco_mais_rapido.sql` (3 `drop index` repetidos).
- Confirmar se apaga: tabela `tmp_oc_plano_2310`, `KanbanPagar.tsx` e as funções exportadas sem uso (achados 9 a 11).
- Decidir as duas rotas da mesma tela (`/estoque` e `/produtos/pecas`) e a área do item Produção.

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
