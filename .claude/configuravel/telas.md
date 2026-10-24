# O que hoje só muda mexendo no código das telas (src/) e poderia ir para Configurações

Levantamento de 24/10/2026, só leitura (nenhum arquivo do repositório foi alterado). São 160 itens.

## Resumo

1. **Por chat:** GER 77 · TRA 14 · FIS 11 · CLI 8 · FUN 8 · ENT 7 · TEC 6 · SOR 6 · MKT 5 · PRD 5 · MYF 3 · SEG 3 · TIN 3 · IAD 2 · CAR 1 · DSG 1.
2. **O que mais aparece:** mensagens de WhatsApp e textos para o cliente com "MF Máquinas" escrito à mão (cerca de 60 lugares), prazos dos alertas (dias e horas) e listas de opções (motivos, setores, tipos).
3. **Mais fácil de levar para a tela:** números soltos (dias, %, R$). Dá para guardar todos num campo novo da tabela `configuracoes`, em uma seção "Prazos e alertas".
4. **Mais difícil:** regras que o banco também confere (tolerância do frete, janela da conciliação de vendas) e as permissões de cada papel. Nesses casos é preciso mudar a tela e o banco juntos.
5. **Ficou de fora porque já se muda pela tela:** validade do orçamento, garantia, preventiva, conserto e armazenagem, taxa da vídeo chamada, multa e juros de Recebimentos, régua de cobrança, desconto máximo, comissões, formação e tabelas de preço, textos dos documentos, aviso de outra empresa, risco do cartão, limites do giga, tipos de contato e marcadores. Também ficaram de fora cores, paginação, testes e demonstração.

## Os 10 que mais valem a pena

1. **Mensagens de WhatsApp para o cliente** (cobrança manual, boleto, link, pedido, OS pronta, despacho, rastreio): hoje são textos fixos, e ela deveria poder reescrever cada um. Chats GER e TRA.
2. **Nome "MF Máquinas" escrito à mão** em cerca de 60 textos, em vez de usar o nome fantasia de Configurações → Empresa. Chat GER.
3. **Pedido novo** já começa com boleto, 1 parcela, 30 dias e origem WhatsApp. Ela deveria poder escolher esse padrão. Chat GER.
4. **Multa de 2% e juros de 1%** usados na baixa de conta atrasada: não usam a multa e os juros que ela já configurou. Chat GER.
5. **Conferência do pedido:** desconto acima de 20% e preço mais de 10% abaixo da tabela viram alerta. Chat GER.
6. **Prazos dos alertas do Fluxo de vendas e dos painéis** (proposta 3/7 dias, sem NF 2 dias, orçamento parado 7 dias, OS aberta 15 dias…). Chat GER.
7. **Termo da vídeo chamada** (texto, Pix antes, "ACEITO") e 1 hora técnica padrão. Chat TEC.
8. **Reposição de estoque:** prazo padrão de 15 dias, folga de 1,5×, cobertura de 30 dias e base de 90 dias. Chat GER.
9. **Garantia e preventiva:** "vence logo" com 30 dias; a lista de garantias usa 6 meses fixos e não a configuração; fila de lembrete com 15, 7 e 30 dias. Chat GER.
10. **Frete:** validade da cotação de 7 dias e tolerância de R$ 1,00 ou 2% entre o aprovado e o faturado. Chat TRA.

Legenda: **frequência** é quanto o negócio costuma querer mudar; **dificuldade** é fácil (um número ou texto num lugar só), média (lista ou texto usado em vários lugares) ou difícil (o banco tem a mesma regra, ou mexe em permissões).

### Geral (vale para várias telas)

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Geral | O nome da empresa está escrito à mão em cerca de 60 textos (mensagens de WhatsApp, PDFs, telas públicas), em vez de usar o "Nome fantasia" de Configurações → Empresa | "MF Máquinas" em 42 arquivos | src/pages/Assistencia.tsx:161, src/pages/Pedidos.tsx:952, src/components/financeiro/PainelFinanceiro.tsx:211, src/lib/respostasWhatsapp.ts:15, src/lib/osVideo.ts:73 (e outros) | média | sim | média | GER |
| Geral | Saudação padrão do botão "Chamar no WhatsApp" em clientes, técnicos, fornecedores e transportadoras | "Olá, {nome}! Aqui é da MF Máquinas." | src/components/CrudPage.tsx:675, src/pages/Clientes.tsx:325, src/components/clientes/ClienteForm.tsx:698, src/pages/Fornecedores.tsx:298, src/pages/Tecnicos.tsx:90 | baixa | sim | fácil | GER |
| Geral | Feriados usados para contar dias úteis (metas e prazos): só os nacionais de data fixa; feriados do estado e da cidade não entram | 8 datas fixas + 20/11 | src/lib/metas.ts:58 | baixa | sim | média | GER |

