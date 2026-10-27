# MEMORY — FAZ (ERP Line – O que só você faz)
Atualizado em 27/10/2026.

## Estado agora
Primeira lista montada e mandada em 27/10 (`lista.md`, 9 tarefas de painel). Cobrança diária de manhã com send_later
(08:40 de Brasília); a cada disparo, conferir, avisar e agendar o dia seguinte.

## No ar
- `lista.md` (a lista com o passo a passo) e `sql/rodar-no-sql-editor.sql` (um arquivo só para o SQL Editor).

## Em andamento
- Cobrar e conferir as 9 tarefas abaixo.

## Esperando a usuária (conferido no banco em 27/10)
1. SQL Editor: `sql/rodar-no-sql-editor.sql` — `config_ajustes` (GER), `recibos.de_funcionario` + gatilho e regra
   (FUN; achado do FAZ), `paginas_claude` (ELO; o ELO grava as 16 páginas depois), gatilho `produto_variacao` (PRD),
   3 índices repetidos (REV). Conferir: `to_regclass`, `pg_trigger`, coluna em `information_schema.columns`, `pg_indexes`.
2. Secrets das transportadoras (TRA, 23/10): `MELHORENVIO_TOKEN`, `RODONAVES_USUARIO/SENHA`, `BRASPRESS_USUARIO/SENHA`.
3. Secrets do Meu Pluggy (CAR, 22/10): `PLUGGY_PESSOAL_CLIENT_ID/SECRET`.
4. Olist: envio diário do OFX para o e-mail do ERP (ENT, 23/10). Conferir: extrato Olist novo depois de 08/10.
5. Inter SP: chaves da API em Configurações → Bancos (ENT, 23/10), se a conta existir. Conferir `inter_conexoes`.
6. WhatsApp oficial na Meta (IAD e GER, 23/10).
7. Telegram dos avisos: `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` + Ligar o robô (19/10).
8. Login com o rosto: cadastrar em Meu rosto (SEG); depois o SEG marca a data.
9. Conectar o Gmail do contador (FIS).

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

## Próximos passos
0. A partir de 28/10 08:40: resumo único da manhã (a tarefa agendada já tem o roteiro). Topo do resumo de 28/10
   (pedido do ELO, lista do FIS em 5827327): 1) 14 pedidos entregues sem nota (9 de outubro já pagos e 5 do Tiny,
   um de máquina): emitir a NF-e pelo pedido; 2) notas com valor menor que a venda; 3) parcelamento do Simples
   antigo sem pagamento depois de 10/2025 (conferir no e-CAC); 4) certidões vencidas. Depois a virada do Tiny e as
   tarefas de painel.
1. Na cobrança da manhã: conferir item 1 no banco; o que estiver feito sai da lista e o chat dono recebe send_message.
2. Depois do item 1: avisar GER, FUN, ELO, PRD e REV (send_message, sessao em `chats_claude`).
