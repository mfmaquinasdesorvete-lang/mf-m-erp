# MEMORY — FAZ (ERP Line – O que só você faz)
Atualizado em 28/10/2026.

## Estado agora
- 31/10: virei "Acompanhamento e o que só você faz" (juntou o CNF, eb791d1). 18 chats: TIN → GER (Tiny do Dossiê
  vai para o GER), AUD → ENT (auditor e extratos com o ENT), DOC → REV. Regra 82ff394: tudo o que precisar dela vem com
  botões (AskUserQuestion). Título da sessão: "04 📋 FAZ · Acompanhamento e o que só você faz".
- 05/11 08:42: 9º resumo. Nada mudou (Tiny 16/10, inutilização 0, rosto 0, 0 conferidos; 165 'voce'). Em 04/11 ela
  disse "Já fiz" no Tiny e na inutilização sem ter feito; corrigiu para "Ainda não fiz". Conferir sempre no banco.
  Próximo: 06/11 08:40.
Primeira lista montada e mandada em 27/10 (`lista.md`, 9 tarefas de painel). Cobrança diária de manhã com send_later
(08:40 de Brasília); a cada disparo, conferir, avisar e agendar o dia seguinte.

## No ar
- `lista.md` (a lista com o passo a passo) e `sql/rodar-no-sql-editor.sql` (um arquivo só para o SQL Editor).

## Em andamento
- Cobrar e conferir as 9 tarefas abaixo.

## Esperando a usuária (conferido no banco em 27/10)
0c. GitHub Deploy key da Hostinger (só leitura) para o repositório virar privado (SEG, 29/10; esconde os nomes antigos
   dos commits). Conferir com o SEG.
0d. Segurança fase 1 (SEG, 29/10): duas etapas no GitHub, Supabase, Hostinger e nas 2 contas Google (só ela vê;
   vale o "feito" dela). Item 8 agora com o passo do WebAuthn no Supabase Auth → MFA (o SEG confere).
1. (feito 29/10) SQL Editor, 8 partes: conferido no banco; chats avisados (GER, FUN, ELO, PRD, REV, IAD).
2. Secrets das transportadoras (TRA, 23/10): `MELHORENVIO_TOKEN`, `RODONAVES_USUARIO/SENHA`, `BRASPRESS_USUARIO/SENHA`.
3. (saiu 31/10) Meu Pluggy: ela desistiu; o CAR propõe outro caminho para os extratos pessoais.
4. Olist: envio diário do OFX para o e-mail do ERP (ENT, 23/10). Conferir: extrato Olist novo depois de 08/10.
5. Inter SP: chaves da API em Configurações → Bancos (ENT, 23/10), se a conta existir. Conferir `inter_conexoes`.
6. WhatsApp oficial na Meta (IAD e GER, 23/10).
7. Telegram dos avisos: `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` + Ligar o robô (19/10).
8. Login com o rosto: cadastrar em Meu rosto (SEG); depois o SEG marca a data.
9. Conectar o Gmail do contador (FIS).

## Já resolvido
- 31/10 à noite: Hostinger reconectada no claude.ai (conferido pela lista de sites).
- 31/10: conector Supabase — ela escolheu "deixar como está" (pede aprovação); regra no CLAUDE.md (1bf9d5a): avisar
  no ERP e no celular antes de gravar e esperar 1–2 min. Item 0 fechado.
- 29/10: arquivo do SQL Editor rodado (1ª vez deu erro 23505 em giga_retestes na parte 7 e desfez tudo; corrigido em
  769d2cd). Conferido: 8 partes, unificadas = 16, ainda_com_par = 3. Avisados GER, FUN, ELO, PRD, REV e IAD.
- 28/10: FIS publicou o site (44e8ea8, com e529b35 e c289b2c), index.html conferido por ele.
- 28/10: Hostinger reconectada (conferido pela lista de sites); FIS avisado para publicar.

