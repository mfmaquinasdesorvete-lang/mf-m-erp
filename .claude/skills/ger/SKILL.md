---
name: ger
description: GER — chat "ERP Line – continuação (22/10)". Use quando o pedido for sobre vendas, pedidos e propostas, máquinas, estoque, fornecedores, compras, produção, financeiro (contas a pagar e a receber, DRE, bancos), assistência e garantias, expedição, comissões, metas, PDV, portal do representante ou qualquer assunto sem outro dono. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# GER — continuação (22/10)

## Quem sou
Eu sou o GER, o chat "ERP Line – continuação (22/10)".
Cuido de todo o resto do ERP: vendas, máquinas, cadastros, financeiro, produção, compras, estoque, assistência e banco.

## Faço
- Vendas e propostas: `src/pages/Pedidos.tsx`, `src/components/pedidos/`, `src/components/vendas/`, `src/lib/propostas.ts`,
  tabelas `pedidos`, `pedido_itens`; PDV `src/pages/Pdv.tsx`; portal `src/pages/Portal.tsx`, `src/components/portal/`.
- Máquinas e estoque: `src/lib/maquinas.ts`, tabelas `estoque_movimentos`, `equipamentos`; `src/pages/Transferencias.tsx`.
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
- Cadastro de produtos (dados, NCM, custo, EAN, fotos, kits, repetidos, formação de preço) → PRD.
- Mercado Livre, Google Shopping e loja online → MKT. Transportadoras e fretes → TRA. Técnicos → TEC.
- My Frost (empresa anterior) → MYF. My Frost Sorveterias e Yozzy → SOR.
- Visual → DSG. Permissões e login → SEG. Docs `.md` → DOC. Ideias de IA → IAD.
- Funcionários (cadastro, documentos, salários lançados, férias, área no menu) → FUN.

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
- Importar extrato: a conta vem de contaDoArquivo (número do OFX ou nome do arquivo); nunca usar a primeira conta da lista como padrão (28/10: OFX do cartão de SP caiu no Inter SC).
- Importar extrato (Conciliacao.tsx, ImportarModal): nunca escolher conta por padrão (bancos[0]). Em 28/10 dois OFX do
  cartão do Fabiano ("Infinit…") caíram no Banco Inter SC. Conta não reconhecida = escolha obrigatória; número do OFX
  diferente do da conta = bloquear.
- Datas sempre no horário de Brasília: no front `hoje()` (`src/lib/format.ts`) e `diaLocal` (`src/lib/filtroLista.ts`),
  nunca `new Date().toISOString().slice(0, 10)`. O banco roda em UTC: função que usa `current_date` leva
  `set timezone to 'America/Sao_Paulo'` (quem recria com "create or replace" mantém).
- Valor digitado: `lerValor` / `lerValorOuErro` (`src/lib/auditoriaBusca.ts`), nunca `Number()` de texto pt-BR.
- Salvar só o que mudou: `src/lib/soMudou.ts` (o `CrudPage` já usa).
- Unificação de cadastros só soma marcadores e completa campos vazios (`unificar_fornecedores`).
- Botão de gravar com trava `useRef` (ex.: `const travado = useRef(false)`) contra clique duplo.
- Criar trigger em `public.produtos` pela API (apply_migration) costuma travar: fazer por migração no GitHub Actions.
- No cartão, "MP *LOJA" é maquininha do Mercado Pago, não compra no Mercado Livre (`src/lib/marketplaces.ts`).
- Clonar venda não leva número, nota, rastreio nem marcadores (`src/lib/clonarVenda.ts`).
- OS: o Salvar grava só o que mudou desde que a OS foi aberta (o técnico mexe pelo app ao mesmo tempo); fotos sempre
  relidas do banco antes de juntar; vídeo chamada paga por Pix guarda `video_valor_pago` e a `concluir_os` não cobra de novo.
- Cobrança do cliente (régua WhatsApp/e-mail): só entra a conta que passa em `public.conta_receber_cobravel`
  (fora: parcela no cartão, pedido cancelado ou excluído, pedido sem NF de venda autorizada). A tela usa a mesma regra
  pela rpc `contas_receber_fora_cobranca` (`marcarForaDaCobranca` em `src/lib/cobranca.ts`). Regra nova vai na função
  do banco, não só na tela.
- OC lança o contas a pagar (`lancar_oc_contas_pagar`, contas com `pedido_compra_id`); recebimento e nota do fornecedor
  usam `contas_da_oc` para não lançar em dobro. OC recebida (e as do Tiny) não lança por esse botão.
- Pelo MCP do Supabase, UPDATE/INSERT com texto longo costuma travar (60 s e nada grava): fazer dentro de um bloco
  `do $$ begin … end $$;` (com `concat(...)` no texto), que passa na hora.
- Nota de compra só entra no estoque quando chega (configuracoes.entrada_so_na_entrega, 23/10): o processamento para em
  `a_caminho`; a chegada vem do CT-e com ocorrência de entrega (gatilho trg_cte_entregue) ou do botão "Chegou"
  (marcar_chegada_compra), que devolve a nota para `pendente`. Depois da entrada sai o aviso "Conferiu?"
  (conferir_compra_recebida). As contas a pagar continuam saindo quando a nota aparece na SEFAZ.
