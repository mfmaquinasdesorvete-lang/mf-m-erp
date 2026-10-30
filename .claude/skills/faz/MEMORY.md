# MEMORY — FAZ (ERP Line – O que só você faz)
Atualizado em 28/10/2026.

## Estado agora
- 30/10 08:41: 3º resumo. Feito desde ontem: SQL Editor (8 partes) e 16 páginas do ELO. Pendente: conector, deploy
  key, duas etapas, rosto (0 fatores), T1 (Tiny 16/10), inutilização SP (prazo 10/11). 121 'voce'. Para-conferir
  mostrados 1 a 9, nenhum conferido. Próximo: 31/10 08:40.
Primeira lista montada e mandada em 27/10 (`lista.md`, 9 tarefas de painel). Cobrança diária de manhã com send_later
(08:40 de Brasília); a cada disparo, conferir, avisar e agendar o dia seguinte.

## No ar
- `lista.md` (a lista com o passo a passo) e `sql/rodar-no-sql-editor.sql` (um arquivo só para o SQL Editor).

## Em andamento
- Cobrar e conferir as 9 tarefas abaixo.

## Esperando a usuária (conferido no banco em 27/10)
0b. Escolher a permissão de gravação do conector Supabase (SEG, 29/10): deixar "pedir aprovação" ou "Sempre
   permitir" só em execute_sql e apply_migration. Conferir: uma gravação simples minha passa sem cartão.
0c. GitHub Deploy key da Hostinger (só leitura) para o repositório virar privado (SEG, 29/10; esconde os nomes antigos
   dos commits). Conferir com o SEG.
0d. Segurança fase 1 (SEG, 29/10): duas etapas no GitHub, Supabase, Hostinger e nas 2 contas Google (só ela vê;
   vale o "feito" dela). Item 8 agora com o passo do WebAuthn no Supabase Auth → MFA (o SEG confere).
1. (feito 29/10) SQL Editor, 8 partes: conferido no banco; chats avisados (GER, FUN, ELO, PRD, REV, IAD).
2. Secrets das transportadoras (TRA, 23/10): `MELHORENVIO_TOKEN`, `RODONAVES_USUARIO/SENHA`, `BRASPRESS_USUARIO/SENHA`.
3. Secrets do Meu Pluggy (CAR, 22/10): `PLUGGY_PESSOAL_CLIENT_ID/SECRET`.
4. Olist: envio diário do OFX para o e-mail do ERP (ENT, 23/10). Conferir: extrato Olist novo depois de 08/10.
5. Inter SP: chaves da API em Configurações → Bancos (ENT, 23/10), se a conta existir. Conferir `inter_conexoes`.
6. WhatsApp oficial na Meta (IAD e GER, 23/10).
7. Telegram dos avisos: `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` + Ligar o robô (19/10).
8. Login com o rosto: cadastrar em Meu rosto (SEG); depois o SEG marca a data.
9. Conectar o Gmail do contador (FIS).

## Já resolvido
- 29/10: arquivo do SQL Editor rodado (1ª vez deu erro 23505 em giga_retestes na parte 7 e desfez tudo; corrigido em
  769d2cd). Conferido: 8 partes, unificadas = 16, ainda_com_par = 3. Avisados GER, FUN, ELO, PRD, REV e IAD.
- 28/10: FIS publicou o site (44e8ea8, com e529b35 e c289b2c), index.html conferido por ele.
- 28/10: Hostinger reconectada (conferido pela lista de sites); FIS avisado para publicar.

## Decisões da usuária
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
0. Resumo diário 08:40 (send_later, a tarefa agendada tem o roteiro). Itens para conferir já mostrados: 1 a 9. Topo do resumo de 28/10
   (pedido do ELO, lista do FIS em 5827327): 1) 14 pedidos entregues sem nota (9 de outubro já pagos e 5 do Tiny,
   um de máquina): emitir a NF-e pelo pedido; 2) notas com valor menor que a venda; 3) parcelamento do Simples
   antigo sem pagamento depois de 10/2025 (conferir no e-CAC); 4) certidões vencidas. Depois a virada do Tiny e as
   tarefas de painel.
1. Na cobrança da manhã: conferir item 1 no banco; o que estiver feito sai da lista e o chat dono recebe send_message.
2. Depois do item 1: avisar GER, FUN, ELO, PRD e REV (send_message, sessao em `chats_claude`).
