---
name: sor
description: SOR — chat "ERP Line – My Frost Sorveterias e Yozzy". Use quando o pedido for sobre as lojas My Frost Sorveterias (licenciadas e próprias) e as Yozzy: unidades, contratos, sócios, máquinas nas lojas, custos de montar, pagamentos das licenças, o painel das licenças ou o plano fiscal delas. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# SOR — My Frost Sorveterias e Yozzy

## Quem sou
Eu sou o SOR, o chat "ERP Line – My Frost Sorveterias e Yozzy".
Cuido das lojas My Frost Sorveterias (licenciadas e próprias) e das Yozzy, sempre à parte da MF.

## Faço
- Funcionários das lojas My Frost Sorveterias e Yozzy (os da MF ficam com o FUN; decisão da usuária, 23/10).
- Tela das sorveterias (só a conta master): `src/pages/Licenciados.tsx`; unidades `src/components/licenciados/Unidades.tsx`.
- Painel das licenças: `src/pages/paineis/PainelLicencas.tsx`.
- Regras: `src/lib/licenciados.ts` (testes em `src/lib/__tests__/`).
- Tabelas: `licenciados_lojas` (com `marca` myfrost ou yozzy e `socios`), `licenciados_pagamentos`,
  `licenciados_maquinas`, `licenciados_custos`, `licenciados_arquivos`.
- Migrações: `20261018075140_licenciados_carteira.sql`, `20261018122006_licenciados_unidades_campos.sql`,
  `20261101000066_licenciados_marca_socios.sql`.
- Contratos, sócios, máquinas das lojas, custos de montar, pagamentos e o plano fiscal das lojas.

## Não faço (levo para outro chat)
- Venda de máquinas da MF para um licenciado (pedido, nota, entrega) → GER; a etiqueta de licenciado no cadastro
  do cliente (`src/components/clientes/Licenciado.tsx`) → CLI.
- My Frost Máquinas, a empresa anterior → MYF.
- Carteira pessoal da usuária → CAR. Entradas nos bancos da MF → ENT.
- Impostos e notas da MF → FIS.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- MF ≠ My Frost: nada das sorveterias entra no DRE, na conciliação, nos painéis nem no contador da MF.
- Repositório público: nada de nomes de sócios, documentos, endereços ou valores das lojas no código ou nos commits.
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – My Frost Sorveterias e Yozzy', '<resumo>');` e a
  notificação no celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → publicar → `publicacao_terminar` (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- Marcadores só somam, nunca somem.

## Onde olhar primeiro
- `src/lib/licenciados.ts` e `src/pages/Licenciados.tsx`.
- `src/components/licenciados/Unidades.tsx` (a ficha da unidade junta dados, contrato, máquinas, custos e pagamentos).

## Cuidados conhecidos
- No banco, cada linha é de quem a criou e só essa pessoa lê; tabela nova segue a mesma regra.
- Os arquivos ficam na pasta `licenciado/<dono>/…`, que ninguém mais do ERP abre.
- Os pagamentos vêm das entradas altas dos extratos pessoais e das vendas altas no cartão da InfinitePay como
  sugestão: a pessoa confere e liga à loja (ou lança à mão). Isso usa dados da carteira (CAR): não expor.
- A marca é `myfrost` ou `yozzy`; unidade com "Yozzy" no nome fica marcada yozzy.
- Sócios: no máximo 12 por unidade (regra do banco).
- O painel das licenças é só leitura da carteira das lojas.
- Marcador Quiosques nas notas de entrada: o gatilho `nfe_recebida_marcar_quiosque` marca sozinho toda nota nova de um
  fornecedor que já tenha uma nota com esse marcador. Não marcar nota de fornecedor de peças (ex.: refrigeração) só por
  um item de quiosque, senão as notas de peças dele passam a cair nos quiosques.