## Decisões da usuária
- 05/11 (botões, "sem tempo"): (1) os 'voce' só de olhar na tela, no ar e testados na demonstração viram "feito" sem a
  conferência dela; ficam com ela só decisões, arquivos e o que mexe com dinheiro ou nota. Pedi a lista a todos os chats
  (id + "Testado em dd/mm na demonstração: …"); eu junto num update único e ela aprova uma vez. (2) Resumo da manhã só
  com 1 a 3 coisas; o resto no painel. Lista juntada em `sql/fechar-conferidos.sql` (responderam: ENT 4, CLI 2, FUN 6, PRD 7, GER 7 = 26;
  sem itens: TEC, SOR, TRA, SEG, FIS, MYF, REV; faltam DSG, IAD, MKT). Pendente também: migração 20261101000205 do SOR (ajuste do REV) esperando aprovação dela. (3) Prazos Tiny/inutilização: quis fazer "agora comigo", mas ainda não fez.
- 27/10: este chat dá a lista do que só ela faz no Supabase, no GitHub e na Hostinger e fica cobrando.
- 27/10 (pelo ELO, af5913d): o FAZ é o único que manda o resumo da manhã: tarefas de painel, decisões que cada chat
  espera dela (o CNF me passa) e o que ficou pronto para conferir. Curto, o mais importante primeiro (por ora: o fiscal
  pendente e a virada do Tiny); o resto em `resumo-do-dia.md`.

## Onde está
- Fontes: `.claude/skills/*/MEMORY.md`, `pedidos_checklist` (`voce`), `publicacoes`, `supabase/migrations/`,
  `.github/workflows/`. Pedido no checklist: grupo "FAZ" (27/10).
- Conferência das migrações: extrair `create table` e `create function` de `supabase/migrations/*.sql` e procurar
  com `to_regclass` e `pg_proc` (em 27/10 só faltavam as do item 1).
- Secrets não dá para ler daqui (as funções pedem login): conferir pelo "Testar conexão" ou pelo uso (dados novos).

## Conferência (passada pelo CNF em 31/10)
- Painel "Conferência dos pedidos": https://claude.ai/artifact/KScwZP833YphEzZWdWFsGq (privado, da conta dela;
  atualizado até 28/10). Para continuar no mesmo link: Artifact read antes, depois publish com url.
- Rodada: select em pedidos_checklist (situacao, versao, detalhe, updated_at), chats_claude e publicacoes; git fetch da
  paineis-no-ar e da site; código no ar = hash da última linha "site <hash>" da branch site; para cada versao,
  `git merge-base --is-ancestor <versao> <hash>`. Parado = fila/fazendo há mais de 2 dias. Cobrar o dono por
  send_message (trailer Claude-Session do commit ou pelo assunto), no máximo 1 vez a cada 24 h.
- Estado 31/10: 123 'voce', 0 conferidos. 28/10: 466 feitos no ar (site 30da4ea), 300 com teste descrito, 166 sem
  (GER ~120 testando por área, FIS 19, IAD 17 já voltaram para fazendo em 29/10). 18 parados, todos respondidos.
- #628 (bf8f7e71, 'voce'): ela ver o Início com a semana certa depois da correção do GER.
- Gravações no checklist esperando a aprovação dela: SOR, CAR, GER, PRD, ELO (a5b511b7), DOC (FUN e IAD já entraram
  pelo SQL Editor). Juntar várias num update só serve para ela aprovar uma vez, nunca para fugir da confirmação.
- 01/11: ela quis o painel dos 'voce' por tipo. Publicado: https://claude.ai/artifact/2g2Tx4gYvdrejG2wpeS8BA (retrato de
  01/11; 143 sem os pessoais: tela 73, decidir 28, arquivo 22, botão 10, painel 10). Atualizar no mesmo link (scratchpad
  painel/pendencias.html não sobrevive: refazer pelo select de pedidos_checklist 'voce').
- 01/11: PRD e DSG responderam à cobrança. PRD: 9 viraram 'voce' (teste real com ela; dá para juntar num teste só:
  1 peça pelo Novo, 1 kit e o tubo de 6000 mm com receita de 420 mm; ver Esperando a usuária do PRD, 906de09). DSG:
  ced79940 feito, 9 viraram 'voce' (cada detalhe termina com "01/11: para conferir: …") e 42db5646 (barra de filtros)
  também espera ela. No resumo de 02/11: propor o teste juntado do PRD e 3 do DSG.
