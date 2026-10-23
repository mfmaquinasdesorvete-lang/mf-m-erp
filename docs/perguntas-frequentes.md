# Perguntas frequentes

> Documento gerado a partir do código do ERP com o comando `npx tsx scripts/gerar-docs.mjs`. Não edite à mão: mude o texto
> na fonte (a lista de perguntas fica em scripts/docs/perguntas-frequentes.mjs; as respostas vêm de src/lib/esquemas.ts e src/lib/modulosDetalhe.ts) e gere de novo.

**Atualizado em:** 23/10/2026 · **37 perguntas**.

As dúvidas mais comuns do dia a dia, com a resposta curta: o passo a passo, quem faz cada passo e em qual tela. Toque no nome de uma tela para ver tudo o que ela faz no documento [Módulos do ERP Line](modulos.md).

## Índice

- [Vendas](#vendas)
  - [Como faço um orçamento e mando para o cliente?](#como-faço-um-orçamento-e-mando-para-o-cliente)
  - [Como aprovo a venda e recebo o pagamento?](#como-aprovo-a-venda-e-recebo-o-pagamento)
  - [Como emito a NF-e de uma venda?](#como-emito-a-nf-e-de-uma-venda)
  - [Como vendo no balcão?](#como-vendo-no-balcão)
  - [Como vendo uma máquina?](#como-vendo-uma-máquina)
  - [As vendas do Mercado Livre entram sozinhas?](#as-vendas-do-mercado-livre-entram-sozinhas)
  - [Como funciona a comissão do vendedor?](#como-funciona-a-comissão-do-vendedor)
- [Clientes](#clientes)
  - [Como cadastro um cliente novo?](#como-cadastro-um-cliente-novo)
  - [Como peço para o cliente conferir e assinar a ficha?](#como-peço-para-o-cliente-conferir-e-assinar-a-ficha)
  - [Onde vejo tudo de um cliente num lugar só?](#onde-vejo-tudo-de-um-cliente-num-lugar-só)
  - [Como o cliente paga uma conta em aberto sozinho?](#como-o-cliente-paga-uma-conta-em-aberto-sozinho)
- [Entrega](#entrega)
  - [Como separo, embalo e despacho um pedido?](#como-separo-embalo-e-despacho-um-pedido)
  - [Como cotar o frete?](#como-cotar-o-frete)
  - [Como mando o código de rastreio ao cliente?](#como-mando-o-código-de-rastreio-ao-cliente)
- [Assistência](#assistência)
  - [Como abro uma ordem de serviço (OS)?](#como-abro-uma-ordem-de-serviço-os)
  - [Como sei se a máquina do cliente está na garantia?](#como-sei-se-a-máquina-do-cliente-está-na-garantia)
  - [Como lembro os clientes da preventiva?](#como-lembro-os-clientes-da-preventiva)
  - [Como emito a nota de serviço (NFS-e) da OS?](#como-emito-a-nota-de-serviço-nfs-e-da-os)
- [Fábrica, estoque e compras](#fábrica-estoque-e-compras)
  - [Como compro as peças que estão faltando?](#como-compro-as-peças-que-estão-faltando)
  - [Como abro uma ordem de produção (OP)?](#como-abro-uma-ordem-de-produção-op)
  - [Como registro o teste do giga de uma máquina?](#como-registro-o-teste-do-giga-de-uma-máquina)
  - [Como mando mercadoria de SC para SP?](#como-mando-mercadoria-de-sc-para-sp)
  - [Como faço a contagem do estoque?](#como-faço-a-contagem-do-estoque)
- [Financeiro](#financeiro)
  - [Como lanço uma conta a pagar?](#como-lanço-uma-conta-a-pagar)
  - [Por que a conta ainda não pode ser paga?](#por-que-a-conta-ainda-não-pode-ser-paga)
  - [Como cobro um cliente atrasado?](#como-cobro-um-cliente-atrasado)
  - [Como importo o extrato do banco e concilio?](#como-importo-o-extrato-do-banco-e-concilio)
  - [Entrou um dinheiro no banco e não sei de quem é. E agora?](#entrou-um-dinheiro-no-banco-e-não-sei-de-quem-é-e-agora)
  - [Gastei no cartão da empresa. O que faço?](#gastei-no-cartão-da-empresa-o-que-faço)
- [Notas e contador](#notas-e-contador)
  - [Chegou a nota do fornecedor. O que faço?](#chegou-a-nota-do-fornecedor-o-que-faço)
  - [Como faço a devolução de uma venda?](#como-faço-a-devolução-de-uma-venda)
  - [Como o mês é fechado com o contador?](#como-o-mês-é-fechado-com-o-contador)
  - [Como acompanho um parcelamento de imposto?](#como-acompanho-um-parcelamento-de-imposto)
- [O ERP](#o-erp)
  - [Como dou acesso ao ERP para alguém novo?](#como-dou-acesso-ao-erp-para-alguém-novo)
  - [Esqueci a senha. Como entro?](#esqueci-a-senha-como-entro)
  - [Tenho uma ideia para melhorar o ERP. Onde anoto?](#tenho-uma-ideia-para-melhorar-o-erp-onde-anoto)
  - [Quero saber o que uma tela faz. Onde vejo?](#quero-saber-o-que-uma-tela-faz-onde-vejo)
- [Onde fica a tela?](#onde-fica-a-tela)

## Vendas

### Como faço um orçamento e mando para o cliente?

O cliente recebe a proposta, abre, aprova e o pedido já fica aprovado no ERP. Passo a passo:

1. **Orçamento pronto** (itens, frete e pagamento) — Vendas · tela Venda de Peças
2. **Enviar a proposta** (WhatsApp ou e-mail) — Vendas · tela Venda de Peças
3. **Cliente abre o link** (vendas recebe o aviso) — Cliente
4. **Aprova ou recusa** (recusa pede o motivo) — Cliente
5. **Pedido aprovado** (sem digitar de novo) — O ERP sozinho · tela Venda de Peças
6. **Link de pagamento** (Pix ou cartão) — O ERP sozinho · tela Venda de Peças

- **Orçamento:** cliente, unidade, origem, tabela de preço, vendedor, itens (com kits e nº de série), pagamento, parcelas, desconto e frete.
- **Proposta:** envio por WhatsApp ou e-mail com link; o ERP avisa quando o cliente abre, aprova ou recusa (com o motivo).
- **PDF e WhatsApp:** proposta ou pedido em PDF com o nome do cliente; no Pix, vão o QR Code e o copia e cola.

_Tela [Venda de Peças](modulos.md#venda-de-peças): menu Vendas → Venda de Peças. Quem pode abrir: Administrador, Vendas e Financeiro._

### Como aprovo a venda e recebo o pagamento?

- **Aprovar venda:** baixa o estoque e gera as parcelas no financeiro; pode emitir a NF-e sozinha e já criar o link de pagamento.
- **Pagamento:** filtro por recebidas, a receber, recebidas em parte, vencidas e sem conta a receber, pelas contas do financeiro.
- **Link de pagamento:** InfinitePay (Pix ou cartão) ou Mercado Pago (cartão); quando o cliente paga, a conta é baixada sozinha.

_Tela [Venda de Peças](modulos.md#venda-de-peças): menu Vendas → Venda de Peças. Quem pode abrir: Administrador, Vendas e Financeiro._

### Como emito a NF-e de uma venda?

- **NF-e:** conferência do cadastro antes de mandar pela Focus NF-e; erros em vermelho travam e alertas em amarelo deixam emitir.
- **Emitir NF-e:** nota de um pedido aprovado ou nota direta, de saída ou de entrada (conserto, garantia, máquina usada, comodato).
- **Conferência antes de enviar:** o ERP confere cliente, produtos e unidade e avisa se a nota sai valendo ou só como teste.

_Tela [Venda de Peças](modulos.md#venda-de-peças): menu Vendas → Venda de Peças. Quem pode abrir: Administrador, Vendas e Financeiro._

_Tela [Notas fiscais](modulos.md#notas-fiscais): menu Fiscal → Notas fiscais. Quem pode abrir: Administrador, Vendas, Financeiro, Contador e Compras._

### Como vendo no balcão?

O cliente chega na loja, compra a peça e sai com o comprovante. Passo a passo:

1. **Abrir o PDV** (em outra aba) — Vendas · tela PDV (venda de balcão)
2. **Buscar a peça** (nome, código ou leitor) — Vendas · tela PDV (venda de balcão)
3. **Cliente e desconto** (acima da regra: senha) — Vendas · tela PDV (venda de balcão)
4. **Receber** (Pix, cartão ou dinheiro) — Vendas · tela PDV (venda de balcão)
5. **Estoque baixa** — O ERP sozinho · tela Produtos e estoque
6. **Nota e comprovante** — Fiscal · tela Notas fiscais

- **Caixa:** abrir com operador e troco inicial; sangria, reforço e devolução; resumo por forma de recebimento; cupom de abertura, relatório de movimentação e fechamento com conferência (contado x esperado) e histórico.
- **Finalizar (F2):** a venda fica entregue, o estoque da loja baixa e a conta entra recebida; se algo não fechar, nada é gravado.
- **Atalhos de teclado:** F8 cliente, F9 vendedor e F2 finaliza; no computador o cursor já fica pronto para o leitor.

_Tela [PDV (venda de balcão)](modulos.md#pdv-venda-de-balcão): Cartão rosa "PDV" no alto do menu (abre em outra aba); também pela busca do menu. Quem pode abrir: Administrador, Vendas e Financeiro._

### Como vendo uma máquina?

Da proposta da máquina à máquina funcionando no cliente, com garantia e preventiva contadas. Passo a passo:

1. **Proposta da máquina** — Vendas · tela Venda de Máquinas
2. **Venda aprovada** (pelo link ou na conversa) — Cliente
3. **Ordem de produção** (se não houver pronta) — O ERP sozinho · tela Produção
4. **Montagem** (etapas e peças) — Técnico · tela Produção
5. **Teste do giga** (aprovada para sair) — Técnico · tela Teste do giga (REG-006)
6. **NF-e emitida** — Fiscal · tela Notas fiscais
7. **Entrega e instalação** — Logística · tela Fretes e envios
8. **Máquina na ficha** (garantia e preventiva) — O ERP sozinho · tela Clientes
9. **Página da máquina** (manuais pelo WhatsApp) — Assistência

### As vendas do Mercado Livre entram sozinhas?

A venda paga entra sozinha, a nota e o rastreio voltam para o Mercado Livre e o dinheiro é conciliado. Passo a passo:

1. **Cliente compra** (no anúncio do ML) — Cliente
2. **Venda entra no ERP** (cliente e itens prontos) — O ERP sozinho · tela Loja online e marketplace
3. **NF-e emitida** — Fiscal · tela Notas fiscais
4. **NF vai para o ML** (sozinha, a cada 10 min) — O ERP sozinho · tela Loja online e marketplace
5. **Separar e etiquetar** — Expedição · tela Separação e embalagem
6. **Rastreio** — O ERP sozinho · tela Loja online e marketplace
7. **Dinheiro liberado** (Mercado Pago) — Financeiro · tela Contas a pagar e receber
8. **Conciliado no banco** — Financeiro · tela Bancos e conciliação

- **Vendas automáticas:** cada venda paga no Mercado Livre entra sozinha no ERP como pedido, pelo aviso que o Mercado Livre manda.
- **Envio do estoque:** o anúncio mostra o estoque da unidade e muda em até 5 minutos; kit conta o que dá para montar.

_Tela [Loja online e marketplace](modulos.md#loja-online-e-marketplace): menu Vendas → Loja online e marketplace. Quem pode abrir: Administrador, Vendas, Financeiro e Marketplaces._

### Como funciona a comissão do vendedor?

Da venda com vendedor à comissão paga, calculada sozinha e sem planilha. Passo a passo:

1. **Venda com vendedor** (ou o da carteira do cliente) — Vendas · tela Venda de Peças
2. **Comissão calculada** (item a item, pelas regras) — O ERP sozinho · tela Comissões
3. **Comissão liberada** (na aprovação ou no pagamento) — O ERP sozinho · tela Comissões
4. **Gerar a conta** (marcar as do vendedor) — Financeiro · tela Comissões
5. **Aprovação** — Diretoria · tela Aprovações
6. **Comissão paga** (a baixa marca como paga) — Financeiro · tela Contas a pagar e receber
7. **Vendedor confere** (vê só as próprias) — Vendas · tela Comissões

- **Comissão automática:** escolhido o vendedor no pedido, a comissão sai sozinha, item a item, pelas regras dele.
- **Quando sai:** no recebimento (a cada parcela paga), no faturamento (na aprovação) ou misto (uma parte na aprovação e o resto nas parcelas).

_Tela [Comissões](modulos.md#comissões): menu Gestão → Comissões. Quem pode abrir: Administrador, Vendas e Financeiro._

## Clientes

### Como cadastro um cliente novo?

O cadastro passo a passo, conferido na Receita, sem repetir quem já existe. Passo a passo:

1. **Quem é o cliente** (CPF ou CNPJ) — Vendas · tela Clientes
2. **Conferir na Receita** (nome e endereço certos) — O ERP sozinho · tela Clientes
3. **Já existe?** (aviso de já cadastrado) — O ERP sozinho · tela Clientes
4. **Contato e endereço** (endereço pelo CEP) — Vendas · tela Clientes
5. **Assinar a ficha** (na hora ou por link) — Cliente
6. **Abrir a venda** — Vendas · tela Venda de Peças

- **Cliente novo passo a passo:** quem é (com a Receita e o aviso de já cadastrado), contato, endereço, venda e revisão.
- **Receita:** o CNPJ preenche nome, inscrição estadual e endereço e mostra situação, Simples ou MEI, atividade e porte.

_Tela [Clientes](modulos.md#clientes): menu Cadastros → Clientes. Quem pode abrir: Administrador, Vendas, Financeiro e Técnico._

### Como peço para o cliente conferir e assinar a ficha?

Pela página **Ficha cadastral**, que abre por um link, sem entrar no ERP. O cliente confere os dados, corrige o que mudou e assina a ficha; o ERP guarda a assinatura com data, hora e o comprovante.

- **Quem recebe:** O cliente que precisa assinar ou atualizar o cadastro
- **Onde a equipe gera o link:** Clientes → abrir o cliente → Assinatura da ficha → WhatsApp, E-mail ou Copiar

### Onde vejo tudo de um cliente num lugar só?

[Tudo do cliente](modulos.md#tudo-do-cliente): Busca pelo CNPJ, CPF ou nome, confirma quem é e junta numa página só tudo do cliente: vendas, propostas, notas, contas, extrato dos bancos, recibos, OS, máquinas e fretes.

_Tela [Tudo do cliente](modulos.md#tudo-do-cliente): menu Cadastros → Tudo do cliente. Quem pode abrir: Administrador, Vendas, Financeiro e Técnico._

### Como o cliente paga uma conta em aberto sozinho?

Pela página **Página do cliente**, que abre por um link, sem entrar no ERP. Contas em aberto, Pix copia e cola e segunda via do boleto: o link que vai na régua de cobrança e nas mensagens de cobrança.

- **Quem recebe:** O cliente com conta a receber
- **Onde a equipe gera o link:** Clientes → abrir o cliente → Ver como o cliente vê (ou a cobrança no Financeiro, que já leva o link)

## Entrega

### Como separo, embalo e despacho um pedido?

- **Fila de pedidos:** número, cliente, cidade, itens, transportadora, responsável, situação da NF-e e há quanto tempo está na etapa (cor pelo atraso).
- **Conferência com leitor:** lê o código de barras, o SKU ou o nº de série de cada item (leitor USB ou Bluetooth); só fecha com todos os itens conferidos.
- **Embalar:** informa volumes, peso e transportadora (ou retirada / entrega própria) e abre o editor de etiquetas.
- **Despachar:** exige a NF-e autorizada; grava a transportadora e o rastreio, e o cliente recebe o aviso por e-mail com o código.

_Tela [Separação e embalagem](modulos.md#separação-e-embalagem): menu Logística → Separação e embalagem. Quem pode abrir: Administrador, Vendas, Financeiro e Expedição._

### Como cotar o frete?

- **Pedido de cotação padronizado:** mensagem pronta para copiar ou mandar no WhatsApp de cada transportadora, com todos os dados da carga.
- **Cotações lado a lado:** valor, prazo, validade, versão da tabela e adicionais (TDE, TRT, GRIS, pedágio…); escolher a mais cara pede justificativa.
- **Agendar a coleta:** dias de coleta da transportadora em botões, manhã ou tarde, urgência, nº da coleta e o pedido pronto para o WhatsApp.

_Tela [Fretes e envios](modulos.md#fretes-e-envios): menu Logística → Fretes e envios. Quem pode abrir: Administrador, Vendas e Financeiro._

### Como mando o código de rastreio ao cliente?

O cliente sabe onde está o pedido sem precisar perguntar. Passo a passo:

1. **Pedido despachado** — Expedição · tela Separação e embalagem
2. **Código de rastreio** (preenchido na lista) — Logística · tela Rastreio das entregas
3. **E-mail ao cliente** (sozinho, com o código) — O ERP sozinho · tela Rastreio das entregas
4. **WhatsApp pronto** (com a previsão e o link) — Logística · tela Rastreio das entregas
5. **Passou da previsão?** (aparece em destaque) — Logística · tela Rastreio das entregas
6. **Entregue** — Logística · tela Fluxo de pedidos

- **Mandar pelo WhatsApp:** mensagem pronta com o nome do cliente, nº do pedido, transportadora, código, previsão e o link de rastreio.

_Tela [Rastreio das entregas](modulos.md#rastreio-das-entregas): menu Logística → Rastreio das entregas. Quem pode abrir: Administrador, Vendas e Financeiro._

## Assistência

### Como abro uma ordem de serviço (OS)?

Do chamado do cliente à máquina de volta e à próxima preventiva. Passo a passo:

1. **Cliente chama** (WhatsApp ou página da máquina) — Cliente
2. **Abrir a OS** (garantia conferida) — Assistência · tela Ordens de serviço
3. **Diagnóstico** — Técnico · tela Ordens de serviço
4. **Orçamento aprovado** (fora da garantia) — Cliente
5. **Conserto e peças** — Técnico · tela Ordens de serviço
6. **NFS-e e cobrança** — Financeiro · tela Ordens de serviço
7. **Máquina volta** (NF de retorno) — Logística · tela Fretes e envios
8. **Próxima preventiva** — Assistência · tela Garantias e preventivas

- **Atendimento:** cliente, unidade, situação, técnico, máquina, série, entrada, previsão, defeito, condição de entrada, diagnóstico e serviço feito.
- **Garantia na hora:** mostra as máquinas do cliente (cadastro e notas emitidas) e se estão na garantia; fora dela, lança a taxa do diagnóstico por vídeo.
- **Checklist de recepção:** cabo, torneiras, bandeja, tampa, painel, batedor, limpeza e acessórios, com OK ou Atenção e observação.

_Tela [Ordens de serviço](modulos.md#ordens-de-serviço): menu Assistência → Ordens de serviço. Quem pode abrir: Administrador, Vendas, Financeiro e Técnico._

### Como sei se a máquina do cliente está na garantia?

- **Máquinas vendidas:** cada máquina de pedido aprovado entra sozinha, uma linha por máquina, com o nº de série, a garantia e a próxima preventiva calculadas.
- **Cartões que filtram:** em garantia, garantia vence em 30 dias, fora da garantia, preventiva atrasada e preventiva nos próximos 30 dias.

_Tela [Garantias e preventivas](modulos.md#garantias-e-preventivas): menu Assistência → Garantias e preventivas. Quem pode abrir: Administrador, Vendas, Financeiro e Técnico._

### Como lembro os clientes da preventiva?

Depois da venda: o ERP lembra a preventiva e cuida da garantia de cada máquina. Passo a passo:

1. **Máquina vendida** (entra na ficha) — Vendas · tela Clientes
2. **Garantia contada** (da data da NF) — O ERP sozinho · tela Garantias e preventivas
3. **Aviso de preventiva** — O ERP sozinho · tela Garantias e preventivas
4. **Agendar o técnico** (da região do cliente) — Assistência · tela Ordens de serviço
5. **OS da preventiva** — Técnico · tela Ordens de serviço
6. **Próxima data** — O ERP sozinho · tela Garantias e preventivas

- **Lembrar clientes:** fila do dia com as preventivas vencidas ou dos próximos 15 dias; enviar o lembrete tira a máquina da fila por 7 dias.
- **WhatsApp com mensagem pronta:** lembra a preventiva, avisa que a garantia está acabando ou pergunta se está tudo certo com a máquina.

_Tela [Garantias e preventivas](modulos.md#garantias-e-preventivas): menu Assistência → Garantias e preventivas. Quem pode abrir: Administrador, Vendas, Financeiro e Técnico._

### Como emito a nota de serviço (NFS-e) da OS?

Da OS concluída à nota de serviço autorizada pela prefeitura e entregue ao cliente. Passo a passo:

1. **OS concluída** — Técnico · tela Ordens de serviço
2. **Conferir antes** (antes de enviar) — O ERP sozinho · tela Ordens de serviço
3. **Emitir a NFS-e** (pela Focus) — Financeiro · tela Ordens de serviço
4. **Prefeitura autoriza** (acompanhada no ERP) — O ERP sozinho · tela Ordens de serviço
5. **Mandar ao cliente** — Financeiro · tela Ordens de serviço
6. **Pacote do mês** — Contador · tela Painel do contador

## Fábrica, estoque e compras

### Como compro as peças que estão faltando?

Da falta no estoque ao pagamento aprovado e conciliado. Passo a passo:

1. **Falta no estoque** (necessidades de compra) — O ERP sozinho · tela Compras e cotações
2. **Cotação** (resposta pelo link) — Compras · tela Compras e cotações
3. **Pedido de compra** — Compras · tela Compras e cotações
4. **NF do fornecedor chega** (busca automática) — Fiscal · tela Notas fiscais
5. **Entrada no estoque** — Estoque · tela Produtos e estoque
6. **Conta a pagar** — Financeiro · tela Contas a pagar e receber
7. **Aprovação** — Diretoria · tela Aprovações
8. **Pagamento** — Financeiro · tela Contas a pagar e receber
9. **Conciliado no banco** — Financeiro · tela Bancos e conciliação

- **Necessidade de Compra:** estoque físico, o que vai entrar, o prometido, o estoque virtual, as saídas, a cobertura em dias e quanto comprar.
- **Cotação por e-mail e WhatsApp:** cada fornecedor recebe o seu link e responde preço, prazo, frete e condições online, sem login, ou avisa que não cota.
- **Mapa comparativo:** preços lado a lado por item, com o vencedor marcado; os vencedores viram ordens de compra com um clique.

_Tela [Compras e cotações](modulos.md#compras-e-cotações): menu Fábrica e estoque → Compras e cotações. Quem pode abrir: Administrador, Vendas, Financeiro, Técnico e Compras._

### Como abro uma ordem de produção (OP)?

Da necessidade (venda ou estoque) à máquina testada e pronta no estoque. Passo a passo:

1. **Precisa de máquina** (venda ou estoque mínimo) — O ERP sozinho · tela Produção
2. **Abrir a OP** — Compras · tela Produção
3. **Separar as peças** (pela ficha técnica) — Estoque · tela Produção
4. **Comprar o que falta** (cotação e OC) — Compras · tela Compras e cotações
5. **Montagem por etapas** — Técnico · tela Produção
6. **Teste do giga** — Técnico · tela Teste do giga (REG-006)
7. **Pronta no estoque** (com nº de série) — Estoque · tela Produtos e estoque

- **Nova OP:** máquina ou subconjunto, quantidade, previsão, responsável, números de série, venda ligada e observações (o texto padrão já vem).
- **Peças necessárias:** para cada peça, quanto precisa, quanto há no estoque, o reservado em outras OPs, o que está a caminho e quanto falta.
- **Pedir as peças que faltam:** cria uma ordem de compra em cotação por fornecedor preferido, já com as quantidades.

_Tela [Produção](modulos.md#produção): menu Assistência → Produção. Quem pode abrir: Administrador, Vendas, Financeiro e Técnico._

### Como registro o teste do giga de uma máquina?

- **Lançar teste na bancada:** máquina, número de série (sugere os das OPs), OP, operador, giga usada e unidade, pensado para celular e tablet.
- **Resultado em botões grandes:** Aprovado ou Reprovado em cada teste; as medidas são opcionais e o ERP sugere o resultado pelo limite.

_Tela [Teste do giga (REG-006)](modulos.md#teste-do-giga-reg-006): menu Assistência → Teste do giga (REG-006). Quem pode abrir: Administrador, Financeiro, Técnico e Só o giga._

### Como mando mercadoria de SC para SP?

Mercadoria que sai da matriz para a filial, com a nota certa nas duas pontas. Passo a passo:

1. **Pedir a transferência** (itens e quantidades) — Estoque · tela Transferências SC ↔ SP
2. **NF de transferência** (emitida em SC) — Fiscal · tela Transferências SC ↔ SP
3. **Mercadoria viaja** — Logística · tela Fretes e envios
4. **Entrada em SP** (confere e recebe) — Estoque · tela Transferências SC ↔ SP
5. **Estoque de SP** — O ERP sozinho · tela Produtos e estoque

### Como faço a contagem do estoque?

- **Aba Contagem:** inventário às cegas (o saldo fica escondido), mostra as divergências, pede justificativa e só então ajusta o estoque.
- **Movimentar estoque:** entrada ou ajuste por unidade, com motivo; saída que não é venda vai pela baixa com motivo fiscal (perda, quebra, uso interno…).

_Tela [Produtos e estoque](modulos.md#produtos-e-estoque): menu Fábrica e estoque → Produtos e estoque. Quem pode abrir: Administrador, Vendas, Financeiro, Técnico, Marketplaces e Compras._

## Financeiro

### Como lanço uma conta a pagar?

Do boleto ou da nota do fornecedor ao pagamento aprovado e conferido no extrato. Passo a passo:

1. **Boleto ou NF chega** (ou a busca automática) — Financeiro · tela Contas a pagar e receber
2. **Conta a pagar** (categoria e vencimento) — Financeiro · tela Contas a pagar e receber
3. **Aprovação** (sem ok, não paga) — Diretoria · tela Aprovações
4. **Pagar ou agendar** (em lote, se quiser) — Financeiro · tela Contas a pagar e receber
5. **Comprovante anexado** — Financeiro · tela Contas a pagar e receber
6. **Conciliado no banco** — Financeiro · tela Bancos e conciliação

- **Conta nova a pagar:** fornecedor por busca, chave Pix do cadastro, forma de pagamento, mês do DRE e repetição: única, parcelada, semanal, mensal até anual.
- **Boleto lido:** colar a linha digitável preenche valor e vencimento, confere se o boleto já foi pago e calcula multa e juros do atraso.
- **Trava contra golpe:** fornecedor marcado como golpe aparece com aviso e a conta dele não pode ser paga.

_Tela [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber): menu Financeiro → Contas a pagar e receber. Quem pode abrir: Administrador, Vendas, Financeiro e Contador._

### Por que a conta ainda não pode ser paga?

- **Trava no pagamento:** conta a pagar só é paga depois de aprovada; o mês só fecha com tudo aprovado e validado, ou com a justificativa escrita.
- **1ª e 2ª revisão:** quem lançou não faz a 1ª; o administrador pode fazer qualquer uma, mas nunca as duas na mesma conta.

_Tela [Aprovações](modulos.md#aprovações): menu Financeiro → Aprovações. Quem pode abrir: Administrador, Vendas, Financeiro e Contador._

### Como cobro um cliente atrasado?

Da conta a receber ao dinheiro no banco, com lembretes automáticos. Passo a passo:

1. **Conta a receber** (nasce da venda) — O ERP sozinho · tela Contas a pagar e receber
2. **Lembrete antes** (régua pelo WhatsApp) — O ERP sozinho · tela Configurações
3. **Página do cliente** (Pix e 2ª via no link) — Cliente
4. **Cliente paga** — Cliente
5. **Baixa automática** (InfinitePay ou Inter) — O ERP sozinho · tela Contas a pagar e receber
6. **Atrasou? Cobrar** (mensagem pronta) — Financeiro · tela Contas a pagar e receber
7. **Conciliado no banco** — Financeiro · tela Bancos e conciliação

- **Cobrar no WhatsApp:** mensagem pronta com valor, vencimento, Pix copia e cola e o link da página do cliente com a segunda via.
- **Régua de cobrança automática:** os e-mails saem sozinhos às 8h e o WhatsApp oficial manda sem clique; o que sai e quando se ajusta em Configurações.

_Tela [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber): menu Financeiro → Contas a pagar e receber. Quem pode abrir: Administrador, Vendas, Financeiro e Contador._

### Como importo o extrato do banco e concilio?

Cada linha do banco ligada à sua conta, para o saldo do ERP bater com o do banco. Passo a passo:

1. **Extrato entra** (banco, OFX ou e-mail) — O ERP sozinho · tela Bancos e conciliação
2. **ERP sugere** (conta, venda ou regra) — O ERP sozinho · tela Bancos e conciliação
3. **Aprovar em lote** — Financeiro · tela Bancos e conciliação
4. **Resolver os que sobram** (divergentes) — Financeiro · tela Bancos e conciliação
5. **Saldo bate** — Financeiro · tela Bancos e conciliação
6. **Pronto para o contador** — Contador · tela Painel do contador

- **Importar extrato:** arquivo OFX ou planilha CSV (ex.: InfinitePay) com as colunas conferidas; acha a conta pelo número e não repete o que já entrou.
- **Conciliação sozinha:** ao chegar o extrato, o ERP já liga as linhas que batem com contas lançadas e dá a baixa com a data do banco.
- **Sugestões:** par pronto pelo mesmo valor, data próxima e nome parecido; o botão Aprovar sugestões concilia todas de uma vez.

_Tela [Bancos e conciliação](modulos.md#bancos-e-conciliação): menu Financeiro → Bancos e conciliação. Quem pode abrir: Administrador, Financeiro e Contador._

### Entrou um dinheiro no banco e não sei de quem é. E agora?

Cada dinheiro que entra nos bancos da MF ligado à venda, ao cliente ou à conta certa. Passo a passo:

1. **Extrato entra** (banco, Open Finance ou OFX) — O ERP sozinho · tela Bancos e conciliação
2. **ERP reconhece** (Pix, cartão, boleto ou regra) — O ERP sozinho · tela Bancos e conciliação
3. **Ligar à venda** (conta a receber baixada) — Financeiro · tela Bancos e conciliação
4. **Entre contas e sócios** (não conta como venda) — O ERP sozinho · tela Entre contas e sócios
5. **Entrada grande sem dono** (a dona anota de quem é) — Diretoria
6. **Pronto para o contador** — Contador · tela Painel do contador

### Gastei no cartão da empresa. O que faço?

Cada compra no cartão corporativo com a nota certa ou o motivo de não ter. Passo a passo:

1. **Compra no cartão** — Todos
2. **Pedir a nota** (botão Pedi a nota) — Financeiro · tela Início
3. **NF chega e liga** (pelo valor da compra) — O ERP sozinho · tela Notas fiscais
4. **Sem nota? Motivo** (Sem nota ou Pessoal) — Financeiro · tela Início
5. **Gasto separado** (combustível, marketplaces) — O ERP sozinho · tela Gastos separados
6. **Conciliado no banco** — Financeiro · tela Bancos e conciliação

## Notas e contador

### Chegou a nota do fornecedor. O que faço?

A nota de compra chega sozinha, entra no estoque com o custo certo e vira conta a pagar. Passo a passo:

1. **SEFAZ avisa** (busca automática) — O ERP sozinho · tela Notas fiscais
2. **Conferir os itens** (com o pedido de compra) — Compras · tela Notas fiscais
3. **Entrada no estoque** (custo atualizado) — Estoque · tela Produtos e estoque
4. **Conta a pagar** (parcelas da nota) — Financeiro · tela Contas a pagar e receber
5. **Crédito de impostos** (ICMS, IPI, PIS/COFINS) — Contador · tela Analista fiscal

- **Buscar notas na SEFAZ:** traz as notas contra a empresa; o ERP dá ciência, lê o XML e, se ligado, lança contas a pagar e a entrada no estoque.

_Tela [Notas fiscais](modulos.md#notas-fiscais): menu Fiscal → Notas fiscais. Quem pode abrir: Administrador, Vendas, Financeiro, Contador e Compras._

### Como faço a devolução de uma venda?

O cliente devolve: nota de devolução, reembolso aprovado e a venda descontada. Passo a passo:

1. **Cliente devolve** (peça ou máquina) — Cliente
2. **NF de devolução** (a partir da nota de venda) — Fiscal · tela Notas fiscais
3. **Conferir o que voltou** — Estoque · tela Produtos e estoque
4. **Reembolso a pagar** (vira conta a pagar) — Financeiro · tela Notas fiscais
5. **Aprovação** — Diretoria · tela Aprovações
6. **Venda descontada** (relatórios, metas e DRE) — O ERP sozinho · tela Relatórios

### Como o mês é fechado com o contador?

O que precisa estar certo para o contador fechar o mês sem pedir nada de volta. Passo a passo:

1. **Bancos conciliados** — Financeiro · tela Bancos e conciliação
2. **Notas conferidas** (emitidas e recebidas) — Fiscal · tela Notas fiscais
3. **Pendências zeradas** — Financeiro · tela Auditoria financeira
4. **Pacote do mês** (XML e planilhas) — O ERP sozinho · tela Painel do contador
5. **Contador confere** — Contador · tela Painel do contador
6. **Mês travado** (ninguém muda depois) — Contador · tela Painel do contador

- **Baixar pacote:** XML das notas emitidas, canceladas e recebidas, cartas, inutilizações e planilhas por CFOP, de notas e de contas.
- **Fechar o mês:** contador ou administrador trava pagamentos e recebimentos do mês; com pendência, só fecha com justificativa escrita.

_Tela [Painel do contador](modulos.md#painel-do-contador): menu Fiscal → Painel do contador. Quem pode abrir: Administrador, Financeiro e Contador._

### Como acompanho um parcelamento de imposto?

Nenhuma parcela esquecida e nenhum parcelamento cancelado por atraso. Passo a passo:

1. **Pedir a lista** (mensagem pronta) — Contador · tela Parcelamentos de impostos
2. **Cadastrar** (parcelas geradas na hora) — Financeiro · tela Parcelamentos de impostos
3. **Aviso antes de vencer** (7 e 2 dias antes) — O ERP sozinho · tela Parcelamentos de impostos
4. **Pagar a guia** (com o comprovante) — Financeiro · tela Parcelamentos de impostos
5. **Risco de cancelar** (pelas parcelas atrasadas) — O ERP sozinho · tela Parcelamentos de impostos
6. **Impostos pagos** (todas as contas juntas) — O ERP sozinho · tela Impostos pagos

## O ERP

### Como dou acesso ao ERP para alguém novo?

Como uma pessoa nova da equipe ganha acesso só ao que precisa. Passo a passo:

1. **Criar o usuário** (nome e e-mail) — Diretoria · tela Usuários e permissões
2. **Escolher o perfil** (vendas, financeiro…) — Diretoria · tela Usuários e permissões
3. **1º acesso** (troca a senha) — Todos
4. **Duas etapas** (admin e financeiro) — Todos
5. **Vê só o que é seu** (menu do perfil) — O ERP sozinho

O passo a passo completo está no documento [Como dar acesso a alguém novo](acesso-novo.md).

### Esqueci a senha. Como entro?

- **Nova senha:** o administrador define outra senha provisória quando alguém esquece a sua.
- **Senha provisória:** gerada pelo ERP e trocada pela pessoa no primeiro acesso; os dados saem prontos para copiar ou mandar pelo WhatsApp.

Peça a nova senha a quem cuida dos usuários do ERP.

_Tela [Usuários e permissões](modulos.md#usuários-e-permissões): Engrenagem no fim do menu → Configurações; também pela busca do menu. Quem pode abrir: Só a conta master._

### Tenho uma ideia para melhorar o ERP. Onde anoto?

Da ideia de alguém da equipe até a versão nova no ar. Passo a passo:

1. **Ideia anotada** (qualquer pessoa) — Todos · tela Sobre o ERP Line → Ideias
2. **Avaliada e votada** — Diretoria · tela Sobre o ERP Line → Ideias
3. **Vira pendência** (no Handoff, com quem faz) — Diretoria · tela Sobre o ERP Line → Handoff
4. **Feita e testada** (testes automáticos) — Claude
5. **Ok para publicar** (só com o ok da empresa) — Diretoria
6. **No ar** (aparece em Atualizações) — Todos · tela Sobre o ERP Line → Atualizações

- **Anotar ideia:** botão no alto para registrar uma sugestão a qualquer momento.

### Quero saber o que uma tela faz. Onde vejo?

No documento [Módulos do ERP Line](modulos.md), ou no ERP em Sobre o ERP Line → Módulos, com a busca e o "Saiba mais" de cada tela.

## Onde fica a tela?

Telas que não estão na lista do menu e por onde se chega nelas. Todas também aparecem na busca do menu.

- **[PDV (venda de balcão)](modulos.md#pdv-venda-de-balcão):** Cartão rosa "PDV" no alto do menu (abre em outra aba)
- **[Painel das máquinas](modulos.md#painel-das-máquinas):** Botão "Painel das máquinas" na tela Máquinas
- **[Painel dos produtos](modulos.md#painel-dos-produtos):** Botão "Painel dos produtos" em Produtos e estoque
- **[Peças de reposição](modulos.md#peças-de-reposição):** Cartão "Peças de reposição" em Produtos e estoque
- **[Componentes de produção](modulos.md#componentes-de-produção):** Cartão "Componentes de produção" em Produtos e estoque
- **[Formas de pagamento](modulos.md#formas-de-pagamento):** Engrenagem no fim do menu → Configurações
- **[Usuários e permissões](modulos.md#usuários-e-permissões):** Engrenagem no fim do menu → Configurações
- **[Importar dados](modulos.md#importar-dados):** Engrenagem no fim do menu → Configurações
- **[Configurações](modulos.md#configurações-1):** Engrenagem no fim do menu
- **[Categorias e marcadores](modulos.md#categorias-e-marcadores):** Engrenagem no fim do menu → Configurações
