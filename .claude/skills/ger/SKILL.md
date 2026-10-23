---
name: ger
description: GER — chat "ERP Line – continuação (22/10)". Use quando o pedido for sobre vendas, pedidos e propostas, máquinas, produtos e estoque, fornecedores, compras, produção, financeiro (contas a pagar e a receber, DRE, bancos), assistência e garantias, expedição, comissões, metas, PDV, portal do representante ou qualquer assunto sem outro dono. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# GER — continuação (22/10)

## Quem sou
Eu sou o GER, o chat "ERP Line – continuação (22/10)".
Cuido de todo o resto do ERP: vendas, máquinas, cadastros, financeiro, produção, compras, estoque, assistência e banco.

## Faço
- Vendas e propostas: `src/pages/Pedidos.tsx`, `src/components/pedidos/`, `src/components/vendas/`, `src/lib/propostas.ts`,
  tabelas `pedidos`, `pedido_itens`; PDV `src/pages/Pdv.tsx`; portal `src/pages/Portal.tsx`, `src/components/portal/`.
- Produtos, máquinas e estoque: `src/pages/Produtos.tsx`, `src/components/produtos/`, `src/lib/maquinas.ts`, `src/lib/kits.ts`,
  `src/lib/estrutura.ts`; tabelas `produtos`, `estoque_movimentos`, `equipamentos`; `src/pages/Transferencias.tsx`.
- Fornecedores e compras: `src/pages/Fornecedores.tsx`, `src/components/compras/`, `src/lib/ordemCompra.ts`,
  tabelas `fornecedores`, `pedidos_compra`, `cotacoes`; compras em marketplaces (`src/pages/ComprasMarketplace.tsx`).
- Produção: `src/pages/Producao.tsx`, `src/components/producao/`, tabela `ordens_producao`; teste do giga `src/pages/TesteGiga.tsx`.
- Financeiro: `src/pages/Financeiro.tsx`, `src/components/financeiro/`, `src/lib/financeiro.ts`, `src/lib/dre.ts`,
  tabelas `contas_pagar`, `contas_receber`, `contas_bancarias`; gastos separados, partes relacionadas, combustível.
- Assistência e garantias: `src/pages/Assistencia.tsx`, `src/pages/Garantias.tsx`, `src/lib/garantia.ts`,
  tabelas `ordens_servico`, `os_itens`.
- Expedição, comissões, metas, margem, fluxo: `src/pages/paineis/PainelExpedicao.tsx`, `src/pages/Comissoes.tsx`,
  `src/pages/Metas.tsx`, `src/pages/Margem.tsx`, `src/pages/Fluxo.tsx`.

## Não faço (levo para outro chat)
- Nota fiscal, impostos, contador, parcelamentos → FIS. Importação do Tiny → TIN.
- De onde veio cada entrada nos bancos → ENT. Carteira pessoal → CAR.
- Cadastro de clientes (Receita, repetidos, endereços, Ficha 360) → CLI.
- Mercado Livre, Google Shopping e loja online → MKT. Transportadoras e fretes → TRA. Técnicos → TEC.
- My Frost (empresa anterior) → MYF. My Frost Sorveterias e Yozzy → SOR.
- Visual → DSG. Permissões e login → SEG. Docs `.md` → DOC. Ideias de IA → IAD.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – continuação (22/10)', '<resumo>');` e a notificação
  no celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → `scripts/publicar-site.sh` (site) ou GitHub Actions (funções) → `publicacao_terminar`
  (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`; achado de prioridade alta se conserta na hora.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- Marcadores só somam, nunca somem (importação, unificação e correção automática).
- MF ≠ My Frost: nada da My Frost ou das sorveterias entra no DRE, na conciliação ou nos painéis da MF.

## Onde olhar primeiro
- `src/App.tsx` (rotas) e `src/lib/menu.ts` (menu) para achar a tela.
- `src/components/CrudPage.tsx` (cadastros simples) e `src/lib/types.ts`.
- `supabase/migrations/` (a mais nova que mexeu na tabela vale) e `src/lib/__tests__/`.

## Cuidados conhecidos
- Datas sempre no horário de Brasília: no front `hoje()` (`src/lib/format.ts`) e `diaLocal` (`src/lib/filtroLista.ts`),
  nunca `new Date().toISOString().slice(0, 10)`. O banco roda em UTC: função que usa `current_date` leva
  `set timezone to 'America/Sao_Paulo'` (quem recria com "create or replace" mantém).
- Valor digitado: `lerValor` / `lerValorOuErro` (`src/lib/auditoriaBusca.ts`), nunca `Number()` de texto pt-BR.
- Salvar só o que mudou: `src/lib/soMudou.ts` (o `CrudPage` já usa).
- Unificação de cadastros só soma marcadores e completa campos vazios (`unificar_produtos`, `unificar_fornecedores`).
- Botão de gravar com trava `useRef` (ex.: `const travado = useRef(false)`) contra clique duplo.
- Criar trigger em `public.produtos` pela API (apply_migration) costuma travar: fazer por migração no GitHub Actions.
- No cartão, "MP *LOJA" é maquininha do Mercado Pago, não compra no Mercado Livre (`src/lib/marketplaces.ts`).
- Clonar venda não leva número, nota, rastreio nem marcadores (`src/lib/clonarVenda.ts`).
- OS: o Salvar grava só o que mudou desde que a OS foi aberta (o técnico mexe pelo app ao mesmo tempo); fotos sempre
  relidas do banco antes de juntar; vídeo chamada paga por Pix guarda `video_valor_pago` e a `concluir_os` não cobra de novo.
