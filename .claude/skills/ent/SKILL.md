---
name: ent
description: ENT — chat "ERP Line – Entradas e auditor financeiro" (juntou o AUD em 31/10). Use quando o pedido for sobre de onde veio um dinheiro que entrou nos bancos da MF, entradas sem dono, conciliar a entrada com venda, nota ou conta a receber, extrato que chega sozinho, ou sobre o Auditor Financeiro IA (rodada diária, venda sem recebimento, recebimento sem venda, taxa de cartão, despesa fora do padrão, conta sem comprovante, extrato na conta errada, fila de alertas, Auditoria financeira). Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# ENT — Entradas nas contas da MF

## Quem sou
Eu sou o ENT, o chat "ERP Line – Entradas nas contas da MF".
Descubro de onde veio cada entrada nos bancos da MF e ligo ao pedido, à nota ou à conta a receber.

## Faço
- Entradas grandes sem dono (Retaguarda → Entradas): `src/pages/EntradasGrandes.tsx`.
- Conciliação das entradas: `src/pages/Conciliacao.tsx`, `src/lib/conciliacao.ts`, `src/lib/conciliacaoLote.ts`,
  `src/components/financeiro/ConciliacaoLote.tsx`, `src/components/vendas/ConciliarVendas.tsx`.
- Extratos: `src/lib/extrato.ts`, `src/lib/extratoPdf.ts`, `src/lib/extratoTipos.ts`; extrato automático pelo Inter
  (`supabase/functions/inter`, `src/components/financeiro/Inter.tsx`) e pelo Open Finance
  (`supabase/functions/openfinance`, `src/components/financeiro/OpenFinance.tsx`).
- Recebimentos por link e cartão: `supabase/functions/infinitepay` (InfinitePay e Mercado Pago), `src/lib/infinitepay.ts`.
- Tabelas: `extrato_lancamentos`, `extrato_importacoes`, `conciliacao_regras`, `contas_receber`, `contas_bancarias`,
  `inter_conexoes`, `openfinance_conexoes`.
- Funções do banco: `conciliar_automatico`, `conciliar_lancamento`, `conciliar_em_lote`, `conciliar_vendas`,
  `receber_venda_do_extrato`, `receber_vendas_do_extrato`, `desfazer_conciliacao`, `vincular_lancamento`,
  `importar_extrato`, `importar_extrato_inter`, `importar_extrato_openfinance`, `taxa_infinitepay`.

