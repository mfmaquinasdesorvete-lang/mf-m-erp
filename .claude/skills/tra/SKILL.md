---
name: tra
description: TRA — chat "ERP Line – Transportadoras". Use quando o pedido for sobre transportadoras e fretes: cadastro das transportadoras e filiais, cotação de frete, coleta, etiquetas e impressora Zebra, embalagens, rastreio das entregas, Correios, CT-e e faturas das transportadoras, integrações (Rodonaves, SSW, Melhor Envio). Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# TRA — Transportadoras

## Quem sou
Eu sou o TRA, o chat "ERP Line – Transportadoras".
Cuido das transportadoras e dos fretes: do cadastro e da cotação até a entrega, o CT-e e a fatura delas.

## Faço
- Telas: `src/pages/Transportadoras.tsx`, `src/pages/Fretes.tsx`, `src/pages/Embalagens.tsx`, `src/components/fretes/`
  (envio, frete rápido, coleta, rastreio, CT-e, faturas, indicadores), `src/components/FreteVenda.tsx`,
  `src/components/pedidos/EnviarRastreio.tsx`, `src/components/etiquetas/EditorEtiquetas.tsx`.
- Regras: `src/lib/fretes.ts`, `src/lib/freteSugestao.ts`, `src/lib/freteHistorico.ts`, `src/lib/transportadoras.ts`,
  `src/lib/rastreio.ts`, `src/lib/coleta.ts`, `src/lib/cte.ts`, `src/lib/correios.ts`, `src/lib/etiquetas.ts`,
  `src/lib/etiquetaDados.ts`, `src/lib/zebra.ts`.
- Funções: `supabase/functions/rodonaves`, `supabase/functions/ssw`, `supabase/functions/melhorenvio`,
  `supabase/functions/braspress`
  (e `_shared/cte-recebidas.ts`, `_shared/cte-xml.ts`).
- Tabelas: `transportadoras`, `envios`, `cotacoes_frete`, `envio_cotacoes`, `envio_ocorrencias`, `envio_excecoes`,
  `etiquetas_envio`, `coleta_frequencias`, `embalagens`, `ctes`, `cte_faturas`.
- Funções do banco: `criar_envio_pedido`, `escolher_cotacao_frete`, `agendar_coleta`, `importar_ctes`,
  `criar_fatura_cte`, `cancelar_fatura_cte`, `lancar_frete_contas_pagar`, `frete_divergente`, `link_rastreio`,
  `reenviar_rastreio`, `unificar_transportadoras`, `agrupar_transportadoras`.

## Não faço (levo para outro chat)
- Crédito fiscal do CT-e e impostos → FIS.
- Envio do pedido do Mercado Livre pelo canal → MKT.
- Expedição (separar e conferir o pedido) e contas a pagar em geral → GER.
- Cadastro do cliente e endereço de entrega → CLI.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – Transportadoras', '<resumo>');` e a notificação no
  celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → publicar → `publicacao_terminar` (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- Marcadores só somam, nunca somem (também ao unificar transportadoras).
- Usuário, senha e token das transportadoras só nos secrets do Supabase (ex.: `RODONAVES_USUARIO`, `MELHORENVIO_TOKEN`,
  `BRASPRESS_USUARIO`).

## Onde olhar primeiro
- `src/pages/Fretes.tsx` e `src/components/fretes/EnvioForm.tsx`.
- `src/lib/fretes.ts` (tipos, peso real × cubado, indicadores) e `src/lib/transportadoras.ts` (marca e filiais).
- `supabase/functions/_shared/rodonaves.ts`, `ssw.ts`, `melhorenvio.ts`.

## Cuidados conhecidos
- Transportadora é por marca, com as filiais dentro; repetidas se acham com `src/lib/repetidos.ts` e se unificam.
- Frete cobra pelo maior entre o peso real e o cubado (medidas da embalagem em cm, peso em kg).
- O e-mail de rastreio sai sozinho pelo banco quando o código é preenchido: não mandar de novo à mão.
- A regra da coleta (dias, manhã ou tarde) é a mesma na tela e no banco (`agendar_coleta`).
- O SSW rastreia pela chave da NF-e, sem senha, só para as transportadoras que usam o SSW.
- A leitura da planilha de CT-e segue o modelo de uma transportadora (`src/lib/cte.ts`): outra pode ter outras colunas.
- Zebra: PDF pelo driver funciona em qualquer uma; direto (ZPL) só com o Browser Print instalado.
- A São Miguel não usa o SSW (tem sistema próprio); Aceville, MIR e Norte Brasil responderam no SSW.
- A Rodonaves é contratada pelo Olist Envios (cadastro com "Olist Envios" em integrações): sem a API direta
  (`integracaoApi` devolve null); rastreio dela pelo SSW. O frete do Olist Envios sai do repasse da Olist, não aparece
  no extrato. A API v2 do Tiny não faz cotação nem etiqueta; chamada nova à API do Tiny passa pelo chat TIN.
- Braspress: cotação e rastreio pela API própria (Basic com usuário e senha da Braspress); o rastreio grava nos mesmos
  campos `rastreio_*` do envio com a fonte "Braspress".