### Vendas, propostas e PDV

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Vendas | Como nasce um pedido/orçamento novo: forma de pagamento, parcelas, intervalo e canal de origem já preenchidos | boleto · 1 parcela · 30 dias · origem WhatsApp | src/pages/Pedidos.tsx:144 | média | sim | fácil | GER |
| Vendas | Conferência do pedido: desconto acima de X% vira alerta "confira quem autorizou" (separado do desconto máximo de Configurações → Descontos) | 20% | src/lib/auditoriaPedido.ts:44, src/lib/auditoria.ts:44 | média | sim | fácil | GER |
| Vendas | Conferência do pedido: item vendido mais de X% abaixo do preço de tabela vira alerta | 10% abaixo da tabela | src/lib/auditoriaPedido.ts:54 | média | sim | fácil | GER |
| Vendas | Mensagem de WhatsApp ao mandar orçamento/pedido em PDF | "Olá {nome}! Segue o orçamento/pedido #… da *MF Máquinas*:" | src/pages/Pedidos.tsx:952 | média | sim | fácil | GER |
| Vendas | Mensagem para cobrar a resposta de uma proposta (Fluxo de vendas) | "Olá {nome}! Tudo bem? Conseguiu ver a nossa proposta nº …? Fico à disposição…" | src/components/fluxo/Cartao.tsx:39 | média | sim | fácil | GER |
| Vendas | Mensagem ao mandar o link da proposta para o cliente aprovar | "Olá {nome}! Segue a nossa proposta nº … Veja os detalhes e aprove por aqui:" | src/components/PropostaPainel.tsx:45 | média | sim | fácil | GER |
| Vendas | Prazos dos alertas do Fluxo de vendas (quando o cartão fica amarelo/vermelho) | proposta sem resposta 3/7 dias · sem NF 2 dias · separação e embalagem 1/3 dias · despacho 2 dias · entrega sem previsão 7/15 dias | src/lib/fluxo.ts:144, src/lib/fluxo.ts:162, src/lib/fluxo.ts:168, src/lib/fluxo.ts:180, src/lib/fluxo.ts:189, src/lib/fluxo.ts:198 | média | sim | média | GER |
| Vendas | Quanto tempo proposta recusada/vencida e pedido entregue ficam visíveis no Fluxo | 15 dias | src/lib/fluxo.ts:104, src/lib/fluxo.ts:111 | baixa | não | fácil | GER |
| Vendas | Painel de Vendas: proposta "vencendo" e orçamento "parado" | vence em até 3 dias · parado há mais de 7 dias sem o cliente abrir | src/pages/paineis/PainelVendas.tsx:116, src/pages/paineis/PainelVendas.tsx:117 | média | sim | fácil | GER |
| Vendas | Painel gerencial: o que conta como atraso | orçamento parado 7 dias · venda sem NF 2 dias · expedição 3 dias · OS aberta 15 dias · cotação de compra 5 dias · estoque parado 6 meses | src/lib/gerencial.ts:264, src/lib/gerencial.ts:269, src/lib/gerencial.ts:273, src/lib/gerencial.ts:277, src/lib/gerencial.ts:284, src/lib/gerencial.ts:297 | média | sim | média | GER |
| Vendas | Aviso de venda repetida: mesmo cliente e mesmo valor dentro de X horas | 24 horas | src/lib/pedidoRepetido.ts:6, src/pages/Pedidos.tsx:868 | baixa | sim | fácil | GER |
| Vendas | Motivos de perda da proposta (por que o cliente não fechou) | Preço, Prazo, Frete, Forma de pagamento, Concorrente, Produto não atende, Desistiu, Não respondeu, Outro | src/lib/propostas.ts:2 | média | não | média | GER |
| Vendas | Formas de pagamento da venda: lista fixa no pedido (o cadastro "Formas de pagamento" existe, mas o pedido não usa a lista dele) | Boleto, Pix, Cartão, Transferência, Dinheiro | src/pages/Pedidos.tsx:98, src/lib/formasPagamento.ts:15 | baixa | sim | média | GER |
| Vendas | Texto fixo na validade do orçamento em PDF | "… Preços sujeitos a disponibilidade de estoque." | src/lib/pdf.ts:316, src/lib/pdf.ts:317 | baixa | sim | fácil | GER |
| Vendas | Nome das formas de pagamento escritas no PDF da proposta | "Boleto bancário", "Pix", "Cartão"… | src/lib/pdf.ts:311 | baixa | sim | fácil | GER |
| Vendas | Texto da página pública da proposta depois de aprovar e do pagamento | "Proposta aprovada. Obrigado! …" · "Pix ou cartão em até 12x, na página segura da InfinitePay." | src/pages/PropostaPublica.tsx:163, src/pages/PropostaPublica.tsx:196 | baixa | sim | fácil | GER |
| Vendas | Texto explicativo da régua de cobrança na tela de Pedidos (fica errado se a régua mudar em Configurações) | "3 dias antes, no dia e 5 dias depois do vencimento" | src/pages/Pedidos.tsx:601 | baixa | não | fácil | GER |
| PDV | Venda "a prazo" no balcão: vencimento já sugerido | 30 dias | src/pages/Pdv.tsx:227 | média | sim | fácil | GER |
| PDV | Formas de recebimento do caixa e do PDV | Dinheiro, Pix, Crédito, Débito, Link InfinitePay, A prazo | src/pages/Pdv.tsx:52, src/components/pdv/CaixaPdv.tsx:27 | baixa | sim | média | GER |
| PDV | Texto do cupom do balcão | "Obrigado pela preferência!" · "Guarde este comprovante para troca e garantia." | src/lib/pdf.ts:1362, src/lib/pdf.ts:1363, src/pages/Pdv.tsx:781 | baixa | sim | fácil | GER |
| PDV | Frases de motivação que aparecem na entrada do PDV | lista de ~30 frases | src/lib/frasesPdv.ts:4 | baixa | não | fácil | GER |
| Loja virtual | Mensagens de WhatsApp da loja do site (interesse, pedido feito, dúvida do pedido) e aviso de pagamento | "Olá! Tenho interesse em: …" · "A forma de pagamento é combinada com a nossa equipe depois do pedido." | src/pages/Loja.tsx:222, src/pages/Loja.tsx:286, src/pages/Loja.tsx:328 | baixa | sim | fácil | GER |
| Metas | Cores da meta: vermelho, amarelo e verde | abaixo de 70% · 70% a 99% · 100% ou mais | src/lib/metas.ts:136 | baixa | não | fácil | GER |
| Margem | Limites do "conselheiro de margem" (quando ele avisa) | margem boa ≥ 30% · apertada < 15% · produto < 10% · frete > 5% · taxas > 3% · comissão > 8% · cliente > 30% da receita | src/lib/conselheiroMargem.ts:34, src/lib/conselheiroMargem.ts:46, src/lib/conselheiroMargem.ts:53, src/lib/conselheiroMargem.ts:81 | baixa | sim | média | GER |

