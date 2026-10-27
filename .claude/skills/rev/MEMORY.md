# MEMORY — REV (ERP Line – Revisão: velocidade, links e repetidos)
Atualizado em 27/10/2026.

## Estado agora
Primeira auditoria geral feita em 27/10: relatório em `.claude/skills/rev/auditoria-2026-10-27.md` (17 achados,
com o chat dono de cada um). Dois consertos de velocidade feitos no código; falta publicar o site.

## No ar
- Nada ainda deste chat (os consertos de 27/10 estão só na `paineis-no-ar`, esperando o "Pode publicar").

## Em andamento
- Levar cada achado ao chat dono (tabela do relatório).

## Esperando a usuária
- "Pode publicar" do site com os dois consertos de velocidade.
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
1. Depois do "Pode publicar", conferir o index.html da Hostinger e medir de novo o pacote no ar.
2. Mandar a cada chat dono a sua parte da tabela (GER: achados 1, 9, 10, 12-14; CLI: 3; SEG: 4 e 8; CAR: 6).
3. Próxima rodada: medir o tempo de abrir as telas mais usadas no navegador (Pedidos, Clientes, Financeiro).