- Pelo MCP, `create trigger` junto com outros comandos (ou com `set lock_timeout`) trava em 60 s sem gravar: mandar
  cada `create trigger` sozinho.
- OC das compras de peças (23/10): 692 OC criadas pela nota (`oc_retroativa_da_nota`, data 1 dia antes, já recebidas,
  total = nota com impostos/frete em outras despesas, sem estoque nem contas) e 165 notas ligadas às OC do Tiny (96 com
  o marcador "Comprado por valor divergente"). Item de OC pode ficar sem produto (`produto_id` nulo, chip "sem
  cadastro", `codigo_fornecedor` guardado): quem soma itens de OC por produto precisa ignorar os sem produto.
- Acompanhamento de compras (Fábrica e estoque → /acompanhamento-compras, 24/10): uma linha por item de OC, etapas
  cotação → pedida → nota emitida → em transporte → chegou, pela função `acompanhamento_compras(p_dias)` (nota = só as
  ligadas em `nfe_oc_vinculos`; transporte = CT-e mais novo que cita a nota por `nfe_recebida_id` ou `nfe_chaves`).
  Regra das etapas em `src/lib/acompanhamentoCompras.ts` (com teste). Nota do fornecedor sem OC aparece como "ligue na
  OC": a peça só passa de "pedida" quando a nota está ligada. A linha abre a OC em Compras (`state.abrirOc`).
- Custo só pela compra à vista (25/10, decisão da usuária via PRD): `compra_atualiza_custo(nota)` = à vista ou cartão
  (escolhido em "Condição de pagamento" ou lido do XML por `condicao_compra`). `lancar_estoque_nfe_core` e
  `nf_custos_core` só mudam `produtos.preco_custo` quando ela é verdadeira; a prazo e "não informado" entram no estoque
  e ficam no histórico sem mudar o custo. A tela pede a escolha quando o XML não diz (a maioria das notas com tPag 99).
  A migração 157 troca só o trecho do custo no texto atual das duas funções (se o trecho mudar, ela para com erro).
- Proposta Comercial (26/10): pedido com máquina usa `pdfOrcamento({ comercial: true, ficha })` → `propostaComercial` em
  `src/lib/pdf.ts` (cada item em duas linhas da tabela com rowSpan: nome em negrito e, embaixo, SKU/NCM, texto do catálogo
  e especificações; foto desenhada no didDrawCell). A página do cliente lê `comercial`, `especificacoes` e `preco_lista`
  de `proposta_publica` (migração 158, troca de trecho no texto atual da função).
- Contas a pagar e a receber (26/10, escolha da usuária): `CartoesAgora` + `EscolhaEstado` (`src/components/financeiro/AgoraContas.tsx`)
  e as regras em `src/lib/agoraContas.ts` (com teste). Os cartões olham todas as contas (sem o período); a lista usa o
  período. O quadro (KanbanPagar) e os passos numerados saíram da tela; contas fixas, renegociadas, imprimir, exportar e
  Aprovações ficam no "Mais" (MenuAcoes com `texto`). A pagar: dia = dia programado (`diaDoPagamento`), "não pagar" e
  golpe não contam como vencidas. Não voltar a pôr vários botões cheios na tela: um só (Nova conta).
- Recibos (26/10, feito pelo FUN): o componente Recibos tem `escopo` ("financeiro" esconde os recibos de funcionário,
  marcados em `recibos.de_funcionario` pelo gatilho trg_recibo_de_funcionario). Ao mexer na aba Recibos do Financeiro,
  manter esse filtro.
- OC andando sozinha (26/10): o gatilho `trg_oc_nota_automatica` (nfe_recebidas) chama `oc_ligar_nota_automatica`, que
  liga a nota à única OC enviada do mesmo fornecedor e com o mesmo total (até 2%); com mais de uma possível, só avisa.
  A lista de Compras mostra o passo por `ocs_andamento()` + `passoDaOC` (paga, nota emitida, a caminho, chegou).
  O MCP pede confirmação para `drop trigger`/`delete`: crie gatilho novo sem drop (ou peça à usuária no SQL Editor).
- OC até o estoque sozinha (28/10, migração 191): item da nota sem produto casa com o item da OC ligada
  (`_shared/nfe-itens-oc.ts`: código do fornecedor guardado na OC, senão quantidade única; na dúvida não casa) e vira
  de-para em `produto_fornecedor`; `entrada_automatica_nota` dá a baixa na OC (OC recebida sem nota não entra sozinha);
  nota ligada a OC parada em `aguardando_vinculo` volta para `pendente` (gatilho em `nfe_oc_vinculos`). A Expresso São
  Miguel não está no SSW: a entrega dela não chega sozinha; "Chegou" fica na própria OC (Notas fiscais do fornecedor) e
  o aviso `avisar_compras_para_chegar` (dias úteis, 16h43) lembra o que já devia ter chegado.