## Não faço (levo para outro chat)
- Saídas (contas a pagar, fornecedores, gastos), DRE e o resto do financeiro → GER.
- Pagamentos das lojas My Frost Sorveterias e Yozzy na carteira deles → SOR. Carteira pessoal → CAR.
- Vendas do Mercado Livre (o pedido e o pós-venda) → MKT.
- Recebimentos que vieram do Tiny ("Decidir") → TIN. Nota fiscal e impostos → FIS.
- Cadastro do cliente pagador (dados, repetidos) → CLI.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – Entradas nas contas da MF', '<resumo>');` e a
  notificação no celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → publicar → `publicacao_terminar` (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- Marcadores só somam, nunca somem.
- MF ≠ My Frost: entrada das sorveterias ou da carteira pessoal não entra na conciliação nem nos painéis da MF.
- Ligar entrada a conta só com certeza; na dúvida, sugerir e a usuária confirma.

## Onde olhar primeiro
- `src/pages/EntradasGrandes.tsx` e `src/pages/Conciliacao.tsx`.
- `src/lib/conciliacao.ts` (sugestão de par) e `src/lib/conciliacaoLote.ts` (por favorecido e regras).
- `supabase/migrations/20261018035548_conciliar_vendas.sql`.

## Cuidados conhecidos
- Cada linha do extrato tem identificador estável: importar de novo não pode duplicar.
- Transferência entre contas da própria MF não é receita: a outra ponta é a mesma (conta uma vez só).
- Entrada grande sem dono: a anotação de quem é fica na própria linha do extrato (`observacao`).
- Taxa da InfinitePay sem número cadastrado é desconhecida (null), não zero.
- O nome do pagador sai da descrição do banco, e cada banco escreve de um jeito (ver `src/lib/conciliacaoLote.ts`).
- Valor digitado com `lerValor` (`src/lib/auditoriaBusca.ts`); centavos arredondados.
- Datas no horário de Brasília (`hoje()` em `src/lib/format.ts`); o banco roda em UTC.
- Nome da família no ERP: o que o ERP escrever (anotação, conta, cadastro) usa o nome padrão que a usuária definiu
  (está no banco); o texto original do extrato e as regras que reconhecem os nomes antigos não mudam. Nomes antigos
  não entram no repositório.
- Par de transferência só pelo valor engana: confira que as duas pontas são da MF (nome ou CNPJ), não um terceiro
  com o mesmo valor no mesmo dia.
- O nome antigo da MF (mesmo CNPJ) aparece em extratos antigos: é a própria MF, não cliente.
- Cartão adiantado cai no dia útil seguinte à venda; o depósito vem líquido (taxa de 3% a 15%). Procure a venda ou a OS
  do dia anterior.
- Pix de cliente pode vir de outra empresa ou do dono; valor exato ao centavo e data batendo é forte, mas confirme com
  ela antes de ligar quando o nome não bate.
- Gravação com anotação longa às vezes trava no Supabase (pede confirmação que não chega): use anotação curta.
- Link de cartão com juros pagos pelo cliente (3x 7,01%, 5x 8,80%): o cliente paga mais, a InfinitePay tira a taxa
  e a MF recebe o valor do link (o pedido). Não lançar taxa para a MF nesse caso; o depósito cai no dia útil seguinte.
- Link do pedido inteiro (várias parcelas) não tem conta ligada: a baixa é em todas as parcelas abertas do pedido.
- Rodar `conciliar_automatico_interno` na conta inteira também passa nas saídas antigas, que se ligam só pelo valor
  (já ligou uma compra a outra conta de mesmo valor). Depois de rodar, conferir o que ligou e desfazer o que não for.

## Também faço — antes chat AUD (juntado ao ENT em 31/10/2026)
O chat AUD foi encerrado e o assunto dele passou para este chat. Abaixo, a skill/memória dele como estava; o que falar "eu" ou "AUD" agora é o ENT.

## AUD — Auditor financeiro

### Quem sou
Eu sou o AUD, o chat "ERP Line – Auditor financeiro".
Faço o Auditor Financeiro IA: um controller virtual que investiga os números da MF, cruza as fontes, acha o que não
bate e mostra as provas. Só leitura: nunca altera lançamento, baixa, pagamento ou conciliação.

### Faço
- **Conferências fixas (o motor):** cada conferência é uma conta feita no banco ou em `src/lib/`, que devolve o
  valor, a quantidade e os registros de origem. Parto do que já existe em `src/lib/auditoria.ts`
  (`calcularExcecoes`, `TIPOS`: duplicidade, sem documento, baixa sem extrato, recebimento sem origem, recebido a
  menor, parcelas diferentes do pedido, NF sem lançamento e outras) e na tela `src/pages/Auditoria.tsx`.
- **Conferências novas da fase 1:** venda sem recebimento e recebimento sem venda; bruto × taxa × líquido do cartão
  (Olist, InfinitePay, Mercado Pago); despesa fora do padrão do histórico; conta paga sem comprovante.
- **Chat do auditor:** no padrão do Perguntar à IA (`supabase/functions/ia-busca/`, `_shared/ia-busca.ts`,
  `_shared/ia-busca-consulta.ts`): a IA só escolhe a conferência e o período; a conta é do código; a busca roda com o
  login de quem perguntou; uso registrado e interruptor em `_shared/ia-controle.ts`.
- **Resposta no formato fixo:** Resumo, Divergências, Evidências (registros com link), Causas possíveis (fato ×
  hipótese), Impacto (confirmado, estimado ou sem como medir), Recomendação, Confiabilidade (completa, parcial ou
  insuficiente, e as fontes).
- **Fila de alertas:** Novo → Em análise → Resolvido ou Descartado, com justificativa, responsável e histórico;
  sem alerta repetido. Limites em Configurações → Prazos e padrões (`config_ajustes`, `_shared/ajustes.ts`).

### Não faço (levo para outro chat)
- De onde veio cada entrada nos bancos e a ligação com a venda → ENT.
- Lançar, baixar, conciliar, contas a pagar e receber, DRE e bancos → GER (eu aponto, ele corrige).
- Impostos, notas e apuração → FIS. Clientes → CLI. Produtos e custo do produto → PRD.
- Lojas My Frost Sorveterias e Yozzy (PDV, Stone, caixa delas) → SOR; só entram no auditor depois que os dados
  estiverem no ERP e com a autorização prevista em contrato.
- Visual → DSG. Permissões e RLS → SEG. Carteira pessoal → CAR.

### Regras que não posso esquecer
- Ao começar, leio esta skill e a minha `MEMORY.md`; armadilha nova entra em "Cuidados conhecidos".
- Só leitura. Nenhuma escrita automática; mudar a situação de um alerta é ação de quem tem permissão, registrada.
- Não invento número. Toda conclusão tem origem, período e registros. Falta de dado ≠ divergência: digo
  "integração ausente" ou "dado incompleto".
- Suspeita não é prova: nunca falar em fraude; separar divergência comprovada de suspeita estatística.
- Centavos sem erro de arredondamento; separar data da venda, do vencimento, do pagamento e da liquidação;
  caixa ≠ competência; faturamento ≠ recebimento ≠ saldo ≠ lucro. Horário de Brasília na tela.
- MF ≠ My Frost. Unidades SC e SP separadas; consolidado só para quem pode ver as duas.
- A IA não escreve SQL e não recebe a chave no navegador (secret `ANTHROPIC_API_KEY` no Supabase).
- Publicar (site ou funções) só com "Pode publicar" (AskUserQuestion "Pode publicar" / "Ainda não"), com aviso antes:
  `select public.aviso_claude('ERP Line – Auditor financeiro', '<resumo>');` e PushNotification "AUD: <o que fazer>".
  Trava `publicacao_comecar` → `publicacao_terminar`.
- Antes de enviar: `git pull --rebase origin paineis-no-ar`. Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Sobre → Pedidos (`pedidos_checklist`) em dia. Repositório público: sem valores, nomes ou dados da empresa no git.

### Onde olhar primeiro
- `src/lib/auditoria.ts` e `src/pages/Auditoria.tsx` (exceções que já existem e o painel).
- `src/pages/Conciliacao.tsx` (extrato × contas) e `src/pages/Financeiro.tsx`.
- `supabase/functions/ia-busca/index.ts` e `supabase/functions/_shared/ia-*.ts` (padrão seguro da IA).
- `supabase/MIGRACOES.md` para achar as tabelas de contas, extratos e pedidos.

### Cuidados conhecidos
- Transferência entre contas achada só pelo valor já juntou pares errados: conferir que as duas pontas são da MF.
- Recebido "por conta de terceiros" (licenciamento) não é receita da MF: tratar à parte.
- No cartão, o recebido a menor costuma ser a taxa: comparar com a taxa da forma de pagamento antes de alertar.
- Antes de 01/10/2026 (`CORTE_AUDITOR`) os dados vieram do Tiny incompletos: falta de parcela ou de comprovante ali é
  um aviso só de "dado incompleto", nunca um alerta por registro.
- A OLIST cobra tarifa de Pix, boleto e lembretes no mesmo extrato: só a tarifa que fala de cartão/crédito/débito
  entra na taxa do cartão.
- Anexo de conta a pagar em `documentos` usa `entidade = 'conta_pagar'` (singular), não o nome da tabela.
- A importação de extrato (Conciliação) só aceita arquivo com lançamento e grava como período só as datas dos
  lançamentos, não o DTSTART–DTEND do OFX: mês sem movimento parece "buraco" para o auditor mesmo com o extrato do banco.
- A rodada diária lê com a chave de serviço (todas as unidades) e grava só em `auditor_rodadas`/`auditor_achados`;
  a tela continua lendo com o login de quem abre. Achado novo = chave que nunca apareceu (não repetir alerta).
- Na Conciliação, a lista de contas da tela é só da unidade escolhida; a janela de importar recebe todas as contas
  (senão o extrato de SP aberto na tela de SC não acha a conta certa). O OFX da InfinitePay traz o número sem o dígito.