### Cobrança e financeiro

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Financeiro | Mensagem de cobrança manual pelo WhatsApp (painel financeiro e lista de contas) | "Olá {nome}! Aqui é do financeiro da MF Máquinas. Consta em aberto …" | src/components/financeiro/PainelFinanceiro.tsx:211, src/components/financeiro/PainelFinanceiro.tsx:397, src/pages/Financeiro.tsx:349 | alta | sim | fácil | GER |
| Financeiro | Mensagens ao mandar boleto, link de pagamento e confirmação da compra | "Segue o boleto da *MF Máquinas*" · "Segue o link para pagamento…" · "Sua compra … foi confirmada" | src/components/financeiro/BoletoInter.tsx:90, src/components/financeiro/LinkPagamento.tsx:37, src/components/financeiro/LinkPedido.tsx:23 | média | sim | fácil | GER |
| Financeiro | Multa e juros usados na baixa de uma conta atrasada quando a conta não tem os próprios (não usa a multa e os juros de Configurações → Recebimentos) | multa 2% · juros 1% ao mês | src/components/financeiro/BaixaModal.tsx:34, src/lib/boleto.ts:170 | baixa | sim | fácil | GER |
| Financeiro | Parcela no cartão nunca entra na cobrança ao cliente (quem paga é a maquininha) | forma "cartao" fica fora | src/lib/cobranca.ts:24 | baixa | sim | média | GER |
| Financeiro | Fila de cobrança pelo WhatsApp: até quantos dias para trás uma etapa atrasada ainda entra | 3 dias | src/lib/cobranca.ts:41 | baixa | sim | fácil | GER |
| Financeiro | Cliente "a vencer" no painel de cobrança | vence em até 7 dias | src/lib/cobranca.ts:60, src/lib/cobranca.ts:92 | baixa | não | fácil | GER |
| Financeiro | Faixas de atraso do painel de cobrança e do painel financeiro | 1–15, 16–30, 31–60, 61–90, mais de 90 dias | src/lib/cobranca.ts:82, src/pages/paineis/PainelFinanceiroArea.tsx:41 | baixa | não | fácil | GER |
| Financeiro | Vencimento sugerido em telas de lançamento | conta a receber nova 3 dias · boleto Inter 3 dias · baixa parcial 7 dias · renegociação 1ª em 30 dias · pagar comissão em 5 dias | src/pages/Financeiro.tsx:379, src/components/financeiro/BoletoInter.tsx:53, src/components/financeiro/BaixaModal.tsx:25, src/components/financeiro/Renegociacao.tsx:49, src/pages/Comissoes.tsx:158 | baixa | sim | fácil | GER |
| Financeiro | Motivos para adiar um pagamento | Sem caixa agora, Esperando boleto/NF, Em negociação, Cobrança indevida, Pagar no mês que vem | src/components/financeiro/DecisaoPagamento.tsx:19 | média | não | fácil | GER |
| Financeiro | Atalhos de data para programar pagamento | Amanhã, Sexta, Dia 10, 15, 20, 25 | src/components/financeiro/DecisaoPagamento.tsx:116 | baixa | não | fácil | GER |
| Financeiro | Motivos para não aprovar uma conta a pagar | Falta boleto/nota, Valor errado, Conta repetida, Não reconheço, Vencimento errado | src/components/financeiro/AprovarPagar.tsx:21 | média | não | fácil | GER |
| Financeiro | Categorias que podem ser aprovadas sem documento | tarifas bancárias, juros e multas, comissões · receitas financeiras | src/lib/aprovacao.ts:29, src/lib/aprovacao.ts:30 | baixa | sim | média | GER |
| Financeiro | Palavra → categoria no "gasto rápido" pelo celular (ex.: "posto/diesel" = combustível) | 11 regras de palavras | src/lib/gastoRapido.ts:9 | média | sim | média | GER |
| Financeiro | Categoria do plano de contas → tipo da conta a pagar, e palavras que adivinham o tipo | ~20 categorias e 6 regras de palavras | src/lib/tiposPagar.ts:25, src/lib/tiposPagar.ts:36 | baixa | não | média | GER |
| Financeiro | Atalhos do adiantamento/prestação de contas | Combustível, Correios | src/components/financeiro/Adiantamento.tsx:21 | baixa | não | fácil | GER |
| Financeiro | Categorias do cartão corporativo e as dicas de nota (inclui "item acima de R$ 1.200 vai para o imobilizado") | 10 categorias + dicas | src/lib/cartaoCorporativo.ts:12, src/lib/cartaoCorporativo.ts:15 | baixa | sim | média | GER |
| Financeiro | Compra do cartão casa com a NF-e quando a data fica a até X dias | 5 dias | src/lib/cartaoCorporativo.ts:110 | baixa | não | fácil | GER |
| Financeiro | Frequências das contas fixas | mensal, bimestral, trimestral, semestral, anual | src/components/financeiro/ContasFixas.tsx:25 | baixa | não | fácil | GER |
| Financeiro | Texto do recibo | "… dando plena, geral e irrevogável quitação do valor acima." | src/lib/pdf.ts:1127 | baixa | sim | fácil | GER |
| Financeiro | Parcelamento máximo escrito nos textos do link de pagamento | "em até 12x" | src/components/financeiro/LinkPagamento.tsx:32, src/components/financeiro/LinkPedido.tsx:136 | baixa | sim | fácil | GER |

### Auditoria (exceções e conferências)

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Auditoria | Valores que deixam uma exceção mais grave ou a fazem aparecer | gravidade média a partir de R$ 1.000 · valor redondo ≥ R$ 5.000 múltiplo de R$ 1.000 · pago no mesmo dia ≥ R$ 2.000 · recebido a menor ≥ R$ 500 · mesma pessoa lançou e pagou ≥ R$ 1.000 | src/lib/auditoria.ts:135, src/lib/auditoria.ts:138, src/lib/auditoria.ts:231, src/lib/auditoria.ts:268, src/lib/auditoria.ts:275 | média | sim | média | GER |
| Auditoria | Prazos das exceções | duplicidade 5 dias · baixa sem extrato 7 dias · extrato pendente 7 dias · NF de fornecedor sem lançamento 15 dias · alterações dos últimos 90 dias | src/lib/auditoria.ts:19, src/lib/auditoria.ts:23, src/lib/auditoria.ts:24, src/lib/auditoria.ts:308, src/lib/auditoria.ts:145 | baixa | sim | média | GER |
| Auditoria | Recebido a menor no cartão só vira exceção acima de X% (por causa da taxa) | 15% | src/lib/auditoria.ts:266 | baixa | sim | fácil | GER |