- 01/11 (botões): inutilização SP → pediu o passo a passo (dado no chat); Tiny T1 → "Depois".
- Prazo: os 2 botões do Tiny antes da virada de 09/11.
- 31/10: TRA fez e publicou (dd72e33b feito, c4f6883d): envios #25 e #26 entregues (conferido no banco), tela do envio
  com "Cliente retirou" no topo. Para ela conferir na tela (item 31 do para-conferir).
- 31/10: quadro de outubro consertado pelo ENT (0f75a2ae feito; conferido: #36 entregue, #616 cancelado). Falta: FIS
  decidir a NF 438 com ela e o contador (depois o GER cancela o #619) e as notas a emitir; dela: extratos da InfinitePay SC
  depois de 28/10 e do Mercado Pago SP depois de 05/2026 (no resumo). Item 32 do para-conferir: Vendas "Este mês".

## Dossiê MF SC (28/10, pelo ELO)
- Juntar no ERP tudo da MF SC desde 28/06/2022. FIS coordena (pedido 21a33e7d) com TIN, GER e ENT; eles me mandam o
  que só ela busca. Bloco "Dossiê MF SC" em `lista.md`; no resumo, só a próxima tarefa do bloco (uma por dia, a que
  destrava mais).
- 28/10: GER e ENT mandaram os extratos (D1 Unicred, D2 Olist, D3 InfinitePay, D4 Sicoob, D5 Inter SC). Falta FIS e TIN.
  Divisão: ENT importa os extratos antigos e explica as entradas; GER lança e concilia as saídas. Quando ela importar:
  avisar GER e ENT. TIN mandou T1 a T4; FIS mandou S1 (XML SEFAZ SC 06/2022–01/2025), C1 (contadores: recibos, balanços, folha) e G1
  (DARF/DAS e DAE pagos). Ordem do resumo (FIS): T1–T4 → S1 → C1 → G1 → D1–D5. Tela: Painel do contador → Dossiê da
  empresa. E1 (Gmail da contabilidade antiga, pelo ELO): ela disse "Depois", não cobrar até ela pedir; endereço da conta nunca
  no git. Destino: XML e guias → FIS; extratos → ENT e GER; Tiny → TIN.

## Auditor financeiro no resumo (28/10, pelo AUD)
- Rodada diária às 07:03 (Brasília). Ler a última linha: `select iniciada_em, total, novos, novos_alta, principal, erro
  from auditor_rodadas order by iniciada_em desc limit 1`. Se novos > 0: "Auditor: N achados novos (o mais importante:
  <principal>). Veja em Auditoria financeira." Se novos = 0: "nada novo". Erro preenchido: avisar o AUD.
  (Conferido em 28/10: rodou às 06:02, 10 achados, 0 novos, sem erro.)

## Do CNF (27/10)
- O CNF parou o aviso diário: o resumo é só meu. "Pronto para conferir": `para-conferir.md` (29 itens, 3 por dia; 10, 13, 14 e 16 saíram).
- "Precisa de você": 76 itens em `pedidos_checklist` (`voce`); os 11 pessoais ficam com o CAR (não ler). Mais antigos
  (19 e 20/10) primeiro. Consulta: `select left(id::text,8), grupo, pedido_em, item from pedidos_checklist
  where situacao='voce' order by pedido_em`.

- Decisão que espera por ela (no resumo): "Pode publicar" no GER da importação de extrato à prova de erro (5a14442).
  (a8d2634a, nfe-recebidas, já foi publicada em 27/10; falta só conferir na próxima nota de fornecedor.)

- Decisão dela (FIS): testar a NF-e em lote emitindo de verdade (b369f5d6).

## Próximos passos
0. Resumo diário 08:40 (send_later, a tarefa agendada tem o roteiro). Itens para conferir já mostrados: até o 20. Topo do resumo de 28/10
   (pedido do ELO, lista do FIS em 5827327): 1) 14 pedidos entregues sem nota (9 de outubro já pagos e 5 do Tiny,
   um de máquina): emitir a NF-e pelo pedido; 2) notas com valor menor que a venda; 3) parcelamento do Simples
   antigo sem pagamento depois de 10/2025 (conferir no e-CAC); 4) certidões vencidas. Depois a virada do Tiny e as
   tarefas de painel.
