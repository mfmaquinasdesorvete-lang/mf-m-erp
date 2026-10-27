# MEMORY — ELO (ERP Line – chat principal)
Atualizado em 27/10/2026.

## Estado agora
São 22 chats ativos (REV, AUD e FAZ, os mais novos, em 27/10), cada um com sigla, skill e memória. Desde 24/10 a fila de publicação confere a Hostinger
antes de dizer "publicado". O trabalho grande em curso é deixar o ERP menos dependente do código.

## No ar
- Siglas e skills de todos os chats. PRD e FUN são os mais novos. Migração `20261101000118_chats_sigla`.
- Regra "só dizer publicado depois de conferir o index.html da Hostinger" no CLAUDE.md (9f0df12).
- Levantamento do que só muda pelo código, com 254 itens e a ordem de trabalho, em `.claude/configuravel/` (08d3f08).
- Aba Sobre → Conhecer o ERP → Páginas (só admin): as páginas que os chats fizeram, com o botão para abrir. Os links
  ficam na tabela `paginas_claude` (o repositório é público). Migração `20261101000173_paginas_claude`.
- Memória geral em `MEMORY.md` e modelo em `.claude/memoria-modelo.md`. Os 19 chats já têm a sua `MEMORY.md` (25/10).

## Em andamento
- Menos dependente do código. Ordem que a usuária escolheu:
  1. base em Configurações (GER): Prazos e padrões + Mensagens ao cliente;
  2. mensagens ao cliente (GER, TRA, TEC);
  3. o que mexe com dinheiro;
  4. prazos dos alertas;
  5. o resto.
  O GER já gravou o catálogo e a tabela `config_ajustes` (881c944). A tabela só pode ser criada pela usuária no SQL Editor.
  O TRA e o TEC entram quando a base estiver no ar.

## Esperando a usuária
- ELO: `paginas_claude` está no SQL único do FAZ (item 1). Quando a tabela existir, gravar as 16 páginas
  (inserts em paginas-claude.sql do scratchpad: refazer a partir da lista do Raio-X/artifacts). Site da aba já publicado.
- GER: rodar no SQL Editor a criação da tabela `config_ajustes`, base de Prazos e padrões.
- PRD: aprovar no chat do PRD a gravação da migração das variações de produto.
- MKT: estoque na SC e dados de 5 peças para os anúncios novos.
- IAD: "Pode publicar" do Resumir com IA dos documentos.

## Decisões da usuária
- Auditor Financeiro IA (27/10): chat AUD, só leitura, começando pela MF; sorveterias depois, com o SOR.
- Um chat por assunto. Chats e skills curtos, sem dados da empresa no repositório.
- O ELO pode publicar o site pelos outros chats quando a Hostinger deles cair, sempre com o "Pode publicar".
- Nome das pessoas: o do cadastro do ERP. O texto original do banco e da nota fica como veio.
- WordPress não serve para o ERP.

## Onde está
- `.claude/agents/elo.md` (siglas e formato da skill), `.claude/skills/<sigla>/` (SKILL.md e MEMORY.md).
- Tabelas: `chats_claude`, `pedidos_checklist`, `publicacoes`.
- Telas: `src/components/sobre/Chats.tsx`, `CentralChats.tsx` e `PaginasClaude.tsx`.
- Página nova feita para a usuária (artifact do ERP): acrescentar uma linha em `paginas_claude`.

## Próximos passos
- Esperando respostas: FIS, GER, CAR e SOR sobre telas com período abrindo em "Esta semana" (27/10).
1. De tempos em tempos, conferir se as memórias continuam sem dados da empresa e trazer para a raiz o que vale para todos.
2. Cobrar o GER pela base em Configurações e avisar o TRA e o TEC quando ela estiver no ar.