### Assistência, garantia e preventiva

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Assistência | Mensagens de WhatsApp da OS: atualização, "pronta para retirar" e "viu o orçamento?" | "Olá {nome}! Sua OS #… está pronta para retirar na MF Máquinas." e outras | src/pages/Assistencia.tsx:161, src/pages/Assistencia.tsx:162, src/pages/Assistencia.tsx:500 | média | sim | fácil | GER |
| Garantia | Mensagens da fila "Lembrar clientes" (preventiva, garantia acabando, "tudo certo?") | 3 textos fixos | src/pages/Garantias.tsx:69, src/pages/Garantias.tsx:72, src/pages/Garantias.tsx:74 | média | sim | fácil | GER |
| Garantia | Na lista de garantias, máquina sem "próxima preventiva" calcula com 6 meses fixos (não usa "Preventiva a cada" de Configurações) | 6 meses | src/pages/Garantias.tsx:190, src/lib/serieMaquina.ts:34 | baixa | sim | fácil | GER |
| Garantia | Quando a garantia aparece como "vence logo" e a preventiva como "próxima" | 30 dias antes | src/lib/garantia.ts:8, src/lib/garantia.ts:17, src/lib/fichaCliente.ts:123 | baixa | sim | fácil | GER |
| Garantia | Fila de lembrete de preventiva: quem entra e quanto tempo sai da fila | entra 15 dias antes · sai 7 dias após mandar · "lembrar depois" 30 dias | src/pages/Garantias.tsx:405, src/pages/Garantias.tsx:434, src/pages/Garantias.tsx:449 | média | sim | fácil | GER |
| Garantia | Condições da garantia do reparo de máquina de outra empresa (texto que sai no laudo) | "Cobre as peças trocadas e a mão de obra… Não cobre…" | src/lib/garantia.ts:33, src/lib/pdf.ts:413 | baixa | sim | fácil | GER |
| Assistência | O que o técnico confere ao receber a máquina (checklist de entrada) | 8 itens (cabo, torneiras, bandeja…) | src/pages/Assistencia.tsx:57 | baixa | sim | fácil | GER |
| Assistência | Textos de garantia no PDF da OS | "Retorno na garantia do reparo feito pela MF - sem custo" · "Sem garantia de fábrica pela MF - atendimento com orçamento" | src/lib/pdf.ts:361 | baixa | sim | fácil | GER |
| Assistência | Painel pós-venda: máquina pronta e não retirada vira alerta depois de X dias | 7 dias | src/pages/paineis/PainelPosVenda.tsx:88 | baixa | sim | fácil | GER |
| Assistência | Voltagens que podem ser marcadas na máquina vendida | 127V, 220V, 220V trifásica, 380V | src/pages/Garantias.tsx:460 | baixa | sim | fácil | GER |
| Assistência | Link da página da máquina (manuais e garantia) mandado ao cliente | "Olá {nome}! Aqui estão os manuais, as dicas de manutenção e a garantia da sua …" | src/lib/maquinas.ts:9 | baixa | sim | fácil | GER |
| Assistência | Mensagem ao mandar a NFS-e da OS | "Olá! Segue a nota fiscal de serviço nº … da OS #…" | src/components/nfse/NfseOS.tsx:137 | baixa | sim | fácil | GER |

### Técnicos e vídeo chamada

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Vídeo chamada | Termo da vídeo chamada mandado ao cliente (o que é, valor, Pix antes, "responda ACEITO") | texto de 7 linhas | src/lib/osVideo.ts:65 | média | sim | média | TEC |
| Vídeo chamada | OS aberta pelo pedido só com peças vira vídeo chamada com X horas técnicas | 1 hora | src/lib/osVideo.ts:56 | baixa | sim | fácil | TEC |
| Vídeo chamada | Textos padrão da OS remota (condição de entrada e equipamento a confirmar) | "Atendimento remoto por vídeo chamada…" | src/lib/osVideo.ts:7, src/lib/osVideo.ts:9 | baixa | não | fácil | TEC |
| Vídeo chamada | Mensagem ao cliente sobre a vídeo chamada (painel) | "Olá {nome}! Sobre a vídeo chamada da OS #…" | src/components/assistencia/PainelVideoChamadas.tsx:21 | baixa | sim | fácil | TEC |
| Técnicos | Mensagem para chamar um técnico parceiro para atender um cliente da região | "Olá, {técnico}! Aqui é da MF Máquinas. Temos um cliente em … Você pode atender?" | src/components/FichaCliente.tsx:601 | média | não | fácil | TEC |
| Técnicos | Tipos de técnico | Da equipe (MF), Parceiro (outra cidade) | src/pages/Tecnicos.tsx:141 | baixa | não | média | TEC |

