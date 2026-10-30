# MEMORY — GER (ERP Line – continuação (22/10))
Atualizado em 28/10/2026.

## Estado agora
Vendas, compras, financeiro, assistência e estoque funcionando no ar. O trabalho grande aberto é "menos dependente
do código" (levar regras e mensagens para Configurações), parado esperando a tabela nova no banco.

## No ar
- 30/10 (site 40e3bba): CRM parte 1 (Oportunidades, menu Vendas) publicado; espera ela olhar e dar o ok para a parte 2.
- 30/10 (migração 199, banco): comissões. Administrador edita qualquer comissão não paga (editar_comissao: vendedor, base, %, valor, descrição, ou "tirar", sempre com motivo em motivo_edicao; a tirada à mão não volta sozinha) e troca o vendedor do pedido pela mesma janela (editar_pedido_aprovado → recalcular_comissoes_pedido). Venda no cartão entra uma vez só: a 1ª parcela do cartão paga lança uma comissão com todas as parcelas do cartão do pedido (cartao_parcelas); #630 (5 parcelas) e #621 (2) viraram uma comissão cada. Pedido #628 ficou sem vendedor (não foi venda da vendedora) e as 4 comissões dele (R$ 1.499,91) saíram. Teste no banco (desfeito): editar 5%, estornar e pagar de novo a parcela 2/5 (continua 1), tirar (não volta), refazer pelo pedido (volta 1).
- 29/10 (migração 195, rodada no SQL Editor pela usuária): 16 máquinas repetidas unificadas (unificar_equipamentos; a que sai fica em equipamentos_unificados e o gatilho trg_equipamento_nao_recriar impede a importação de recriar). Base comum: a tabela config_ajustes já existe (parte 1 do FAZ), mas a Base comum fica para depois da rodada de fechamento.
- 29/10 (migração 197, banco): cobrança automática só para conta cobrável também no aviso diário (3 dias antes / 1 dia depois). Regra conta_receber_cobravel: sem cartão, só contas do ERP novo (desde 28/09, sem id_externo do Tiny), sem "terceiros/fornecedor/a identificar/acordo/permuta/não cobrado" (descrição ou marcador), sem entrada igual pendente no extrato desde a semana do vencimento, OS e pedido não cancelados e pedido com NF de venda autorizada. Teste desfeito: 0 cobranças. religados com o ok dela (29/10).
- 28/10 (site 3505f34, migração 194): nota de compra com "Como chegou: Retirada no local (sem frete)" (marca chegada, `retirada_local`), "À vista no Pix (já pago)" (`nfe_pago_no_pix`: baixa as contas a pagar da nota no Pix na data da nota, sem conta bancária) e nome do produto editável ao cadastrar pela nota + botão Nome. Teste no banco (desfeito) numa nota de compra de 26/10.
- 28/10 (função email-caixa 6fdc8e0, migração 193): caixa de e-mail lê até 10 e-mails/6 MB por rodada e grava o último UID a cada e-mail; acima de 8 MB só o cabeçalho; agendamento chama uma conta por vez. Causa: conta nova do Gmail (Comercial - Fornecedores) estourava a CPU a cada 5 min desde 04h37 UTC e derrubava as outras.
- 28/10 (site 954436f, funções nfe-recebidas-sync/nfe-processar/focus-webhook/email-caixa, migração 191): OC até o estoque sozinha. Item da nota casa com a OC ligada (OCs #247 e #248 casaram no ar, de-para gravado), entrada automática baixa a OC (teste desfeito na #244), nota ligada volta para a fila, "Chegou" dentro da OC, aviso dias úteis 16h43. Falta ela apertar Chegou nas OCs #244, #247 e #248 (treino) para fechar o teste. A transportadora principal das compras não tem rastreio automático (TRA: planilha do portal ou EDI OCOREN).
- 28/10 (migração 190, banco): comissão de parcela que já teve comissão cancelada reabre a cancelada com os valores novos (antes o "on conflict do nothing" travava). #628 parcela 1/2: R$ 300 a pagar. Pedidos antigos do Tiny pagos sem comissão ficaram como estão (de antes do ERP).
- 28/10 (site c791b58 + funções nfe-emitir/nfe-processar): clonar pedido sem erro; transportadora e frete na NF-e (também na tela Conferir a NF-e); extrato à prova de erro ("Vai entrar na conta", trava de número); DRE com "Vendas sem custo" e cruzamento pela descrição limpa. Falta testar no ar. Mais campos no rascunho da nota (valor, volumes/peso, natureza/CFOP, destinatário) passados ao FIS.
- 28/10 (site 62e7017): importação do extrato reconhece a conta pelo número do OFX ou nome do arquivo; sem certeza, conta em branco com aviso. Extratos do cartão de SP que caíram no Inter SC foram movidos (19 lançamentos, 2 importações, 10 contas a pagar).
- 28/10 (site fadea68, migração 182): Conciliação aceita OFX sem lançamento e grava o período do arquivo (DTSTART–DTEND). Saldo inicial Unicred MF SC = 28,09 em 17/10/2026. OLIST encerrada; Pix 426,19 → "transferência para a sócia" (fora da DRE), Pix 195 → correios. Falta ela importar os 5 OFX da Unicred (teste no ar).
- 27/10 (site 63df953): sino só com a equipe, Responder visível, avisos no Ver como, Fluxo sem o Tiny, extrato .ofx pelo iPhone; avisos do Claude e de Segurança só para a master (migração 177). Falta testar no ar.
- Máquinas: o selo "N clientes" do modelo abre a lista de quem tem a máquina, e o cliente abre a ficha (25/10).
- Acompanhamento de compras (Fábrica e estoque): peça pedida → OC → nota → transporte → chegou (973698c,
  função `acompanhamento_compras`).
- Compra só entra no estoque quando chega (CT-e entregue ou botão "Chegou") e pede conferência (migração 129).
- OC retroativa das notas de compra de peças, item sem cadastro e marcador "Comprado por valor divergente" (130).
- Excluir documento levando os ligados (OS ↔ pedido, envios, contas, OC ↔ notas), tudo ou nada (131).
- Boletos pagos no Inter casados com as contas a pagar; gastos de cartão agrupados por dia em Aprovações.
- "Agradecer pagamento" fica em Vendas (não em Cobrança). Painéis: só cobra de quem deve e ignora "não pagar".

## Em andamento
- CRM (pedido de 30/10, em partes; mostrar cada parte antes de seguir). Parte 1 pronta: Oportunidades (/oportunidades, menu Vendas), tabelas oportunidades + oportunidade_eventos (migração 198), quadro por etapas, notas, histórico, marcadores, métricas, ganho automático quando o pedido ligado é aprovado. Parte 2 (automação: respostas rápidas e modelos com o nome do cliente, follow-up agendado com aviso ao responsável, fluxos "proposta 5 dias sem resposta → avisar e mandar o modelo X") espera o ok dela na parte 1. IA nas mensagens e no próximo passo é do IAD.
- Pedido 21a33e7d (FIS coordena): tudo da MF SC desde 28/06/2022. Levantei os extratos que faltam por conta e mês (mandado ao FIS e o passo a passo ao FAZ, 28/10). Depois que ela importar: conferir e ligar contas pagas/recebidas aos extratos.
- PRIORIDADE (ELO, 27/10): plano da virada do Tiny em `.claude/skills/ger/virada-tiny.md` (data proposta 09/11; TIN importa os recebimentos dos pedidos do Tiny sem conta a receber). Rodada de fechamento: função nova só se ela pedir; "feito" só depois de testar no ar.
- Base comum de Configurações (pedido do ELO, a partir de `.claude/configuravel/README.md`):
  catálogo em `supabase/functions/_shared/ajustes.ts` (3 prazos e 12 mensagens de WhatsApp, padrão = texto de hoje)
  e migração `20261101000156_config_ajustes.sql`, já no repositório. Faltam: aplicar no banco, criar as páginas
  "Prazos e padrões" e "Mensagens ao cliente", ligar as telas, o teste ajustes.test.ts e a parte "como ligar um item
  novo" no README. Depois: e-mails automáticos, cobrança de 3 dias antes e 1 dia depois pela régua, nome fantasia no
  lugar do nome escrito à mão, etapas "dinheiro" e "prazos". Avisar o ELO quando a base estiver no ar (TRA e TEC
  entram depois).

## Esperando a usuária
- Pedido #628, parcela 2/2: fica em aberto (não é cobrada pela regra 197) até ela registrar onde o cliente pagou (Pedido → "Onde o cliente pagou"), decisão de 29/10.
- Página de comunicações na Retaguarda (pedido 1af4af3c, 24/10: tudo do sino, avisos dos chats, anotações, avisos para a equipe): ainda quer? Pela rodada de fechamento só entra se ela confirmar.
- Gravar no checklist a situação de 4 itens (46e702cc "precisa de você"; 3a664b6d para "fila" depois da rodada; c4640591 e 9f62820c com a nota "depois da rodada"): a gravação de 28/10 pediu confirmação no Supabase e expirou.
- Nota de peças sem OC (4 de 26/10): quer OC automática para as novas?
- Prestador (a0f29e4a, daa9722f): extrato completo da OLIST de setembro e confirmar os dois empréstimos (estão cancelados no ERP).
- Virada do Tiny: confirmar a data (proposta 09/11), passar as taxas das formas de pagamento e a lista do que a equipe ainda faz no Tiny.
- Rodar no SQL Editor a criação da tabela `config_ajustes` (o MCP pede confirmação e expira). Depois eu crio as funções.
- Apagar a tabela `tmp_oc_plano_2310` no SQL Editor (ela disse que vai apagar, 27/10).
- Fazer a contagem do estoque com o que existe (o estoque foi zerado).
- Pedidos aprovados sem pagamento e sem NF (três): cancelar ou esperar.
- Pagamentos de um prestador esperam a planilha do Tiny (TIN).
- Compras: apertar "Chegou" nas OCs #244, #247 e #248 (treino; fecha o teste da OC até o estoque).
- Nota de compra retirada no local (NF de 26/10, R$ 479,68): marcar Retirada no local e À vista no Pix, renomear os 2 produtos (botão Nome) e Confirmar entrada (fecha o teste).
- Compras sem OC paradas em "item sem produto" (4 notas de 26 a 28/10): ligar o item ao produto ou marcar uso e consumo (Conferir itens das notas).
- Transportadora principal das compras (sem SSW): pedir a ela o EDI OCOREN ou a API de rastreio (TRA), ou importar a planilha de CT-e do portal.

## Decisões da usuária
- 30/10: comissão de venda no cartão entra uma vez só (não uma por parcela). O pedido #628 não teve vendedor. Ela edita qualquer comissão (administrador).
- 29/10: o cliente com 3 máquinas da MF e 1 da My Frost tem 4 máquinas diferentes (anotado "não unificar"); máquina de NF de transferência entre unidades não fica na ficha da própria MF (a da NF 27 saiu e está em equipamentos_unificados).
- 28/10: os 3 paquímetros digitais com calibração vencida ficam inativos até segunda ordem (inativados, com o motivo na observação).
- "Produção" fica na área Fábrica e estoque, depois de Produtos e estoque; o quadro antigo de contas a pagar (KanbanPagar) foi apagado (REV, 27/10).
- Tela com período abre em "Esta semana" (27/10, pelo ELO): Gastos separados e Início também. Ficam como estão: Cartão (abre no cartão tocado), Conferir itens das notas (fila do ano), Garantias e Propostas do Tiny (sem período).
- Relatório de vendas para imprimir (botão "Relatório" em Vendas): vendas aprovadas, faturadas e entregues do período, cartões (faturamento, lucro, custo, ticket), gráfico por dia, por vendedor e a lista com total e lucro; lucro = total − frete − custo do cadastro, item sem custo marcado com * (27/10).
- Nota do fornecedor liga sozinha à OC (mesmo fornecedor e valor até 2%); lista de Compras mostra o passo da OC (26/10).
- Marcadores: juntar e excluir escondem o antigo (ativo = false), não apagam (migração 160). Juntados: Comprou Usada, Tiny, Técnicos My (26/10).
- Parcela de acordo de renegociação entra já aprovada (migração 159); 2ª revisão só acima de R$ 1.000 (Configurações, alçada) (26/10).
- Aprovações: o que é de antes da semana e já foi pago ou cancelado sai da fila (só conciliar); conta em aberto antiga fica na fila para ela olhar; cancelada não aparece na fila (26/10).
- Contas a pagar e a receber: lista com 4 cartões no topo (vencidas, hoje, esta semana, para decidir), lista em aberto/pagas/todas com o período, um botão (Nova conta) e o resto no "Mais"; saiu o quadro com colunas (26/10).
- Venda de máquina é "Proposta Comercial": PDF no layout da antiga do Tiny (foto, ficha técnica, preço de lista e desconto, assinatura do vendedor) (26/10).
- Custo do produto só pela compra à vista; a compra a prazo fica no histórico e não muda o custo (25/10).
- Pedido pago sem NF = retirado ou enviado por fora: vira "entregue" e sai da fila da NF-e.
- Pedido sem pagamento vindo do Tiny não aprovado não existiu.
- Compras: entrada no estoque só na entrega; Aprovações mostra boletos e Pix, e o cartão vai num quadro só por dia.
- O valor de hoje vira o padrão em Configurações: nada muda até ela editar.
- O nome padrão de um sócio foi unificado no banco pelo ELO; não escrever nomes no código.

## Onde está
- Telas: `src/pages/` (Pedidos, Producao, Financeiro, Assistencia, AcompanhamentoCompras), `src/components/compras/`,
  `src/components/config/`.
- Banco: pedidos, pedidos_compra, nfe_oc_vinculos, nfe_recebidas, ctes, contas_*, config_ajustes (a criar).
- Funções do Supabase: inter, nfe-recebidas-sync, infinitepay, proposta-enviar.

## Próximos passos
- Depois da rodada de fechamento (ou se ela pedir antes), sugestões do DSG para Fornecedores (auditoria 30/10, B4–B5): aviso "Já existe: … abrir" ao digitar CNPJ repetido, comparando só os números (o índice fornecedores_cnpj_key compara o texto e o erro do banco sai cru), e blocos fechados ou passo a passo no cadastro novo no computador.
- a8d2634a: funções publicadas em 27/10; na próxima nota de fornecedor conferir se `nfe_recebidas.xml` ficou guardado e o à vista / a prazo veio do XML, e marcar feito.
- DANFE no menu das vendas só aparece para nota emitida pelo ERP (as do Tiny não têm danfe_url).
- Teste da rodada de fechamento (CNF, 27/10): 17 testados (14 passaram, 3 voltaram); faltam 122 "feito" sem teste. Daqui o site não abre (rede): testar pelo banco de produção e pelo código no site.zip.
0. Auditoria do REV de 27/10 (.claude/skills/rev/auditoria-2026-10-27.md): Auditoria financeira leve (colunas e período) e `select:` nas listas das telas do GER; depois `centavos()` única; /estoque × /produtos/pecas espera a usuária (com o PRD).
1. Com a tabela criada: funções `config_ajuste_salvar` e `cfg_num`, páginas de Configurações e as telas lendo o catálogo.
2. Pedir "Pode publicar", avisar o ELO, marcar "Feito" em `.claude/configuravel`.
3. E-mails automáticos e a cobrança fora da régua; depois dinheiro e prazos.
