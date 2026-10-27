# MEMORY — DOC (ERP Line – Documentos (.md))
Atualizado em 27/10/2026.

## Estado agora
Os 5 documentos pedidos estão prontos em `docs/`, todos gerados do código por um comando só.
Nada fica esperando: os documentos `.md` não vão para o site, então não há nada para publicar.

## No ar (na paineis-no-ar)
- `docs/modulos.md`: todas as áreas e telas na ordem do menu, quem pode abrir e os processos (ecebaf7).
- `docs/guia-por-perfil.md`: para cada perfil, as telas, as ações, os atalhos do celular e os passos nos processos (de4b14f).
- `docs/perguntas-frequentes.md`: 35 perguntas do dia a dia com o passo a passo (6145e5a).
- `docs/acesso-novo.md`: como dar acesso a alguém novo, perfis, 1º acesso e senha esquecida (e965cf0).
- `docs/glossario.md`: 53 termos em palavras simples, com as telas onde aparecem (0cb45b7).
- `docs/README.md`: o índice dos documentos (sai sozinho).
- Os 5 pedidos estão como feito no Sobre → Pedidos (grupos "Chats do Claude" e "Documentos", de 23/10).

## Em andamento
- Nada.

## Esperando a usuária
- Aprovar a gravação no Supabase: falta escrever no detalhe dos 5 pedidos (Sobre → Pedidos) o teste de 27/10
  (gerado de novo do código atual, links e dados sensíveis conferidos → passou). A gravação pediu confirmação duas vezes
  e ninguém respondeu.
- Já foi oferecido publicar algum documento como página (Artifact) para mostrar a alguém de fora; ela ainda não pediu.

## Decisões da usuária
- Quis todos os documentos sugeridos, feitos em sequência e sem pressa (23/10).
- Os documentos ficam em `docs/`, em português simples e sem dados da empresa (o repositório é público).
- Telas e processos só da conta master (Retaguarda, carteira pessoal, lojas licenciadas) ficam fora dos documentos.
- Tela cujo texto fala de dado sensível da empresa fica fora (lista `TELAS_FORA_DOS_DOCS` em `scripts/docs/base.mjs`);
  em 27/10 entrou a do histórico de ex-funcionários de antes da MF.
- Rodada de fechamento (27/10): nada novo sem ela pedir; "feito" só depois de testar (aqui: gerar de novo do código atual,
  conferir links e dados sensíveis).

## Onde está
- Gerador: `scripts/gerar-docs.mjs` (rodar na raiz: `npx tsx scripts/gerar-docs.mjs`).
- Um arquivo por documento em `scripts/docs/` e a base comum em `scripts/docs/base.mjs`.
- Fontes: `src/lib/menu.ts` (lido como texto), `src/lib/modulos.ts`, `src/lib/modulosDetalhe.ts`,
  `src/lib/permissoes.ts` e `src/lib/esquemas.ts`.
- As listas que escrevi à mão: as perguntas (`perguntas-frequentes.mjs`), as definições do glossário (`glossario.mjs`)
  e qual função dos esquemas cada perfil faz (`FUNCOES_DO_PERFIL` em `guia-por-perfil.mjs`).
- Banco: só `pedidos_checklist` (para o Sobre → Pedidos). Funções do Supabase: nenhuma.

## Próximos passos
1. Quando o menu, as telas ou os processos mudarem, gerar de novo, conferir o diff (sem dados da empresa) e os links.
2. Se o gerador parar com erro de tela, parte ou processo que sumiu, rever a pergunta ou o termo e não tirar a conferência.
3. Ideias para oferecer depois: um guia de cada processo com desenho, e um "o que mudou no ERP" por semana tirado do git.