### Estoque, compras e produção

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Estoque | Reposição: prazo do fornecedor quando o produto não tem, dias de cobertura e base de consumo | prazo 15 dias · cobrir 30 dias · consumo dos últimos 90 dias | src/lib/reposicao.ts:20, src/lib/reposicao.ts:21, src/lib/reposicao.ts:30, src/pages/paineis/PainelProdutos.tsx:89 | média | sim | fácil | GER |
| Estoque | Folga de segurança do estoque mínimo sugerido | consumo × prazo × 1,5 (base 180 dias) | src/lib/qualidadeProdutos.ts:35, src/lib/reposicao.ts:4 | baixa | sim | fácil | GER |
| Estoque | Situação do giro do estoque | gira rápido < 30 dias · lento > 180 dias · parado 180 dias sem venda | src/lib/giroEstoque.ts:34, src/lib/giroEstoque.ts:35, src/lib/gerencial.ts:230 | baixa | sim | fácil | GER |
| Estoque | Contagem do dia (inventário): de quanto em quanto tempo conta cada curva, quantos itens por dia e a meta | A 30 · B 60 · C 120 dias · 8 itens por dia · meta 98% | src/lib/inventario.ts:25, src/lib/inventario.ts:32, src/components/ContagemEstoque.tsx:339 | baixa | não | fácil | GER |
| Estoque | Painel de máquinas: modelo a produzir e modelo parado | dá para menos de 30 dias de venda · sem venda há 90 dias | src/pages/paineis/PainelMaquinas.tsx:103, src/pages/paineis/PainelMaquinas.tsx:192 | média | sim | fácil | GER |
| Compras | Tolerância de preço entre a nota do fornecedor e a ordem de compra | 2% | src/lib/notaFornecedor.ts:170, src/components/compras/ComparacaoOc.tsx:42 | baixa | sim | fácil | GER |
| Compras | Vencimento sugerido ao receber a compra e prazo da cotação | conta 28 dias · cotação 3 dias | src/pages/Producao.tsx:971, src/components/Cotacoes.tsx:117 | média | sim | fácil | GER |
| Compras | Mensagem de WhatsApp pedindo cotação ao fornecedor | "Olá, {fornecedor}! Pode cotar … para a MF Máquinas…" | src/components/Cotacoes.tsx:340 | baixa | não | fácil | GER |
| Compras | Avaliação de fornecedores: pesos, notas de corte, reavaliação e pontos por gravidade | prazo 35% · qualidade 40% · preço 15% · atendimento 10% · A ≥ 8, B ≥ 6 · A 12, B 6, C 3 meses · crítico 6 meses · leve 1, média 2, grave 4 | src/lib/avaliacaoFornecedor.ts:8, src/lib/avaliacaoFornecedor.ts:10, src/lib/avaliacaoFornecedor.ts:24, src/lib/avaliacaoFornecedor.ts:37, src/lib/avaliacaoFornecedor.ts:42 | baixa | não | média | GER |
| Compras | Notas iniciais da avaliação de fornecedor sem histórico | prazo 8 · qualidade 10 · preço 8 · atendimento 9 | src/lib/avaliacaoFornecedor.ts:63, src/lib/avaliacaoFornecedor.ts:72, src/lib/avaliacaoFornecedor.ts:80, src/lib/avaliacaoFornecedor.ts:84 | baixa | não | fácil | GER |
| Compras | Tipos de ocorrência com fornecedor | Atraso, Defeito, Quantidade errada, Documento errado, Atendimento, Outro | src/lib/avaliacaoFornecedor.ts:16 | baixa | não | fácil | GER |
| Produção | Etapas-modelo da ficha técnica (máquina e peça com etapa terceirizada) | 6 etapas da máquina · injeção terceirizada 15 dias | src/components/producao/FichaTecnica.tsx:35, src/components/producao/FichaTecnica.tsx:42 | baixa | não | fácil | GER |
| Produção | Subconjunto ganha previsão X dias antes da máquina | 3 dias | src/pages/Producao.tsx:466 | baixa | não | fácil | GER |
| Produção | Setores da ordem de produção e as palavras que mandam a peça para a tornearia | Máquinas, Tornearia, Mecânica · eixo, bucha, pá, flange… | src/lib/setorProducao.ts:4, src/lib/setorProducao.ts:10 | baixa | não | média | GER |
| Produção | Grupos da ficha técnica pelas palavras do nome da peça (refrigeração, elétrica, cilindro…) | 6 grupos com listas de palavras | src/lib/fichaGrupos.ts:24 | baixa | não | média | GER |

### Fretes e transportadoras

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Fretes | Diferença aceita entre o frete aprovado e o faturado (acima disso vira "divergente"; o banco tem a mesma regra) | R$ 1,00 ou 2% | src/lib/fretes.ts:212 | baixa | sim | difícil | TRA |
| Fretes | Validade da cotação de frete que vem da API e da cotação digitada | 7 dias (1 dia na cotação rápida) | src/components/fretes/EnvioForm.tsx:561, src/components/fretes/EnvioForm.tsx:584, src/components/fretes/EnvioForm.tsx:613, src/components/fretes/EnvioForm.tsx:628 | média | sim | fácil | TRA |
| Fretes | Mensagem ao cliente: pedido despachado | "Olá {nome}! Seu pedido #… da *MF Máquinas* foi despachado." | src/components/FreteVenda.tsx:127, src/components/fretes/EnvioForm.tsx:192 | média | sim | fácil | TRA |
| Fretes | Mensagens de rastreio: a caminho, chegando, atrasou | 3 textos fixos | src/lib/rastreio.ts:28, src/lib/rastreio.ts:44, src/lib/rastreio.ts:56 | média | sim | fácil | TRA |
| Fretes | Mensagem para pedir cotação de frete à transportadora | "Olá! Aqui é da *MF Máquinas*. Pode cotar este frete?" | src/lib/fretes.ts:310, src/components/FreteVenda.tsx:76, src/components/fretes/FreteRapido.tsx:93, src/pages/Transportadoras.tsx:34 | baixa | não | fácil | TRA |
| Fretes | Mensagem para pedir coleta e as faixas de horário | manhã 08h às 12h · tarde 13h às 18h | src/lib/coleta.ts:101, src/lib/coleta.ts:9 | baixa | não | fácil | TRA |
| Fretes | Frequência de coleta quando a transportadora não tem uma cadastrada | seg a sex, manhã e tarde, 1 dia de antecedência | src/lib/coleta.ts:21 | baixa | não | fácil | TRA |
| Fretes | Alertas do painel de fretes | coleta atrasada após 2 dias sem data · ocorrência parada 3 dias · entregues ficam 15 dias no rastreio | src/lib/fretes.ts:256, src/lib/fretes.ts:247, src/lib/rastreio.ts:9 | baixa | sim | fácil | TRA |
| Fretes | Vencimento sugerido da fatura de CT-e | 15 dias | src/components/fretes/CteFaturas.tsx:188 | baixa | sim | fácil | TRA |
| Fretes | Cubagem do rodoviário (kg por m³) | 300 | src/lib/fretes.ts:132 | baixa | sim | fácil | TRA |
| Fretes | Quantas transportadoras a cotação rápida sugere e os pontos de cada critério | 4 · atende o destino +4, tem WhatsApp +2, já usada +2 | src/lib/freteSugestao.ts:20, src/lib/freteSugestao.ts:23 | baixa | não | fácil | TRA |
| Fretes | Listas do envio: restrições de entrega, modalidades (com textos como "FOB fica mais caro"), quem paga, embalagens, ocorrências, adicionais, serviços | 7 listas | src/lib/fretes.ts:75, src/lib/fretes.ts:87, src/lib/fretes.ts:95, src/lib/fretes.ts:97, src/lib/fretes.ts:102, src/lib/fretes.ts:107, src/lib/fretes.ts:110 | baixa | não | média | TRA |
| Fretes | Regiões do Brasil usadas no frete | Sul, Sudeste, Centro-Oeste, Nordeste, Norte com as UFs | src/lib/fretes.ts:122 | baixa | não | fácil | TRA |
| Fretes | Frete "demorando" na pergunta pronta | na estrada há mais de 7 dias sem previsão | src/lib/respostasProntas.ts:64 | baixa | não | fácil | TRA |

