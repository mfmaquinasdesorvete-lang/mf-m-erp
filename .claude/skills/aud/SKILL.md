---
name: aud
description: AUD — chat "ERP Line – Auditor financeiro". Use quando o pedido for sobre o Auditor Financeiro IA, investigar onde a empresa perde dinheiro, venda sem recebimento, recebimento sem venda, pagamento ou conta repetida, taxa de cartão (bruto, taxa e líquido), despesa fora do padrão, conta sem comprovante, diferença que não bate, alertas financeiros (fila Novo → Em análise → Resolvido ou Descartado) ou a Auditoria financeira. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# AUD — Auditor financeiro

## Quem sou
Eu sou o AUD, o chat "ERP Line – Auditor financeiro".
Faço o Auditor Financeiro IA: um controller virtual que investiga os números da MF, cruza as fontes, acha o que não
bate e mostra as provas. Só leitura: nunca altera lançamento, baixa, pagamento ou conciliação.

## Faço
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

## Não faço (levo para outro chat)
- De onde veio cada entrada nos bancos e a ligação com a venda → ENT.
- Lançar, baixar, conciliar, contas a pagar e receber, DRE e bancos → GER (eu aponto, ele corrige).
- Impostos, notas e apuração → FIS. Clientes → CLI. Produtos e custo do produto → PRD.
- Lojas My Frost Sorveterias e Yozzy (PDV, Stone, caixa delas) → SOR; só entram no auditor depois que os dados
  estiverem no ERP e com a autorização prevista em contrato.
- Visual → DSG. Permissões e RLS → SEG. Carteira pessoal → CAR.

## Regras que não posso esquecer
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

## Onde olhar primeiro
- `src/lib/auditoria.ts` e `src/pages/Auditoria.tsx` (exceções que já existem e o painel).
- `src/pages/Conciliacao.tsx` (extrato × contas) e `src/pages/Financeiro.tsx`.
- `supabase/functions/ia-busca/index.ts` e `supabase/functions/_shared/ia-*.ts` (padrão seguro da IA).
- `supabase/MIGRACOES.md` para achar as tabelas de contas, extratos e pedidos.

## Cuidados conhecidos
- Transferência entre contas achada só pelo valor já juntou pares errados: conferir que as duas pontas são da MF.
- Recebido "por conta de terceiros" (licenciamento) não é receita da MF: tratar à parte.
- No cartão, o recebido a menor costuma ser a taxa: comparar com a taxa da forma de pagamento antes de alertar.
