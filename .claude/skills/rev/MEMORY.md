# MEMORY — REV (ERP Line – Revisão: velocidade, links e repetidos)
Atualizado em 27/10/2026.

## Estado agora
Chat criado em 27/10 pelo ELO, a pedido da usuária. Ainda não fez a primeira auditoria.

## No ar
- Nada ainda deste chat. Já existe a auditoria do menu (`src/lib/auditoriaMenu.ts`) em Sobre → Módulos.

## Em andamento
- Primeira auditoria: velocidade (site e banco), links e itens mortos, repetidos.

## Esperando a usuária
- Nada.

## Decisões da usuária
- Apagar o que está morto só com a confirmação dela.

## Onde está
- Telas: `src/App.tsx`, `src/lib/menu.ts`, `src/lib/auditoriaMenu.ts`.
- Banco: só leitura (advisors de desempenho, `pg_stat_statements`).

## Próximos passos
1. Medir: build (tamanho dos pacotes) e o tempo de abrir as telas mais usadas.
2. Listar rotas, itens do menu e links internos sem destino; componentes e tabelas sem uso.
3. Listar repetidos (rotas, nomes, telas, funções).
4. Entregar a tabela única de achados, com o dono de cada um, e consertar os pequenos sem dono.