### Marketplaces

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Mercado Livre | Valor a partir do qual o Mercado Livre cobra frete grátis (no texto e na conta do preço sugerido) | R$ 79 | src/components/mercadolivre/AnunciosNovosML.tsx:103, src/components/mercadolivre/AnunciosNovosML.tsx:137 | média | sim | média | MKT |
| Mercado Livre | Tipo de anúncio publicado | Clássico | src/components/mercadolivre/AnunciosNovosML.tsx:74 | baixa | sim | média | MKT |
| Mercado Livre | Alertas do painel: tarifa alta e despacho demorado | tarifa > 18% do faturamento · despacho > 48 h | src/components/mercadolivre/PainelMercadoLivre.tsx:133, src/components/mercadolivre/PainelMercadoLivre.tsx:138 | baixa | sim | fácil | MKT |
| Anúncios | Texto padrão do anúncio (envio, garantia, dúvidas) e do resumo para o Google | "Enviamos para todo o Brasil com nota fiscal…" · "Antes de comprar, mande uma pergunta…" | src/lib/marketplace.ts:213, src/lib/marketplace.ts:209 | baixa | sim | média | MKT |
| Anúncios | Marcas que o título do anúncio corrige a grafia | 6 marcas fixas (My Frost, Taylor, Carpigiani, WEG, Embraco, Tecumseh, Danfoss) | src/lib/marketplace.ts:61 | baixa | não | fácil | MKT |

### Entradas nos bancos

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Entradas | Valor mínimo da tela "Entradas grandes" (entrada sem dono) | R$ 5.000 | src/pages/EntradasGrandes.tsx:13, src/pages/Retaguarda.tsx:15 | média | sim | fácil | ENT |
| Entradas | Sugestão de conciliação: até quantos dias de diferença e transferência entre contas | 15 dias · transferência até 3 dias | src/lib/conciliacao.ts:44, src/lib/conciliacao.ts:47 | baixa | sim | fácil | ENT |
| Entradas | Venda × extrato: janela de busca da entrada do mesmo valor | 10 dias antes a 60 dias depois | src/components/vendas/ConciliarVendas.tsx:78 | baixa | sim | difícil | ENT |
| Entradas | Pagamento do marketplace × nota: janela | até 10 dias depois (ou 3 antes) | src/lib/marketplaces.ts:69 | baixa | sim | fácil | ENT |
| Entradas | Palavras do extrato que dizem o que é cada lançamento (posto, oficina, pedágio, tarifa, vendas; "diesel" sozinho = oficina) | 6 grupos de palavras | src/lib/extratoTipos.ts:33, src/lib/extratoTipos.ts:35, src/lib/extratoTipos.ts:36, src/lib/extratoTipos.ts:37, src/lib/extratoTipos.ts:40 | média | sim | média | ENT |
| Entradas | Marketplace pelo nome no extrato e pelo CNPJ do intermediador na nota | 2 CNPJs do Mercado Livre + 5 regras de nome | src/lib/marketplaces.ts:17, src/lib/marketplaces.ts:24 | baixa | sim | média | ENT |
| Entradas | Canais de taxa (bancos e maquininhas) reconhecidos no DRE | ~19 nomes (Mercado Livre, InfinitePay, Olist, Stone…) | src/lib/dreNotas.ts:255 | baixa | sim | média | ENT |

