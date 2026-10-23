# Glossário do ERP Line

> Documento gerado a partir do código do ERP com o comando `npx tsx scripts/gerar-docs.mjs`. Não edite à mão: mude o texto
> na fonte (as definições ficam em scripts/docs/glossario.mjs; o "Aparece em" sai de src/lib/modulos.ts e src/lib/modulosDetalhe.ts) e gere de novo.

**Atualizado em:** 23/10/2026 · **53 termos**.

As siglas e palavras que aparecem no ERP, explicadas em palavras simples. Em cada termo, "Aparece em" mostra as telas que usam a palavra (toque para ver a tela no documento [Módulos do ERP Line](modulos.md)).

## Índice

[B](#b) · [C](#c) · [D](#d) · [E](#e) · [F](#f) · [G](#g) · [I](#i) · [K](#k) · [L](#l) · [M](#m) · [N](#n) · [O](#o) · [P](#p) · [R](#r) · [S](#s) · [T](#t) · [X](#x)

## B

### Backlog

A lista de tarefas de uma equipe, na ordem de prioridade. Usada no Scrum.

_Aparece em: [Scrum das equipes](modulos.md#scrum-das-equipes)._

### Baixa

Marcar uma conta como paga (conta a pagar) ou recebida (conta a receber). No estoque, é a saída do produto: "o estoque baixa" quando a venda é aprovada.

_Aparece em: [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [PDV (venda de balcão)](modulos.md#pdv-venda-de-balcão) · [Painel dos clientes](modulos.md#painel-dos-clientes) · [Clientes](modulos.md#clientes) · [Fornecedores](modulos.md#fornecedores) e mais 13._

### Boleto

Documento de cobrança pago no banco, no aplicativo ou na lotérica, com vencimento.

_Aparece em: [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber) · [Aprovações](modulos.md#aprovações) · [Formas de pagamento](modulos.md#formas-de-pagamento)._

## C

### Carta de correção

Corrige um erro simples de uma NF-e já autorizada (endereço, peso, observação), sem cancelar a nota. Não serve para mudar valor, quantidade ou cliente.

_Aparece em: [Notas fiscais](modulos.md#notas-fiscais)._

### CFOP

Código de 4 números na nota fiscal que diz o tipo de operação: venda, compra, devolução, transferência, conserto… e se é dentro ou fora do estado.

_Aparece em: [Produtos e estoque](modulos.md#produtos-e-estoque) · [Transferências SC ↔ SP](modulos.md#transferências-sc--sp) · [Painel fiscal](modulos.md#painel-fiscal) · [Notas fiscais](modulos.md#notas-fiscais) · [Painel do contador](modulos.md#painel-do-contador)._

### Comissão

A parte da venda que vai para o vendedor ou o representante, calculada pela regra de cada um.

_Aparece em: [Venda de Peças](modulos.md#venda-de-peças) · [Produtos e estoque](modulos.md#produtos-e-estoque) · [Peças de reposição](modulos.md#peças-de-reposição) · [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber) · [Margem de contribuição](modulos.md#margem-de-contribuição) · [Comissões](modulos.md#comissões)._

### Conciliação

Ligar cada linha do extrato do banco à conta lançada no ERP. Quando tudo está conciliado, o saldo do ERP é igual ao do banco.

_Aparece em: [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Painel do financeiro](modulos.md#painel-do-financeiro) · [Bancos e conciliação](modulos.md#bancos-e-conciliação) · [Entre contas e sócios](modulos.md#entre-contas-e-sócios) · [Painel do contador](modulos.md#painel-do-contador) e mais 1._

### Conta master

A conta principal da empresa no ERP. Entre os administradores, só ela abre os usuários e as configurações da empresa.

_Aparece em: [Automações](modulos.md#automações)._

### Cotação

Pedido de preço a um ou mais fornecedores (ou transportadoras) antes de comprar, para comparar e escolher.

_Aparece em: [Início](modulos.md#início-1) · [Venda de Peças](modulos.md#venda-de-peças) · [Fretes e envios](modulos.md#fretes-e-envios) · [Transportadoras](modulos.md#transportadoras) · [Embalagens](modulos.md#embalagens) · [Produção](modulos.md#produção) e mais 2._

### CST

Código em cada item da nota que diz como o imposto é tratado: tributado, isento, com redução, com substituição…

_Aparece em: [Produtos e estoque](modulos.md#produtos-e-estoque)._

### CT-e

Conhecimento de Transporte eletrônico: a nota fiscal do frete, emitida pela transportadora.

_Aparece em: [Tudo do cliente](modulos.md#tudo-do-cliente) · [Fretes e envios](modulos.md#fretes-e-envios) · [Transportadoras](modulos.md#transportadoras) · [Transferências SC ↔ SP](modulos.md#transferências-sc--sp) · [Analista fiscal](modulos.md#analista-fiscal)._

### Curva ABC

Divide produtos ou clientes em três grupos: A são os poucos que trazem a maior parte do faturamento, B os do meio e C os muitos que vendem pouco.

_Aparece em: [Painel dos produtos](modulos.md#painel-dos-produtos) · [Painel gerencial](modulos.md#painel-gerencial)._

## D

### DANFE

A folha impressa que acompanha a mercadoria e mostra os dados da NF-e. A nota que vale é o arquivo XML; o DANFE é a versão em papel.

_Aparece em: [Separação e embalagem](modulos.md#separação-e-embalagem) · [Transferências SC ↔ SP](modulos.md#transferências-sc--sp) · [Notas fiscais](modulos.md#notas-fiscais)._

### DIFAL

Diferença de ICMS entre dois estados, paga na venda para um consumidor final de outro estado.

_Aparece em: [Notas fiscais](modulos.md#notas-fiscais) · [Analista fiscal](modulos.md#analista-fiscal)._

### DRE

Demonstração do Resultado: as receitas menos os custos e as despesas. Mostra se a empresa teve lucro ou prejuízo no período.

_Aparece em: [Painel do financeiro](modulos.md#painel-do-financeiro) · [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber) · [Relatórios](modulos.md#relatórios)._

## E

### EAN

O número do código de barras do produto, usado no leitor e nos marketplaces.

_Aparece em: [Loja online e marketplace](modulos.md#loja-online-e-marketplace) · [Produtos e estoque](modulos.md#produtos-e-estoque) · [Peças de reposição](modulos.md#peças-de-reposição)._

### Extrato

A lista do que entrou e saiu de uma conta do banco. O ERP recebe o extrato por arquivo, por e-mail ou direto do banco.

_Aparece em: [Caixa de e-mail](modulos.md#caixa-de-e-mail) · [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Tudo do cliente](modulos.md#tudo-do-cliente) · [Painel do financeiro](modulos.md#painel-do-financeiro) · [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber) e mais 8._

## F

### Ficha técnica

A lista das peças, das quantidades e das etapas para montar uma máquina. A ordem de produção usa a ficha técnica.

_Aparece em: [Máquinas](modulos.md#máquinas) · [Produção](modulos.md#produção) · [Painel da fábrica](modulos.md#painel-da-fábrica) · [Peças de reposição](modulos.md#peças-de-reposição) · [Componentes de produção](modulos.md#componentes-de-produção)._

### Fluxo de caixa

O dinheiro que entra e que sai, dia a dia, e o saldo que fica. O fluxo previsto mostra o que vem pela frente.

_Aparece em: [Painel do financeiro](modulos.md#painel-do-financeiro) · [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber) · [Relatórios](modulos.md#relatórios)._

## G

### Garantia

O prazo em que o conserto da máquina vendida é por conta da empresa. Começa na venda e depende do modelo.

_Aparece em: [Início](modulos.md#início-1) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Clientes](modulos.md#clientes) · [Painel da assistência](modulos.md#painel-da-assistência) · [Ordens de serviço](modulos.md#ordens-de-serviço) · [Garantias e preventivas](modulos.md#garantias-e-preventivas) e mais 5._

### GNRE

Guia para pagar o ICMS devido a outro estado (como o DIFAL), quando a nota vai para fora.

_Aparece em: [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber) · [Notas fiscais](modulos.md#notas-fiscais)._

## I

### IBS e CBS

Os impostos novos da reforma tributária, que vão substituir aos poucos PIS, COFINS, ICMS e ISS.

_Aparece em: [Painel fiscal](modulos.md#painel-fiscal) · [Notas fiscais](modulos.md#notas-fiscais)._

### ICMS

Imposto estadual sobre a venda e o transporte de mercadorias. Cada estado tem as suas regras.

_Aparece em: [Compras e cotações](modulos.md#compras-e-cotações) · [Transferências SC ↔ SP](modulos.md#transferências-sc--sp) · [Painel fiscal](modulos.md#painel-fiscal) · [Notas fiscais](modulos.md#notas-fiscais) · [Painel do contador](modulos.md#painel-do-contador) · [Analista fiscal](modulos.md#analista-fiscal)._

### Inadimplência

Contas a receber vencidas e ainda não pagas; inadimplente é o cliente que está devendo.

_Aparece em: [Início](modulos.md#início-1) · [Painel do financeiro](modulos.md#painel-do-financeiro)._

### IPI

Imposto federal sobre produtos industrializados, como as máquinas fabricadas.

_Aparece em: [Compras e cotações](modulos.md#compras-e-cotações) · [Transferências SC ↔ SP](modulos.md#transferências-sc--sp) · [Painel fiscal](modulos.md#painel-fiscal) · [Notas fiscais](modulos.md#notas-fiscais) · [Painel do contador](modulos.md#painel-do-contador) · [Analista fiscal](modulos.md#analista-fiscal)._

## K

### Kanban

Quadro em colunas (etapas) em que cada cartão anda de uma coluna para a outra até terminar.

_Aparece em: [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas)._

### Kit

Um produto formado por outros produtos, vendido junto. Ao vender o kit, o estoque de cada item baixa.

_Aparece em: [Venda de Peças](modulos.md#venda-de-peças) · [Loja online e marketplace](modulos.md#loja-online-e-marketplace) · [Separação e embalagem](modulos.md#separação-e-embalagem) · [Produtos e estoque](modulos.md#produtos-e-estoque) · [Peças de reposição](modulos.md#peças-de-reposição) · [Importar dados](modulos.md#importar-dados)._

## L

### Lucro Real

Regime de imposto da empresa em que o IRPJ e a CSLL são calculados sobre o lucro de verdade, com obrigações mensais.

_Aparece em: [Painel do financeiro](modulos.md#painel-do-financeiro) · [Painel fiscal](modulos.md#painel-fiscal) · [Painel do contador](modulos.md#painel-do-contador) · [Analista fiscal](modulos.md#analista-fiscal)._

## M

### Marcador

Etiqueta colorida para organizar cadastros, vendas, OS e contas. Marcadores só somam: importações e correções não tiram os que já existem.

_Aparece em: [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Clientes](modulos.md#clientes) · [Fornecedores](modulos.md#fornecedores) · [Serviços](modulos.md#serviços) · [Transportadoras](modulos.md#transportadoras) e mais 10._

### Margem de contribuição

Quanto sobra de cada venda depois de tirar o custo do produto, os impostos, a comissão, o frete e as taxas.

_Aparece em: [Gestão de preços](modulos.md#gestão-de-preços) · [Serviços](modulos.md#serviços) · [Máquinas](modulos.md#máquinas) · [Produtos e estoque](modulos.md#produtos-e-estoque) · [Painel das máquinas](modulos.md#painel-das-máquinas) · [Painel dos produtos](modulos.md#painel-dos-produtos) e mais 6._

### Matriz e filial

A matriz é a unidade principal da empresa (SC) e a filial é a outra unidade (SP). Cada uma tem o seu estoque.

_Aparece em: [Início](modulos.md#início-1) · [Painel de vendas](modulos.md#painel-de-vendas) · [Transportadoras](modulos.md#transportadoras) · [Transferências SC ↔ SP](modulos.md#transferências-sc--sp) · [Entre contas e sócios](modulos.md#entre-contas-e-sócios) · [Configurações](modulos.md#configurações-1)._

## N

### NCM

Código de 8 números que classifica o produto. É dele que saem as regras de imposto do item.

_Aparece em: [Painel dos clientes](modulos.md#painel-dos-clientes) · [Máquinas](modulos.md#máquinas) · [Produtos e estoque](modulos.md#produtos-e-estoque) · [Painel dos produtos](modulos.md#painel-dos-produtos) · [Peças de reposição](modulos.md#peças-de-reposição) · [Componentes de produção](modulos.md#componentes-de-produção) e mais 4._

### NF-e

Nota fiscal eletrônica de produtos: a nota da venda, da compra, da devolução ou da transferência.

_Aparece em: [Início](modulos.md#início-1) · [Caixa de e-mail](modulos.md#caixa-de-e-mail) · [Painel de vendas](modulos.md#painel-de-vendas) · [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Loja online e marketplace](modulos.md#loja-online-e-marketplace) e mais 15._

### NFS-e

Nota fiscal eletrônica de serviço, emitida pela prefeitura. Usada no conserto e na mão de obra da assistência.

_Aparece em: [Tudo do cliente](modulos.md#tudo-do-cliente) · [Ordens de serviço](modulos.md#ordens-de-serviço) · [Painel fiscal](modulos.md#painel-fiscal) · [Notas fiscais](modulos.md#notas-fiscais)._

## O

### OC

Ordem de compra: o pedido feito ao fornecedor, com itens, preço, prazo e pagamento.

_Aparece em: [Produção](modulos.md#produção) · [Painel da fábrica](modulos.md#painel-da-fábrica) · [Compras e cotações](modulos.md#compras-e-cotações) · [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber) · [Notas fiscais](modulos.md#notas-fiscais) · [Configurações](modulos.md#configurações-1)._

### OFX

O arquivo de extrato que o banco gera e o ERP importa.

_Aparece em: [Caixa de e-mail](modulos.md#caixa-de-e-mail) · [Bancos e conciliação](modulos.md#bancos-e-conciliação) · [Configurações](modulos.md#configurações-1) · [Importar dados](modulos.md#importar-dados)._

### OP

Ordem de produção: o pedido para a fábrica montar uma ou mais máquinas, com as peças e as etapas.

_Aparece em: [Início](modulos.md#início-1) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Máquinas](modulos.md#máquinas) · [Teste do giga (REG-006)](modulos.md#teste-do-giga-reg-006) · [Produção](modulos.md#produção) · [Painel da fábrica](modulos.md#painel-da-fábrica) e mais 3._

### Open Finance

Forma autorizada de o banco mandar o extrato para o ERP sozinho, sem baixar arquivo.

_Aparece em: [Bancos e conciliação](modulos.md#bancos-e-conciliação) · [Configurações](modulos.md#configurações-1)._

### OS

Ordem de serviço: o registro de um conserto ou atendimento da assistência, da entrada da máquina até a entrega.

_Aparece em: [Início](modulos.md#início-1) · [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Tudo do cliente](modulos.md#tudo-do-cliente) · [Técnicos](modulos.md#técnicos) · [Serviços](modulos.md#serviços) e mais 15._

## P

### PDV

Ponto de venda: o caixa da venda de balcão, numa tela própria, com leitor de código de barras.

_Aparece em: [Painel de vendas](modulos.md#painel-de-vendas) · [Fluxo de pedidos](modulos.md#fluxo-de-pedidos) · [Peças de reposição](modulos.md#peças-de-reposição) · [Formas de pagamento](modulos.md#formas-de-pagamento) · [Configurações](modulos.md#configurações-1)._

### Perfil

O tipo de acesso de cada pessoa no ERP (vendas, financeiro, técnico…). O perfil decide as telas que ela abre e o que pode fazer.

_Aparece em: [PDV (venda de balcão)](modulos.md#pdv-venda-de-balcão) · [Separação e embalagem](modulos.md#separação-e-embalagem) · [Produção](modulos.md#produção) · [Produtos e estoque](modulos.md#produtos-e-estoque) · [Compras e cotações](modulos.md#compras-e-cotações) · [Painel do financeiro](modulos.md#painel-do-financeiro) e mais 3._

### PIS e COFINS

Contribuições federais sobre o faturamento. No Lucro Real, as compras geram crédito que abate o que se paga.

_Aparece em: [Transferências SC ↔ SP](modulos.md#transferências-sc--sp) · [Painel fiscal](modulos.md#painel-fiscal) · [Notas fiscais](modulos.md#notas-fiscais) · [Painel do contador](modulos.md#painel-do-contador) · [Analista fiscal](modulos.md#analista-fiscal)._

### Pix

Pagamento instantâneo pelo banco, a qualquer hora, por chave, QR Code ou copia e cola.

_Aparece em: [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Gestão de preços](modulos.md#gestão-de-preços) · [PDV (venda de balcão)](modulos.md#pdv-venda-de-balcão) · [Tudo do cliente](modulos.md#tudo-do-cliente) · [Fornecedores](modulos.md#fornecedores) e mais 11._

### Preventiva

Manutenção feita antes de a máquina quebrar, no prazo indicado para o modelo. O ERP lembra quando está perto.

_Aparece em: [Início](modulos.md#início-1) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Painel da assistência](modulos.md#painel-da-assistência) · [Garantias e preventivas](modulos.md#garantias-e-preventivas) · [Painel das máquinas](modulos.md#painel-das-máquinas) · [Configurações](modulos.md#configurações-1)._

### Proposta comercial

O orçamento bonito que vai para o cliente por link, com fotos, garantia e condições, para ele aprovar ou recusar.

_Aparece em: [Painel de vendas](modulos.md#painel-de-vendas) · [Venda de Peças](modulos.md#venda-de-peças) · [Venda de Máquinas](modulos.md#venda-de-máquinas) · [Painel dos clientes](modulos.md#painel-dos-clientes) · [Tudo do cliente](modulos.md#tudo-do-cliente) · [Fluxo de pedidos](modulos.md#fluxo-de-pedidos) e mais 6._

## R

### Régua de cobrança

Lembretes automáticos ao cliente antes e depois do vencimento de uma conta.

_Aparece em: [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber)._

### Representante

Vendedor externo que não entra no ERP: usa um portal próprio, com os pedidos, os clientes e as comissões dele.

_Aparece em: [Painel de vendas](modulos.md#painel-de-vendas) · [Venda de Peças](modulos.md#venda-de-peças) · [Fluxo de pedidos](modulos.md#fluxo-de-pedidos) · [Formas de pagamento](modulos.md#formas-de-pagamento) · [Margem de contribuição](modulos.md#margem-de-contribuição) · [Comissões](modulos.md#comissões) e mais 2._

## S

### SEFAZ

Secretaria da Fazenda do estado: é quem autoriza as notas fiscais eletrônicas.

_Aparece em: [Fluxo de pedidos](modulos.md#fluxo-de-pedidos) · [Fretes e envios](modulos.md#fretes-e-envios) · [Transferências SC ↔ SP](modulos.md#transferências-sc--sp) · [Painel fiscal](modulos.md#painel-fiscal) · [Notas fiscais](modulos.md#notas-fiscais) · [Analista fiscal](modulos.md#analista-fiscal) e mais 1._

### Sprint

Um período curto (1 ou 2 semanas) em que a equipe se compromete a terminar um conjunto de tarefas. Usado no Scrum.

_Aparece em: [Scrum das equipes](modulos.md#scrum-das-equipes)._

## T

### Tabela de preço

Uma lista de preços para um tipo de cliente ou canal (balcão, revenda, marketplace…).

_Aparece em: [Venda de Peças](modulos.md#venda-de-peças) · [Gestão de preços](modulos.md#gestão-de-preços) · [PDV (venda de balcão)](modulos.md#pdv-venda-de-balcão) · [Clientes](modulos.md#clientes) · [Serviços](modulos.md#serviços) · [Máquinas](modulos.md#máquinas) e mais 3._

### Teste do giga

O teste elétrico de cada máquina na bancada (registro de qualidade REG-006), feito antes de ela sair da fábrica.

_Aparece em: [Máquinas](modulos.md#máquinas) · [Teste do giga (REG-006)](modulos.md#teste-do-giga-reg-006) · [Produção](modulos.md#produção) · [Painel das máquinas](modulos.md#painel-das-máquinas)._

### Ticket médio

O valor médio de cada venda: o total vendido dividido pelo número de vendas.

_Aparece em: [Painel de vendas](modulos.md#painel-de-vendas) · [Relatórios](modulos.md#relatórios) · [Painel gerencial](modulos.md#painel-gerencial)._

## X

### XML

O arquivo da nota fiscal eletrônica. É ele que vale para o fisco e é o que o contador recebe.

_Aparece em: [Caixa de e-mail](modulos.md#caixa-de-e-mail) · [Loja online e marketplace](modulos.md#loja-online-e-marketplace) · [Notas fiscais](modulos.md#notas-fiscais) · [Painel do contador](modulos.md#painel-do-contador) · [Analista fiscal](modulos.md#analista-fiscal) · [Importar dados](modulos.md#importar-dados) e mais 1._
