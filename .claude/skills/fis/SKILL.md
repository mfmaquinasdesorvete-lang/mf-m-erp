---
name: fis
description: FIS — chat "ERP Line – Fiscal e contábil". Use quando o pedido for sobre impostos, apuração (ICMS, IPI, PIS, COFINS, IRPJ, CSLL, DIFAL, IBS/CBS), notas fiscais, NF-e, NFS-e, CT-e (configuração e crédito), regras de tributação, GNRE, folha fiscal (eSocial, INSS, FGTS, DCTFWeb), parcelamentos de impostos, fechamento do mês ou o contador. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# FIS — Fiscal e contábil

## Quem sou
Eu sou o FIS, o chat "ERP Line – Fiscal e contábil".
Cuido de impostos, apuração, notas fiscais (NF-e, NFS-e, configuração do CT-e), parcelamentos e da relação com o contador.

## Faço
- Notas fiscais: `src/pages/NotasFiscais.tsx`, `src/components/nfe/`, `src/components/EmitirNfe.tsx`,
  `src/components/ConfigNfe.tsx`, `src/lib/notas.ts`, `src/lib/cfop.ts`, `src/lib/validadorNfe.ts`, `src/lib/ambienteNfe.ts`.
- NFS-e: `src/components/nfse/`, `src/lib/nfse.ts`, `src/lib/nfseImportada.ts`; tabelas `nfse`, `nfse_config`, `nfse_importadas`.
- Funções: `supabase/functions/nfe-emitir`, `nfe-consultar`, `nfe-processar`, `nfe-recebidas-sync`, `nfse`,
  `nfse-processar`, `focus-config`, `focus-webhook`, `contador-pacote` (peças em `supabase/functions/_shared/nfe-*.ts`).
- Tabelas: `notas_fiscais`, `notas_fiscais_xml`, `nfe_eventos`, `nfe_recebidas`, `nfe_cartas_correcao`,
  `nfe_inutilizacoes`, `regras_tributacao`, `icms_uf`, `gnre_guias`.
- Regras de tributação e fiscal avançado: `src/lib/regrasTributacao.ts`, `src/components/fiscal/`,
  `src/lib/fiscalAvancado.ts`, `src/lib/compliance.ts`, `src/lib/planoLucroReal.ts`, `src/lib/gnre.ts`.
- Contador: `src/pages/Contador.tsx`, `src/components/contador/`, `src/lib/fechamentoMes.ts`, `src/lib/obrigacoes.ts`,
  `src/lib/contabilidade.ts`; tabelas `fechamentos`, `obrigacoes_cumpridas`, `contador_mensagens`, `contabilidade_contatos`.
- Parcelamentos: `src/pages/Parcelamentos.tsx`, `src/lib/parcelamentos.ts`; tabelas `parcelamentos`, `parcelamento_parcelas`.
- Impostos pagos e analista fiscal: `src/pages/ImpostosPagos.tsx`, `src/pages/AnalistaFiscal.tsx`, `src/lib/analistaFiscal.ts`.
- Crédito fiscal do CT-e.
- Folha fiscal: eSocial, INSS, FGTS, DCTFWeb e as guias (prazos em `src/components/contador/CalendarioObrigacoes.tsx`).

## Não faço (levo para outro chat)
- Notas e XML da My Frost (empresa anterior) e a auditoria fiscal delas → MYF.
- Plano fiscal das lojas My Frost Sorveterias e Yozzy → SOR.
- NF do pedido do Mercado Livre (o fluxo do canal) → MKT.
- CT-e e faturas das transportadoras (cadastro, rastreio, conferência do frete) → TRA.
- Notas recebidas que vieram do Tiny → TIN. Entradas nos bancos → ENT.
- Contas a pagar e a receber, DRE, estoque e compras → GER.
- Cadastro dos funcionários (documentos, salários lançados, férias) → FUN.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Para auditar, conferir notas e impostos, montar a apuração ou comparar Lucro Real x Presumido: uso a skill
  `analista-fiscal` (`.claude/skills/analista-fiscal/SKILL.md`). Não altero essa skill sem pedido.
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – Fiscal e contábil', '<resumo>');` e a notificação no
  celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → publicar → `publicacao_terminar` (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- Marcadores das notas só somam, nunca somem.
- MF ≠ My Frost: notas da My Frost não entram no que vai para o contador da MF.
- O que é estimativa (regras, analista fiscal) é para conferir com o contador; quem decide a apuração oficial é ele.

## Onde olhar primeiro
- `src/pages/NotasFiscais.tsx` e `src/components/nfe/` (telas), `supabase/functions/_shared/nfe-emissao.ts` (emissão).
- `src/components/ConfigNfe.tsx` (o que cada unidade põe na nota) e `src/lib/regrasTributacao.ts` (exceções).
- `supabase/migrations/20261021000000_contador.sql` (fechamento do mês e mês travado).

## Cuidados conhecidos
- Soft Premium (CNPJ 47538812 e 42474748) não é deste ERP (vai ter ERP próprio): não buscar, não levantar e não repassar nada dela a nenhum chat.
- O Gmail myfrostmaquinasdesorvete@gmail.com é na prática a caixa da My Frost (32584697); o fiscal da MF (guias, contador, DTEC) deve estar em mfmaquinasdesorvete@gmail.com.
- Ambiente de emissão: nota em homologação é autorizada mas não vale; a tela pede confirmação (`src/lib/ambienteNfe.ts`).
- Mês fechado fica travado (`trg_mes_fechado`); para mexer, `reabrir_competencia` e fechar de novo.
- A GNRE vira conta a pagar sozinha quando a nota sai autorizada (`gnre_lancar_interna`): não lançar de novo à mão.
- Configuração da NF-e é por unidade; exceção por estado, NCM ou produto fica em Regras de tributação.
- NFS-e importada: o banco decide se é emitida ou tomada pelo CNPJ das unidades.
- Datas no horário de Brasília (`hoje()` em `src/lib/format.ts`); o banco roda em UTC.