### Fiscal e contábil

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Fiscal | Estimativas da previsão de impostos da máquina (crédito das compras e IR) | crédito ICMS 12% · crédito PIS/COFINS 9,25% · IRPJ+CSLL 24% | src/lib/impostoMaquina.ts:25, src/components/produtos/ImpostosVenda.tsx:34 | baixa | sim | fácil | FIS |
| Fiscal | Alíquota do crédito de PIS/COFINS sobre fretes e no plano de contas | 9,25% | src/lib/fiscalAvancado.ts:201, src/components/financeiro/PlanoContas.tsx:274 | baixa | sim | fácil | FIS |
| Fiscal | Alíquotas do ano de teste da reforma (CBS e IBS) | CBS 0,9% · IBS 0,1% | src/lib/compliance.ts:130 | baixa | sim | fácil | FIS |
| Fiscal | Nota de fornecedor sem manifestação: quando avisa e quando fica grave | aviso 30 dias · erro 150 dias · prazo 180 dias | src/components/ComplianceFiscal.tsx:42, src/components/ComplianceFiscal.tsx:43, src/components/ComplianceFiscal.tsx:44 | baixa | sim | fácil | FIS |
| Fiscal | Calendário de obrigações: avisos | aviso no meio da tela 3 dias antes · "próximas" 7 dias · resumo 15 dias | src/lib/obrigacoes.ts:326, src/lib/obrigacoes.ts:338, src/components/contador/CalendarioObrigacoes.tsx:373 | baixa | sim | fácil | FIS |
| Fiscal | Certidões: validade sugerida e aviso | federal e CNDT 180 dias · FGTS 30 dias · aviso 15 dias antes | src/lib/certidoes.ts:13, src/lib/certidoes.ts:30 | baixa | sim | fácil | FIS |
| Fiscal | Meta do painel de faturamento | acerto de primeira acima de 95% | src/components/nfe/PainelFaturamento.tsx:48 | baixa | não | fácil | FIS |
| Fiscal | Mensagem pronta para o contador sobre os parcelamentos | texto de ~8 linhas | src/lib/parcelamentos.ts:168 | baixa | não | fácil | FIS |
| Fiscal | Regras do plano Lucro Real: o que abate IR/CSLL e dá crédito, pelas palavras da categoria | ~15 regras de palavras | src/lib/planoLucroReal.ts:13, src/lib/planoLucroReal.ts:45 | baixa | sim | difícil | FIS |
| Fiscal | Modelo pronto de regra de ICMS das máquinas de SC (redução, código de benefício, texto da NF-e) | reduções 48,23/26,66/26,57 e um código de benefício | src/components/FiscalAvancado.tsx:204 | baixa | sim | média | FIS |
| Fiscal | Rótulo da modalidade de frete na emissão da NF-e | "Emitente (MF Máquinas)" | src/components/EmitirNfe.tsx:233 | baixa | não | fácil | FIS |

### Cadastro de clientes

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Clientes | Situação do cliente na Ficha 360 (novo, ativo, em risco, inativo) | novo até 90 dias · em risco 180 dias (ou 1,5× o intervalo, mín. 90) · inativo 365 dias | src/lib/fichaCliente.ts:52, src/lib/fichaCliente.ts:54, src/lib/fichaCliente.ts:55, src/lib/fichaCliente.ts:56, src/lib/fichaCliente.ts:57 | média | sim | fácil | CLI |
| Clientes | Sugestões da Ficha 360 (pagador atrasado, oferecer reposição, próxima compra) | 2+ parcelas com atraso médio > 5 dias · reposição após 30 dias (mín.) · próxima compra em 15 dias | src/lib/fichaCliente.ts:101, src/lib/fichaCliente.ts:110, src/lib/fichaCliente.ts:114 | baixa | sim | fácil | CLI |
| Clientes | Condições de pagamento sugeridas no cadastro | À vista, 30, 30 60, 30 60 90, 3x, 15 +2x | src/lib/fichaCadastral.ts:98 | média | sim | fácil | CLI |
| Clientes | Situações do cliente no funil (CRM) | Lead, Em negociação, Cliente ativo, Inativo | src/lib/fichaCadastral.ts:39 | média | não | média | CLI |
| Clientes | Setores das pessoas de contato do cliente | Compras, Financeiro, Técnico, Proprietário, Gerente, Recebimento | src/components/clientes/PessoasContato.tsx:13 | baixa | não | fácil | CLI |
| Clientes | Etiquetas e limite de endereços de entrega | Loja, Residência, Prédio, Vizinho · máximo 3 | src/components/clientes/EnderecosCliente.tsx:13, src/components/clientes/EnderecosCliente.tsx:15 | baixa | sim | fácil | CLI |
| Clientes | Tipos e canais dos contatos registrados na ficha | Pós-venda, Cobrança, Preventiva, Garantia · WhatsApp, Telefone, E-mail, Visita, Na loja | src/components/FichaCliente.tsx:36, src/components/FichaCliente.tsx:37 | baixa | não | fácil | CLI |
| Clientes | Mensagem com o link da ficha cadastral para assinar | "Olá, {nome}! Para concluir o seu cadastro na {empresa}… (leva 1 minuto)" | src/lib/fichaCadastral.ts:66 | baixa | sim | fácil | CLI |

### Cadastro de produtos

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Produtos | Campos sugeridos na ficha da máquina e da peça (especificações) | 12 da máquina · 8 da peça | src/components/produtos/EditoresMaquina.tsx:9, src/components/produtos/EditoresMaquina.tsx:11 | baixa | sim | fácil | PRD |
| Produtos | Etapas de teste/acabamento padrão da máquina | Vácuo e teste, Giga, Teste de produção, Acabamento, Adesivação, Placa | src/components/produtos/EditoresMaquina.tsx:12 | baixa | não | fácil | PRD |
| Produtos | Unidades aceitas e grafias que viram a mesma unidade | 20 unidades + sinônimos | src/lib/qualidadeProdutos.ts:6, src/lib/qualidadeProdutos.ts:12 | baixa | não | média | PRD |
| Produtos | Unidades do cadastro de serviço | UN, H (hora), Visita | src/pages/Produtos.tsx:590 | baixa | não | fácil | PRD |
| Produtos | Produto parado na qualidade do cadastro | 180 dias sem saída | src/lib/qualidadeProdutos.ts:134 | baixa | sim | fácil | PRD |

