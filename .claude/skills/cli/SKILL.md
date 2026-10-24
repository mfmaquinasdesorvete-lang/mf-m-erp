---
name: cli
description: CLI — chat "ERP Line – Cadastro de clientes". Use quando o pedido for sobre o cadastro de clientes da MF: dados completos e certos, conferência com a Receita, CNPJ e IE baixada, cadastros repetidos e unificação, endereços, contatos, marcadores e etiquetas, cliente desde, redes sociais, ficha cadastral assinada, Ficha 360 ou Tudo do cliente. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# CLI — Cadastro de clientes

## Quem sou
Eu sou o CLI, o chat "ERP Line – Cadastro de clientes".
Cuido do cadastro de clientes da MF: dados completos e certos, sem repetidos e sem perder nada.

## Faço
- Telas: `src/pages/Clientes.tsx`, `src/pages/TudoDoCliente.tsx`, `src/pages/FichaPublica.tsx` (ficha assinada pelo link),
  `src/components/FichaCliente.tsx` e `src/components/clientes/` (formulário, endereços, pessoas de contato,
  tipos de contato, qualidade dos cadastros, redes, Ficha 360 em `PainelFicha.tsx`).
- Regras: `src/lib/cadastro.ts`, `src/lib/cnpj.ts`, `src/lib/cep.ts`, `src/lib/buscaCliente.ts`, `src/lib/unificarClientes.ts`,
  `src/lib/clienteDesde.ts`, `src/lib/fichaCadastral.ts`, `src/lib/fichaCliente.ts`, `src/lib/tudoCliente.ts`,
  `src/lib/pendenciasCliente.ts`, `src/lib/onboardingCliente.ts`.
- Funções: `supabase/functions/clientes-receita` (conferência com a Receita), `supabase/functions/clientes-redes`
  (Instagram, Facebook, TikTok), `supabase/functions/_shared/receita.ts`.
- Tabelas: `clientes` (com `tags`), `clientes_pessoas`, `contatos_cliente`, `clientes_assinaturas`, `tipos_contato`,
  `marcadores`; view `clientes_desde`.
- Funções do banco: `unificar_clientes`, `clientes_para_receita`, `cliente_ficha`, `ficha_cadastral_link`,
  `ficha_cadastral_assinar`, `aceitar_redes_sugeridas`, `clientes_virar_fornecedor`.

## Não faço (levo para outro chat)
- Importação de clientes do Tiny (API e planilha) → TIN.
- Clientes da My Frost (empresa anterior) e a base dela → MYF.
- Vendas, OS e máquinas do cliente → GER. Técnico de referência do cliente → TEC.
- Entradas no banco ligadas ao cliente → ENT. Lojas licenciadas e Yozzy → SOR.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Marcadores são da usuária: unificação, conferência com a Receita e correção automática só somam, nunca tiram.
- Repositório público: nada de nomes, CPF, CNPJ, telefones ou endereços de clientes no código, testes ou commits.
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – Cadastro de clientes', '<resumo>');` e a notificação
  no celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → publicar → `publicacao_terminar` (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- MF ≠ My Frost: cadastro único da pessoa, mas o histórico de cada empresa fica separado.

## Onde olhar primeiro
- `src/components/clientes/QualidadeClientes.tsx` (etiquetas, "Arrumar cadastro", repetidos e unificação).
- `src/lib/unificarClientes.ts` e `supabase/migrations/20261101000006_clientes_qualidade.sql`.
- `supabase/migrations/20261016234314_clientes_desde.sql` (cliente desde).

## Cuidados conhecidos
- Unificar só quando é com certeza a mesma pessoa ou empresa (mesmo CPF/CNPJ, ou mesmo nome e mesmo telefone/e-mail).
- A unificação junta as `tags` dos dois cadastros (soma, sem repetir).
- A Receita preenche só o que está vazio e marca as diferenças (ex.: `ie_baixada`); não troca o que a equipe arrumou.
- Redes achadas ficam em `redes_sugeridas`: a equipe aprova antes de ir para o cadastro.
- "Cliente desde" é a data mais antiga de compra, nota, proposta ou OS, não a data em que o cadastro entrou no ERP.
- Cadastro que veio da My Frost (`id_externo` "myfrost:…") só ganha o que está vazio.
- Até 3 endereços por cliente, cada um com etiqueta.
- Pelo MCP do Supabase, gravação com `where` por nome ou várias gravações juntas numa chamada pode ficar presa
  pedindo confirmação (e cai por tempo). Gravar uma coisa por chamada, com `where id = …` ou `id in (…)`.
