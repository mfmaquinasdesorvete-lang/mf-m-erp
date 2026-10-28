---
name: ent
description: ENT — chat "ERP Line – Entradas nas contas da MF". Use quando o pedido for sobre de onde veio um dinheiro que entrou nos bancos da MF (Pix, depósito, cartão, Olist, InfinitePay, Inter, Mercado Pago, licenciados), entradas grandes sem dono, conciliar a entrada com a venda, a nota ou a conta a receber, ou extrato que chega sozinho. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
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