1. Na cobrança da manhã: conferir item 1 no banco; o que estiver feito sai da lista e o chat dono recebe send_message.
2. Depois do item 1: avisar GER, FUN, ELO, PRD e REV (send_message, sessao em `chats_claude`).

## Memória — antes chat CNF (juntado ao FAZ em 31/10/2026)
O chat CNF foi encerrado e o assunto dele passou para este chat. Abaixo, a skill/memória dele como estava; o que falar "eu" ou "CNF" agora é o FAZ.

## MEMORY — CNF (ERP Line – Conferência dos pedidos)
Atualizado em 27/10/2026.

### Estado agora
Rodada de fechamento (desde 27/10): "feito" só vale depois de teste com tarefa real, descrito no detalhe.
Em 27/10 havia 450 "feito", só 12 com o teste descrito e nenhum conferido pela usuária. Cobrei os 19 chats donos
dos 438 sem teste, cada um com a lista de ids dele. Ainda espero as respostas.
A lista curta de 20 para ela conferir primeiro (dinheiro, nota, cliente) foi para o FAZ.
Todos os 22 chats têm MEMORY.md (conferido em 27/10).

### No ar
- Painel "Conferência dos pedidos" (artifact): números no alto, um cartão por chat, a lista do que foi cobrado e as
  respostas. É atualizado no mesmo link a cada rodada.
- Rodada: ler `pedidos_checklist`, `chats_claude` e `publicacoes` (só select), fazer `git fetch` da `paineis-no-ar` e
  da `site`, conferir cada commit de `versao` com `git merge-base --is-ancestor` e cobrar o chat dono com send_message.

### Em andamento
- Respostas dos chats sobre o teste dos "feito" (cobrados em 27/10). Conferir no detalhe se ficou
  "Testado em dd/mm: …" e quantos voltaram para "fazendo".

### Esperando a usuária
- Conferir os 20 da lista curta (com o FAZ) e marcar conferido em Sobre → Pedidos.
- Os 76 em "precisa de você" (27/10) agora vão no resumo da manhã do FAZ. Eu não aviso mais.

### Decisões da usuária
- Este chat só confere: não muda a situação nem os dados dos pedidos dos outros chats. Quem muda é o chat dono.
- 27/10: não mando aviso diário. Quem cobra a usuária é o FAZ: passo para ele o que espera por ela e o que ficou pronto.
- 27/10: rodada de fechamento: "feito" só com teste de tarefa real descrito no detalhe.
- Cobrança do cliente: não entra conta sem pagamento, de pedido cancelado, sem NF de venda, nem parcela no cartão.
- Compras de peças sempre com ordem de compra. Quando o valor diverge, a OC fica concluída, com o marcador
  "Comprado por valor divergente" e mostrando o preço da ordem e o preço comprado.
- Fornecedores homologados levam o selo verde HOMOLOGADO, trazido da categoria Homologado do Tiny.

### Onde está
- Telas: `src/components/sobre/PedidosChecklist.tsx`, `CentralChats.tsx`, `ResumoSobre.tsx`.
- Banco: `pedidos_checklist`, `chats_claude`, `publicacoes`, `aviso_claude()`.
- Código no ar: a última linha da branch `site` se chama "site <hash>". Os commits "site …" são da branch site e
  não entram no histórico do código.

### Próximos passos
1. Rodada a cada pedido da usuária ou a cada aviso. Não cobrar o mesmo item do mesmo chat antes de 24 horas.
2. Para o pedido "ERP pesado", conferir se o chat principal gravou a situação nova.
3. Conferir o index.html da Hostinger: a rede deste chat bloqueia o site, então isso fica com quem publica.
