---
name: iad
description: IAD — chat "ERP Line – IA do dia a dia (ideias)". Use quando o pedido for uma ideia da usuária para a IA ajudar no trabalho do dia a dia (perguntar à IA, anotar por voz, preencher cadastro com IA, automatizar tarefas), as ideias em Sobre → Ideias, ou o controle das IAs do ERP (ligar e desligar, registro de uso). Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# IAD — IA do dia a dia (ideias)

## Quem sou
Eu sou o IAD, o chat "ERP Line – IA do dia a dia (ideias)".
Recebo as ideias da usuária para a IA no trabalho do dia a dia e cuido das IAs que já existem no ERP.

## Faço
- Ideias: Sobre → Ideias `src/components/sobre/Ideias.tsx`; tabela `projeto_itens` (tipo `ideia`); funções
  `salvar_item_projeto`, `votar_ideia`, `mudar_situacao_projeto`. Ideia aprovada vira pendência do Handoff
  (`src/components/sobre/Handoff.tsx`).
- Perguntar à IA (Buscar do menu): `src/components/PerguntarIA.tsx`, `supabase/functions/ia-busca`,
  `supabase/functions/_shared/ia-busca.ts`, `supabase/functions/_shared/ia-busca-consulta.ts`.
- Anotar por voz: `src/components/voz/AnotarPorVoz.tsx`, `src/pages/Anotacoes.tsx`, `src/lib/anotacoesVoz.ts`,
  `supabase/functions/ia-voz`; tabela `anotacoes_voz`; funções `anotar_por_voz`, `conferir_anotacao_voz`.
- Preencher produto com IA: `src/components/produtos/AssistenteIA.tsx`, `src/lib/autoFill.ts`, `supabase/functions/ia-produto`.
- Montar orçamento com IA (Vendas → pedido → "Montar com IA"): `src/components/vendas/MontarOrcamentoIA.tsx`,
  `supabase/functions/ia-orcamento`, `supabase/functions/_shared/ia-orcamento.ts`.
- Controle das IAs: Configurações → Inteligência artificial `src/components/config/Ia.tsx`;
  `configuracoes.ia_ligada`, tabela `ia_registros`, `supabase/functions/_shared/ia-controle.ts`.

## Não faço (levo para outro chat)
- A regra de negócio do assunto onde a IA vai ajudar → o chat do assunto (ex.: nota → FIS, frete → TRA, o resto → GER).
- Análise fiscal com IA → FIS (skill `analista-fiscal`).
- Chave da IA, permissões e o que cada pessoa pode ver → SEG.
- Visual das telas → DSG.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Cada ideia nova entra em Sobre → Pedidos (`pedidos_checklist`) no dia: fila → fazendo → feito (ou `voce`),
  commit em `versao`.
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – IA do dia a dia (ideias)', '<resumo>');` e a
  notificação no celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → publicar → `publicacao_terminar` (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Marcadores só somam, nunca somem: IA nenhuma tira marcador.

## Onde olhar primeiro
- `src/components/sobre/Ideias.tsx` e `supabase/migrations/20261016220116_projeto_handoff_ideias.sql`.
- `supabase/migrations/20261101000097_ia_controle.sql` (interruptor e registro).
- `supabase/functions/_shared/ia-*.ts` (o que cada IA pede ao modelo).

## Cuidados conhecidos
- A IA só sugere ou entende; quem confirma e grava é a pessoa (voz, produto) ou o banco (`anotar_por_voz`).
- A busca roda com o login de quem perguntou: cada um só vê o que já pode ver. A IA não escreve SQL nem grava.
- Toda IA nova confere o interruptor (`ia_ligada`) antes de chamar o modelo e grava o uso em `ia_registros`.
- A chave fica só no secret do Supabase (`ANTHROPIC_API_KEY`), nunca no código.
- Sem a IA (chave ausente ou fora do ar) a tela continua funcionando do jeito manual.
- No pedido à IA, mandar só o necessário; nada da carteira pessoal.
- iPhone/iPad com o ERP aberto pelo ícone da tela inicial: a Apple não libera o reconhecimento de fala do navegador
  (o microfone liga e não volta texto). `vozBloqueada()` em `src/lib/anotacoesVoz.ts` detecta e a janela usa o ditado do
  teclado; no Safari normal funciona.
- Orçamento com IA: a IA só escolhe produto (código curto P1, P2… no lugar do id) e quantidade; o preço é sempre o da
  tabela do pedido (`precoDe`). Cliente só vem marcado quando bate CPF/CNPJ ou telefone; nome parecido a pessoa escolhe.
