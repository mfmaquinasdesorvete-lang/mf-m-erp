# MEMORY — REV (ERP Line – Revisão: velocidade, links e repetidos)
Atualizado em 27/10/2026.

## Estado agora
Primeira auditoria geral feita em 27/10: relatório em `.claude/skills/rev/auditoria-2026-10-27.md` (17 achados,
com o chat dono de cada um). Dois consertos de velocidade feitos e publicados.

## No ar
- 27/10: site com o pacote de entrada mais leve e o Sobre sem o histórico repetido (index-Com_oaXI.js, conferido na Hostinger).

## Em andamento
- Levar cada achado ao chat dono (tabela do relatório).

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