### Funcionários

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Funcionários | Setores da equipe | Produção, Assistência técnica, Vendas, Financeiro e administrativo, Expedição e logística, Compras, Diretoria, Outro | src/pages/Funcionarios.tsx:52 | média | não | fácil | FUN |
| Funcionários | Dia de pagamento do salário quando a pessoa não tem um | dia 5 | src/pages/Funcionarios.tsx:315 | baixa | sim | fácil | FUN |
| Funcionários | Tipos de vínculo e a categoria da conta a pagar de cada um | CLT, experiência, estágio, aprendiz, temporário, PJ, autônomo, sócio · sócio = pró-labore, PJ/autônomo = serviços, resto = folha | src/pages/Funcionarios.tsx:44, src/pages/Funcionarios.tsx:55 | baixa | sim | média | FUN |
| Funcionários | Situações do funcionário | Ativo, Em férias, Afastado (INSS), Desligado | src/pages/Funcionarios.tsx:49 | baixa | não | média | FUN |
| Funcionários | Experiência e férias: marcos e avisos | 45 + 45 dias · aviso 15 dias antes · férias: aviso 60 dias antes do limite | src/pages/Funcionarios.tsx:84, src/pages/Funcionarios.tsx:86, src/lib/ferias.ts:12 | baixa | sim | fácil | FUN |
| Funcionários | Divisões da pasta de documentos | Contrato, Exames, Férias, Holerites, Atestados, Ponto, Outros | src/lib/pastaFuncionario.ts:3 | baixa | não | média | FUN |
| Funcionários | Opções de estado civil e escolaridade | 5 e 5 opções | src/pages/Funcionarios.tsx:152, src/pages/Funcionarios.tsx:156 | baixa | não | fácil | FUN |
| Funcionários | Vínculos que exigem PIS, CTPS e ASO na admissão | CLT, experiência, estágio, aprendiz, temporário | src/lib/admissaoFuncionario.ts:13 | baixa | não | fácil | FUN |

### Lojas My Frost Sorveterias e Yozzy

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Lojas | Unidade sem pagar há X dias vira alerta no painel das licenças | 45 dias | src/pages/paineis/PainelLicencas.tsx:50, src/pages/Licenciados.tsx:361 | média | sim | fácil | SOR |
| Lojas | Tipos de pagamento das lojas | Licença, Mensalidade, Royalties, Máquina, Insumos, Marketing, Outro | src/lib/licenciados.ts:104 | média | sim | média | SOR |
| Lojas | Categorias de custo de montar a unidade | 12 categorias (Máquinas, Móveis, Insumos, PDV, Montagem…) | src/lib/licenciados.ts:49 | média | sim | média | SOR |
| Lojas | Situações da loja e do contrato | 7 situações da loja · 4 do contrato | src/lib/licenciados.ts:99, src/lib/licenciados.ts:44 | baixa | não | média | SOR |
| Lojas | Modelos de loja, marcas e situações da máquina na loja | Quiosque, Loja, Loja com cafeteria · My Frost, Yozzy · 4 situações | src/lib/licenciados.ts:43, src/lib/licenciados.ts:22, src/lib/licenciados.ts:55 | baixa | não | média | SOR |
| Lojas | Formas de pagamento das lojas | Pix, Cartão, TED, Boleto, Dinheiro, Outro | src/lib/licenciados.ts:108 | baixa | sim | fácil | SOR |

### My Frost (empresa anterior)

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| My Frost | CNPJ da My Frost escrito no subtítulo da tela | 1 CNPJ (empresa) | src/pages/NotasMyFrostContador.tsx:31 | baixa | não | fácil | MYF |
| My Frost | Janelas para ligar proposta, pedido e nota da mesma máquina | proposta × pedido 120 dias · nota × pedido 90 dias · documentos até 8 meses após a proposta | src/lib/legadoMyFrost.ts:22, src/lib/notasMyFrost.ts:99, src/components/vendas/PropostasTiny.tsx:368 | baixa | não | fácil | MYF |
| My Frost | Nomes dos modelos de máquina reconhecidos na base antiga | lista de regras de nome | src/lib/legadoMyFrost.ts:73 | baixa | não | média | MYF |

### Importações do Tiny

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Tiny | Produto do Tiny vira "máquina" pelo nome do modelo | nomes de 6 linhas de máquina | src/lib/importarTiny.ts:52 | baixa | não | média | TIN |
| Tiny | Situações das propostas do Tiny | Em aberto, Rascunho, Pendente, Aguardando, Aprovado, Não aprovado… | src/lib/propostasTiny.ts:182 | baixa | não | média | TIN |
| Tiny | Importação do Tiny considerada parada depois de X horas | 6 horas | src/lib/tinyHistorico.ts:16 | baixa | não | fácil | TIN |

### Segurança e acessos

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Segurança | O que cada papel pode fazer (aprovar, emitir nota, contas a pagar…) e quais telas vê: só esconder itens do menu é configurável | tabela fixa por papel | src/lib/permissoes.ts:37, src/lib/permissoes.ts:75, src/lib/permissoes.ts:129 | média | sim | difícil | SEG |
| Segurança | Usuário sem entrar vira alerta | 30 dias (tela de acessos) · 90 dias (exceção da auditoria) | src/components/usuarios/Acessos.tsx:36, src/lib/auditoria.ts:322 | baixa | não | fácil | SEG |
| Segurança | Mensagem com o acesso e a senha provisória (usuário e representante) | "Olá, {nome}! Seu acesso ao ERP da MF Máquinas: …" | src/pages/Usuarios.tsx:520, src/lib/portal.ts:234 | baixa | não | fácil | SEG |

### Visual e marca

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Visual | Nome da empresa no menu e na tela de entrar (não usa o nome de Configurações → Empresa) | "MF Máquinas" | src/components/Layout.tsx:85, src/pages/Login.tsx:55 | baixa | não | fácil | DSG |

### Carteira pessoal

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| Pessoal | Categorias dos gastos pessoais e as palavras que escolhem a categoria | 14 categorias · 13 regras de palavras | src/lib/pessoal.ts:28, src/lib/pessoal.ts:32 | média | sim | média | CAR |

### IA do dia a dia

| Área | O que é (em português simples, para a dona) | Valor hoje (sem dados pessoais) | Onde (arquivo:linha) | Muda com que frequência (alta/média/baixa) | Afeta dinheiro ou cliente? (sim/não) | Dificuldade para levar à tela (fácil/média/difícil) | Chat dono |
|---|---|---|---|---|---|---|---|
| IA | Ideias de resposta que aparecem no "Responder WhatsApp com IA" | "Cobrar a parcela em aberto", "Avisar que a máquina ficou pronta"… | src/components/atendimento/ResponderWhatsApp.tsx:23 | baixa | sim | fácil | IAD |
| IA | Perguntas prontas do "Perguntar à IA" (respondem sem IA) | 5 perguntas fixas | src/lib/respostasProntas.ts:7 | baixa | não | média | IAD |
