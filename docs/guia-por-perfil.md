# Guia rápido por perfil

> Documento gerado a partir do código do ERP com o comando `npx tsx scripts/gerar-docs.mjs`. Não edite à mão: mude o texto
> na fonte (src/lib/permissoes.ts, src/lib/menu.ts, src/lib/modulosDetalhe.ts e src/lib/esquemas.ts) e gere de novo.

**Atualizado em:** 27/10/2026 · **9 perfis**.

Um guia curto para cada função da empresa: as telas que a pessoa abre, o que ela pode criar ou alterar, os atalhos do celular e os processos em que ela entra. Para saber tudo o que uma tela faz, toque no nome dela: abre o documento [Módulos do ERP Line](modulos.md).

## Índice

- [Administrador](#administrador)
- [Vendas](#vendas)
- [Financeiro](#financeiro)
- [Técnico](#técnico)
- [Contador](#contador)
- [Expedição](#expedição)
- [Marketplaces](#marketplaces)
- [Compras](#compras)
- [Só o giga](#só-o-giga)
- [Representante (portal)](#representante-portal)

**Mais de um perfil:** a pessoa pode ter um perfil principal e somar os adicionais (Vendas, Financeiro, Técnico, Expedição, Marketplaces, Compras). Aí ela vê as telas e faz as ações de todos eles juntos. O administrador ainda pode esconder telas de um perfil em Usuários → Perfis, então o menu de alguém pode ter menos telas do que a lista abaixo.

## Administrador

_Acesso total, usuários e configurações._

- **Atalhos na barra do celular:** Início · Venda de Peças · Ordens de serviço · Contas a pagar e receber
- **Telas:** todas, menos as que são só da conta master (Configurações da empresa e Usuários).
- **O que pode criar ou alterar:** tudo.

### Processos em que entra

Nos esquemas, este perfil é **Diretoria**. Os passos dele em cada processo (só os que acontecem numa tela que ele abre):

- **Compra de peças e insumos:** 7. Aprovação · Aprovações
- **Conta a pagar:** 3. Aprovação · Aprovações
- **Novo usuário no ERP:** 1. Criar o usuário · Usuários e permissões; 2. Escolher o perfil · Usuários e permissões
- **Uma mudança no ERP:** 2. Avaliada e votada · Sobre o ERP Line → Ideias; 3. Vira pendência · Sobre o ERP Line → Handoff; 5. Ok para publicar
- **Comissão do vendedor:** 5. Aprovação · Aprovações
- **Frete do CT-e à conta paga:** 6. Aprovação · Aprovações
- **De onde veio a entrada:** 5. Entrada grande sem dono
- **Devolução de venda:** 5. Aprovação · Aprovações
- **Dados do Tiny para o ERP:** 1. Exportar do Tiny; 2. Importar · Importar dados; 6. Plano de troca · Troca do Tiny
- **Sprint da equipe:** 2. Planejar a sprint · Scrum das equipes

## Vendas

_Pedidos, PDV, clientes, cobranças e NF-e das vendas._

- **Atalhos na barra do celular:** Início · Venda de Peças · Clientes · Garantias e preventivas
- **O que pode criar ou alterar:**
  - Criar e editar pedidos, orçamentos e vendas no PDV
  - Cadastrar e editar clientes
  - Emitir NF-e
  - Emitir NFS-e
  - Cadastrar equipamentos dos clientes
  - Cadastrar transportadoras
  - Cotar e aprovar frete
  - Separar, conferir, embalar e despachar pedidos

### Telas que abre (47)

**Início**

- [Início](modulos.md#início-1): O dia da empresa num olhar, com o que pede atenção primeiro.
- [Caixa de e-mail](modulos.md#caixa-de-e-mail): O e-mail da empresa dentro do ERP, já ligado a clientes e notas.

**Vendas**

- [Painel de vendas](modulos.md#painel-de-vendas): Quanto vendeu, de onde veio e o que está parado no caminho.
- [Venda de Peças](modulos.md#venda-de-peças): Do orçamento à entrega, sem perder nenhuma venda.
- [Venda de Máquinas](modulos.md#venda-de-máquinas): Cada máquina vendida acompanhada da proposta até a nota.
- [Loja online e marketplace](modulos.md#loja-online-e-marketplace): Cadastros prontos para anunciar e o Mercado Livre em dia.
- [Gestão de preços](modulos.md#gestão-de-preços): Os preços num lugar só: o que revisar, as regras e as tabelas.
- [PDV (venda de balcão)](modulos.md#pdv-venda-de-balcão): Venda de balcão rápida, com leitor de código e comprovante na hora.

**Cadastros**

- [Painel dos clientes](modulos.md#painel-dos-clientes): Quem são os clientes, quem sumiu e o que falta nos cadastros.
- [Clientes](modulos.md#clientes): Cada cliente completo, conferido e com todo o histórico à mão.
- [Tudo do cliente](modulos.md#tudo-do-cliente): Tudo de um cliente numa página só, a partir do CNPJ, CPF ou nome.
- [Técnicos](modulos.md#técnicos): Saber na hora quem atende o cliente em cada cidade.
- [Fornecedores](modulos.md#fornecedores): Fornecedores conferidos e protegidos contra pagamento a golpista.
- [Serviços](modulos.md#serviços): Preço de cada serviço padronizado para a OS e para a venda.

**Logística**

- [Fluxo de pedidos](modulos.md#fluxo-de-pedidos): Veja cada venda do orçamento à entrega, com o próximo passo.
- [Separação e embalagem](modulos.md#separação-e-embalagem): Separe, confira e despache sem erro, direto no tablet do galpão.
- [Fretes e envios](modulos.md#fretes-e-envios): Pague o frete certo e saiba onde está cada carga.
- [Rastreio das entregas](modulos.md#rastreio-das-entregas): O cliente sabe onde está o pedido sem precisar perguntar.
- [Transportadoras](modulos.md#transportadoras): Transportadoras e contatos num lugar só, prontos para cotar.
- [Embalagens](modulos.md#embalagens): Cadastre as caixas uma vez e cote o frete sem medir de novo.

**Assistência**

- [Painel da assistência](modulos.md#painel-da-assistência): Saiba na hora o que está parado na oficina e por quê.
- [Ordens de serviço](modulos.md#ordens-de-serviço): Da recepção à entrega, cada conserto registrado e cobrado.
- [Garantias e preventivas](modulos.md#garantias-e-preventivas): Nenhuma garantia ou preventiva esquecida: o cliente é lembrado.
- [Máquinas](modulos.md#máquinas): Cada modelo de máquina completo: peças, custo, manuais e clientes.

**Fábrica e estoque**

- [Painel da fábrica](modulos.md#painel-da-fábrica): Veja a fábrica de relance: o que monta, o que falta e o que comprar.
- [Produtos e estoque](modulos.md#produtos-e-estoque): Cadastro limpo, estoque certo em SC e SP e preço com margem.
- [Produção](modulos.md#produção): Monte as máquinas no prazo, sem parar por falta de peça.
- [Compras e cotações](modulos.md#compras-e-cotações): Compre certo, no preço certo, para SC ou SP.
- [Acompanhamento de compras](modulos.md#acompanhamento-de-compras): Cada peça pedida: ordem de compra, nota, transporte e chegada.
- [Transferências SC ↔ SP](modulos.md#transferências-sc--sp): Mande máquinas e peças entre SC e SP com nota e estoque certos.
- [Painel das máquinas](modulos.md#painel-das-máquinas): Saiba quais máquinas produzir antes de faltar para vender.
- [Painel dos produtos](modulos.md#painel-dos-produtos): Descubra o que vende, o que dá lucro e o que vai faltar.
- [Peças à venda](modulos.md#peças-à-venda): As peças que o cliente compra, prontas para vender em todo canal.
- [Tornearia (usinadas)](modulos.md#tornearia-usinadas): As peças usinadas na tornearia, numa lista só.
- [Insumos](modulos.md#insumos): O que vai dentro das máquinas, separado do que se vende.

**Financeiro**

- [Painel do financeiro](modulos.md#painel-do-financeiro): Quanto tem, quanto entrou e saiu e quem deve, numa tela só.
- [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber): Todas as contas da empresa em ordem, do lançamento ao pagamento.
- [Aprovações](modulos.md#aprovações): Nenhuma conta é paga sem passar por quem confere.
- [Gastos separados](modulos.md#gastos-separados): Cada tipo de gasto separado, somando todas as contas da empresa.
- [Formas de pagamento](modulos.md#formas-de-pagamento): Condições e taxas de pagamento num lugar só, iguais em todo o ERP.

**Fiscal**

- [Painel fiscal](modulos.md#painel-fiscal): As notas e os impostos do período num só olhar.
- [Notas fiscais](modulos.md#notas-fiscais): Toda nota emitida e recebida num lugar só.
- [Impostos pagos](modulos.md#impostos-pagos): Todo imposto pago, de todas as contas, num lugar só.

**Gestão**

- [Comissões](modulos.md#comissões): Comissão certa, calculada sozinha e paga sem planilha.
- [Metas de vendas](modulos.md#metas-de-vendas): Saber cedo se a meta do mês vai ser batida e quanto falta.

**Configurações**

- [Documentos](modulos.md#documentos): Todo arquivo da empresa achado em segundos, num lugar só.
- [Scrum das equipes](modulos.md#scrum-das-equipes): Cada equipe entrega um pouco toda semana, sem perder o foco.

### Processos em que entra

Nos esquemas, este perfil é **Vendas**. Os passos dele em cada processo (só os que acontecem numa tela que ele abre):

- **Venda do começo ao fim:** 1. Orçamento · Venda de Peças; 3. Venda aprovada · Venda de Peças
- **Proposta pelo link:** 1. Orçamento pronto · Venda de Peças; 2. Enviar a proposta · Venda de Peças
- **Venda de máquina:** 1. Proposta da máquina · Venda de Máquinas
- **Venda com NF de outra empresa:** 1. Venda aprovada · Venda de Peças; 3. NF de outra empresa · Venda de Peças
- **Venda de balcão (PDV):** 1. Abrir o PDV · PDV (venda de balcão); 2. Buscar a peça · PDV (venda de balcão); 3. Cliente e desconto · PDV (venda de balcão); 4. Receber · PDV (venda de balcão)
- **Como a nota pega o imposto:** 1. Item na venda · Venda de Peças
- **Garantia e preventiva:** 1. Máquina vendida · Clientes
- **Cliente novo no cadastro:** 1. Quem é o cliente · Clientes; 4. Contato e endereço · Clientes; 6. Abrir a venda · Venda de Peças
- **Comissão do vendedor:** 1. Venda com vendedor · Venda de Peças; 7. Vendedor confere · Comissões
- **Frete do CT-e à conta paga:** 1. Cotar o frete · Fretes e envios

## Financeiro

_Contas a pagar/receber, notas fiscais, estoque, compras e fornecedores._

- **Atalhos na barra do celular:** Início · Contas a pagar e receber · Bancos e conciliação · Notas fiscais
- **O que pode criar ou alterar:**
  - Cadastrar e editar produtos e preços
  - Movimentar estoque e contagem
  - Cadastrar e editar fornecedores
  - Cadastrar e editar clientes
  - Contas a receber, baixas e cobranças
  - Contas a pagar e pagamentos
  - Emitir NF-e
  - NF-e de fornecedores (entrada)
  - Produção, compras de peças e cotações
  - Receber compras no estoque
  - Cadastrar transportadoras
  - Emitir NFS-e
  - Cancelar NFS-e
  - Configurar a NFS-e
  - Separar, conferir, embalar e despachar pedidos

### Telas que abre (65)

**Início**

- [Início](modulos.md#início-1): O dia da empresa num olhar, com o que pede atenção primeiro.
- [Caixa de e-mail](modulos.md#caixa-de-e-mail): O e-mail da empresa dentro do ERP, já ligado a clientes e notas.

**Vendas**

- [Painel de vendas](modulos.md#painel-de-vendas): Quanto vendeu, de onde veio e o que está parado no caminho.
- [Venda de Peças](modulos.md#venda-de-peças): Do orçamento à entrega, sem perder nenhuma venda.
- [Venda de Máquinas](modulos.md#venda-de-máquinas): Cada máquina vendida acompanhada da proposta até a nota.
- [Loja online e marketplace](modulos.md#loja-online-e-marketplace): Cadastros prontos para anunciar e o Mercado Livre em dia.
- [Gestão de preços](modulos.md#gestão-de-preços): Os preços num lugar só: o que revisar, as regras e as tabelas.
- [PDV (venda de balcão)](modulos.md#pdv-venda-de-balcão): Venda de balcão rápida, com leitor de código e comprovante na hora.

**Cadastros**

- [Painel dos clientes](modulos.md#painel-dos-clientes): Quem são os clientes, quem sumiu e o que falta nos cadastros.
- [Clientes](modulos.md#clientes): Cada cliente completo, conferido e com todo o histórico à mão.
- [Tudo do cliente](modulos.md#tudo-do-cliente): Tudo de um cliente numa página só, a partir do CNPJ, CPF ou nome.
- [Técnicos](modulos.md#técnicos): Saber na hora quem atende o cliente em cada cidade.
- [Fornecedores](modulos.md#fornecedores): Fornecedores conferidos e protegidos contra pagamento a golpista.
- [Serviços](modulos.md#serviços): Preço de cada serviço padronizado para a OS e para a venda.

**Logística**

- [Fluxo de pedidos](modulos.md#fluxo-de-pedidos): Veja cada venda do orçamento à entrega, com o próximo passo.
- [Separação e embalagem](modulos.md#separação-e-embalagem): Separe, confira e despache sem erro, direto no tablet do galpão.
- [Fretes e envios](modulos.md#fretes-e-envios): Pague o frete certo e saiba onde está cada carga.
- [Rastreio das entregas](modulos.md#rastreio-das-entregas): O cliente sabe onde está o pedido sem precisar perguntar.
- [Transportadoras](modulos.md#transportadoras): Transportadoras e contatos num lugar só, prontos para cotar.
- [Embalagens](modulos.md#embalagens): Cadastre as caixas uma vez e cote o frete sem medir de novo.

**Assistência**

- [Painel da assistência](modulos.md#painel-da-assistência): Saiba na hora o que está parado na oficina e por quê.
- [Ordens de serviço](modulos.md#ordens-de-serviço): Da recepção à entrega, cada conserto registrado e cobrado.
- [Garantias e preventivas](modulos.md#garantias-e-preventivas): Nenhuma garantia ou preventiva esquecida: o cliente é lembrado.
- [Máquinas](modulos.md#máquinas): Cada modelo de máquina completo: peças, custo, manuais e clientes.
- [Teste do giga (REG-006)](modulos.md#teste-do-giga-reg-006): Toda máquina testada e registrada antes de sair da fábrica.

**Fábrica e estoque**

- [Painel da fábrica](modulos.md#painel-da-fábrica): Veja a fábrica de relance: o que monta, o que falta e o que comprar.
- [Produtos e estoque](modulos.md#produtos-e-estoque): Cadastro limpo, estoque certo em SC e SP e preço com margem.
- [Produção](modulos.md#produção): Monte as máquinas no prazo, sem parar por falta de peça.
- [Compras e cotações](modulos.md#compras-e-cotações): Compre certo, no preço certo, para SC ou SP.
- [Acompanhamento de compras](modulos.md#acompanhamento-de-compras): Cada peça pedida: ordem de compra, nota, transporte e chegada.
- [Transferências SC ↔ SP](modulos.md#transferências-sc--sp): Mande máquinas e peças entre SC e SP com nota e estoque certos.
- [Painel das máquinas](modulos.md#painel-das-máquinas): Saiba quais máquinas produzir antes de faltar para vender.
- [Painel dos produtos](modulos.md#painel-dos-produtos): Descubra o que vende, o que dá lucro e o que vai faltar.
- [Peças à venda](modulos.md#peças-à-venda): As peças que o cliente compra, prontas para vender em todo canal.
- [Tornearia (usinadas)](modulos.md#tornearia-usinadas): As peças usinadas na tornearia, numa lista só.
- [Insumos](modulos.md#insumos): O que vai dentro das máquinas, separado do que se vende.

**Financeiro**

- [Painel do financeiro](modulos.md#painel-do-financeiro): Quanto tem, quanto entrou e saiu e quem deve, numa tela só.
- [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber): Todas as contas da empresa em ordem, do lançamento ao pagamento.
- [Aprovações](modulos.md#aprovações): Nenhuma conta é paga sem passar por quem confere.
- [Bancos e conciliação](modulos.md#bancos-e-conciliação): O extrato do banco conferido com as contas, sem planilha.
- [Gastos separados](modulos.md#gastos-separados): Cada tipo de gasto separado, somando todas as contas da empresa.
- [Entre contas e sócios](modulos.md#entre-contas-e-sócios): O dinheiro entre contas e sócios separado das despesas da empresa.
- [Auditoria financeira](modulos.md#auditoria-financeira): Erros e riscos do financeiro achados antes de virarem prejuízo.
- [Formas de pagamento](modulos.md#formas-de-pagamento): Condições e taxas de pagamento num lugar só, iguais em todo o ERP.

**Fiscal**

- [Painel fiscal](modulos.md#painel-fiscal): As notas e os impostos do período num só olhar.
- [Notas fiscais](modulos.md#notas-fiscais): Toda nota emitida e recebida num lugar só.
- [Painel do contador](modulos.md#painel-do-contador): O fechamento do mês pronto para o contador, sem papelada.
- [Analista fiscal](modulos.md#analista-fiscal): Ache erros e formas legais de pagar menos imposto.
- [Impostos pagos](modulos.md#impostos-pagos): Todo imposto pago, de todas as contas, num lugar só.
- [Parcelamentos de impostos](modulos.md#parcelamentos-de-impostos): Nenhuma parcela de imposto esquecida, nenhum parcelamento perdido.
- [Relatórios](modulos.md#relatórios): Os números do período prontos para ver e exportar.
- [Margem de contribuição](modulos.md#margem-de-contribuição): Saiba quanto sobra de verdade em cada venda.

**Gestão**

- [Painel gerencial](modulos.md#painel-gerencial): Veja onde a empresa cresce, onde trava e o que fazer.
- [Comissões](modulos.md#comissões): Comissão certa, calculada sozinha e paga sem planilha.
- [Metas de vendas](modulos.md#metas-de-vendas): Saber cedo se a meta do mês vai ser batida e quanto falta.

**Funcionários**

- [Equipe](modulos.md#equipe): A equipe organizada, com contratos, salários e documentos.
- [Pasta de documentos](modulos.md#pasta-de-documentos): A pasta de cada funcionário, com tudo guardado e separado.
- [Admissão e saída](modulos.md#admissão-e-saída): O que falta na admissão e na saída de cada funcionário.
- [Férias e ponto](modulos.md#férias-e-ponto): As férias de cada um em dia e a folha de ponto guardada.
- [Recibos da equipe](modulos.md#recibos-da-equipe): Os recibos dos funcionários, separados do Financeiro.
- [Pagamentos da equipe](modulos.md#pagamentos-da-equipe): O que foi pago a cada funcionário, em todas as contas.

**Configurações**

- [Documentos](modulos.md#documentos): Todo arquivo da empresa achado em segundos, num lugar só.
- [Importar dados](modulos.md#importar-dados): Traga dados do Tiny, planilhas e extratos sem digitar.
- [Troca do Tiny](modulos.md#troca-do-tiny): Troque o Tiny pelo ERP com plano, prazos e progresso medido.
- [Scrum das equipes](modulos.md#scrum-das-equipes): Cada equipe entrega um pouco toda semana, sem perder o foco.

### Processos em que entra

Nos esquemas, este perfil é **Financeiro** e **Fiscal**. Os passos dele em cada processo (só os que acontecem numa tela que ele abre):

- **Venda do começo ao fim:** 4. NF-e emitida · Notas fiscais; 8. Pagamento recebido · Contas a pagar e receber; 9. Conciliado no banco · Bancos e conciliação
- **Compra de peças e insumos:** 4. NF do fornecedor chega · Notas fiscais; 6. Conta a pagar · Contas a pagar e receber; 8. Pagamento · Contas a pagar e receber; 9. Conciliado no banco · Bancos e conciliação
- **Máquina na assistência:** 6. NFS-e e cobrança · Ordens de serviço
- **Venda de máquina:** 6. NF-e emitida · Notas fiscais
- **Venda com NF de outra empresa:** 2. Outra empresa emite
- **Venda no Mercado Livre:** 3. NF-e emitida · Notas fiscais; 7. Dinheiro liberado · Contas a pagar e receber; 8. Conciliado no banco · Bancos e conciliação
- **Venda de balcão (PDV):** 6. Nota e comprovante · Notas fiscais
- **Cobrança sem esquecer ninguém:** 6. Atrasou? Cobrar · Contas a pagar e receber; 7. Conciliado no banco · Bancos e conciliação
- **Conta a pagar:** 1. Boleto ou NF chega · Contas a pagar e receber; 2. Conta a pagar · Contas a pagar e receber; 4. Pagar ou agendar · Contas a pagar e receber; 5. Comprovante anexado · Contas a pagar e receber; 6. Conciliado no banco · Bancos e conciliação
- **Extrato conciliado:** 3. Aprovar em lote · Bancos e conciliação; 4. Resolver os que sobram · Bancos e conciliação; 5. Saldo bate · Bancos e conciliação
- **Fechamento do mês:** 1. Bancos conciliados · Bancos e conciliação; 2. Notas conferidas · Notas fiscais; 3. Pendências zeradas · Auditoria financeira
- **Como a nota pega o imposto:** 5. SEFAZ autoriza · Notas fiscais
- **Nota do fornecedor:** 4. Conta a pagar · Contas a pagar e receber
- **Transferência SC → SP:** 2. NF de transferência · Transferências SC ↔ SP
- **Comissão do vendedor:** 4. Gerar a conta · Comissões; 6. Comissão paga · Contas a pagar e receber
- **Frete do CT-e à conta paga:** 4. Montar a fatura · Fretes e envios; 5. Conta a pagar · Contas a pagar e receber; 7. Conciliado no banco · Bancos e conciliação
- **De onde veio a entrada:** 3. Ligar à venda · Bancos e conciliação
- **Gasto no cartão da empresa:** 2. Pedir a nota · Início; 4. Sem nota? Motivo · Início; 6. Conciliado no banco · Bancos e conciliação
- **Devolução de venda:** 2. NF de devolução · Notas fiscais; 4. Reembolso a pagar · Notas fiscais
- **Nota de serviço (NFS-e):** 3. Emitir a NFS-e · Ordens de serviço; 5. Mandar ao cliente · Ordens de serviço
- **Parcelamento de imposto:** 2. Cadastrar · Parcelamentos de impostos; 4. Pagar a guia · Parcelamentos de impostos
- **Máquina que vem para conserto:** 3. Sem IE: entrada · Ordens de serviço; 5. Cobrar o conserto · Ordens de serviço; 6. Nota de volta · Ordens de serviço

## Técnico

_Assistência técnica, garantias, produção e compras de peças._

- **Atalhos na barra do celular:** Início · Ordens de serviço · Garantias e preventivas · Produção
- **O que pode criar ou alterar:**
  - Abrir e editar ordens de serviço
  - Cadastrar e editar clientes
  - Cadastrar equipamentos dos clientes
  - Produção, compras de peças e cotações
  - Lançar e anular testes do giga (REG-006)

### Telas que abre (25)

**Início**

- [Início](modulos.md#início-1): O dia da empresa num olhar, com o que pede atenção primeiro.

**Vendas**

- [Gestão de preços](modulos.md#gestão-de-preços): Os preços num lugar só: o que revisar, as regras e as tabelas.

**Cadastros**

- [Painel dos clientes](modulos.md#painel-dos-clientes): Quem são os clientes, quem sumiu e o que falta nos cadastros.
- [Clientes](modulos.md#clientes): Cada cliente completo, conferido e com todo o histórico à mão.
- [Tudo do cliente](modulos.md#tudo-do-cliente): Tudo de um cliente numa página só, a partir do CNPJ, CPF ou nome.
- [Técnicos](modulos.md#técnicos): Saber na hora quem atende o cliente em cada cidade.
- [Serviços](modulos.md#serviços): Preço de cada serviço padronizado para a OS e para a venda.

**Assistência**

- [Painel da assistência](modulos.md#painel-da-assistência): Saiba na hora o que está parado na oficina e por quê.
- [Ordens de serviço](modulos.md#ordens-de-serviço): Da recepção à entrega, cada conserto registrado e cobrado.
- [Garantias e preventivas](modulos.md#garantias-e-preventivas): Nenhuma garantia ou preventiva esquecida: o cliente é lembrado.
- [Máquinas](modulos.md#máquinas): Cada modelo de máquina completo: peças, custo, manuais e clientes.
- [Teste do giga (REG-006)](modulos.md#teste-do-giga-reg-006): Toda máquina testada e registrada antes de sair da fábrica.

**Fábrica e estoque**

- [Painel da fábrica](modulos.md#painel-da-fábrica): Veja a fábrica de relance: o que monta, o que falta e o que comprar.
- [Produtos e estoque](modulos.md#produtos-e-estoque): Cadastro limpo, estoque certo em SC e SP e preço com margem.
- [Produção](modulos.md#produção): Monte as máquinas no prazo, sem parar por falta de peça.
- [Compras e cotações](modulos.md#compras-e-cotações): Compre certo, no preço certo, para SC ou SP.
- [Acompanhamento de compras](modulos.md#acompanhamento-de-compras): Cada peça pedida: ordem de compra, nota, transporte e chegada.
- [Transferências SC ↔ SP](modulos.md#transferências-sc--sp): Mande máquinas e peças entre SC e SP com nota e estoque certos.
- [Painel das máquinas](modulos.md#painel-das-máquinas): Saiba quais máquinas produzir antes de faltar para vender.
- [Painel dos produtos](modulos.md#painel-dos-produtos): Descubra o que vende, o que dá lucro e o que vai faltar.
- [Peças à venda](modulos.md#peças-à-venda): As peças que o cliente compra, prontas para vender em todo canal.
- [Tornearia (usinadas)](modulos.md#tornearia-usinadas): As peças usinadas na tornearia, numa lista só.
- [Insumos](modulos.md#insumos): O que vai dentro das máquinas, separado do que se vende.

**Configurações**

- [Documentos](modulos.md#documentos): Todo arquivo da empresa achado em segundos, num lugar só.
- [Scrum das equipes](modulos.md#scrum-das-equipes): Cada equipe entrega um pouco toda semana, sem perder o foco.

### Processos em que entra

Nos esquemas, este perfil é **Técnico** e **Assistência**. Os passos dele em cada processo (só os que acontecem numa tela que ele abre):

- **Máquina na assistência:** 2. Abrir a OS · Ordens de serviço; 3. Diagnóstico · Ordens de serviço; 5. Conserto e peças · Ordens de serviço; 8. Próxima preventiva · Garantias e preventivas
- **Venda de máquina:** 4. Montagem · Produção; 5. Teste do giga · Teste do giga (REG-006); 9. Página da máquina
- **Produção de uma máquina:** 5. Montagem por etapas · Produção; 6. Teste do giga · Teste do giga (REG-006)
- **Garantia e preventiva:** 4. Agendar o técnico · Ordens de serviço; 5. OS da preventiva · Ordens de serviço
- **Nota de serviço (NFS-e):** 1. OS concluída · Ordens de serviço
- **Máquina que vem para conserto:** 1. Abrir a OS · Ordens de serviço; 4. Conserto · Ordens de serviço
- **OS pelo celular do técnico:** 1. Abrir o app; 2. Minhas OS por etapa; 3. Foto da câmera; 4. Checklist e laudo · Ordens de serviço; 6. Avisar o cliente

## Contador

_Só consulta: notas fiscais, financeiro e o fechamento mensal (XML e planilhas)._

- **Atalhos na barra do celular:** Painel do contador · Notas fiscais · Contas a pagar e receber · Documentos
- **O que pode criar ou alterar:** nada; só consulta.

### Telas que abre (15)

**Financeiro**

- [Painel do financeiro](modulos.md#painel-do-financeiro): Quanto tem, quanto entrou e saiu e quem deve, numa tela só.
- [Contas a pagar e receber](modulos.md#contas-a-pagar-e-receber): Todas as contas da empresa em ordem, do lançamento ao pagamento.
- [Aprovações](modulos.md#aprovações): Nenhuma conta é paga sem passar por quem confere.
- [Bancos e conciliação](modulos.md#bancos-e-conciliação): O extrato do banco conferido com as contas, sem planilha.
- [Gastos separados](modulos.md#gastos-separados): Cada tipo de gasto separado, somando todas as contas da empresa.
- [Entre contas e sócios](modulos.md#entre-contas-e-sócios): O dinheiro entre contas e sócios separado das despesas da empresa.
- [Auditoria financeira](modulos.md#auditoria-financeira): Erros e riscos do financeiro achados antes de virarem prejuízo.
- [Formas de pagamento](modulos.md#formas-de-pagamento): Condições e taxas de pagamento num lugar só, iguais em todo o ERP.

**Fiscal**

- [Painel fiscal](modulos.md#painel-fiscal): As notas e os impostos do período num só olhar.
- [Notas fiscais](modulos.md#notas-fiscais): Toda nota emitida e recebida num lugar só.
- [Painel do contador](modulos.md#painel-do-contador): O fechamento do mês pronto para o contador, sem papelada.
- [Analista fiscal](modulos.md#analista-fiscal): Ache erros e formas legais de pagar menos imposto.
- [Impostos pagos](modulos.md#impostos-pagos): Todo imposto pago, de todas as contas, num lugar só.
- [Parcelamentos de impostos](modulos.md#parcelamentos-de-impostos): Nenhuma parcela de imposto esquecida, nenhum parcelamento perdido.

**Configurações**

- [Documentos](modulos.md#documentos): Todo arquivo da empresa achado em segundos, num lugar só.

### Processos em que entra

Nos esquemas, este perfil é **Contador**. Os passos dele em cada processo (só os que acontecem numa tela que ele abre):

- **Venda do começo ao fim:** 10. Mês fechado · Painel do contador
- **Venda com NF de outra empresa:** 6. Conferir com o contador · Analista fiscal
- **Extrato conciliado:** 6. Pronto para o contador · Painel do contador
- **Fechamento do mês:** 5. Contador confere · Painel do contador; 6. Mês travado · Painel do contador
- **Como a nota pega o imposto:** 6. Analista fiscal · Analista fiscal
- **Nota do fornecedor:** 5. Crédito de impostos · Analista fiscal
- **De onde veio a entrada:** 6. Pronto para o contador · Painel do contador
- **Nota de serviço (NFS-e):** 6. Pacote do mês · Painel do contador
- **Parcelamento de imposto:** 1. Pedir a lista · Parcelamentos de impostos

## Expedição

_Separar, conferir, embalar e despachar os pedidos; etiquetas e DANFE._

- **Atalhos na barra do celular:** Separação e embalagem · Fluxo de pedidos
- **O que pode criar ou alterar:**
  - Separar, conferir, embalar e despachar pedidos

### Telas que abre (4)

**Logística**

- [Fluxo de pedidos](modulos.md#fluxo-de-pedidos): Veja cada venda do orçamento à entrega, com o próximo passo.
- [Separação e embalagem](modulos.md#separação-e-embalagem): Separe, confira e despache sem erro, direto no tablet do galpão.

**Configurações**

- [Documentos](modulos.md#documentos): Todo arquivo da empresa achado em segundos, num lugar só.
- [Scrum das equipes](modulos.md#scrum-das-equipes): Cada equipe entrega um pouco toda semana, sem perder o foco.

### Processos em que entra

Nos esquemas, este perfil é **Expedição** e **Logística**. Os passos dele em cada processo (só os que acontecem numa tela que ele abre):

- **Venda do começo ao fim:** 5. Separar e embalar · Separação e embalagem; 7. Entregue · Fluxo de pedidos
- **Venda no Mercado Livre:** 5. Separar e etiquetar · Separação e embalagem
- **Cliente acompanha a entrega:** 1. Pedido despachado · Separação e embalagem; 6. Entregue · Fluxo de pedidos

## Marketplaces

_Ajusta os cadastros dos produtos para os anúncios: título, descrição, fotos, EAN, categorias e medidas (sem preço, custo nem estoque)._

- **Atalhos na barra do celular:** Produtos e estoque · Peças à venda · Máquinas · Documentos
- **O que pode criar ou alterar:**
  - Cadastrar e editar produtos e preços

### Telas que abre (12)

**Vendas**

- [Loja online e marketplace](modulos.md#loja-online-e-marketplace): Cadastros prontos para anunciar e o Mercado Livre em dia.
- [Gestão de preços](modulos.md#gestão-de-preços): Os preços num lugar só: o que revisar, as regras e as tabelas.

**Cadastros**

- [Serviços](modulos.md#serviços): Preço de cada serviço padronizado para a OS e para a venda.

**Assistência**

- [Máquinas](modulos.md#máquinas): Cada modelo de máquina completo: peças, custo, manuais e clientes.

**Fábrica e estoque**

- [Produtos e estoque](modulos.md#produtos-e-estoque): Cadastro limpo, estoque certo em SC e SP e preço com margem.
- [Painel das máquinas](modulos.md#painel-das-máquinas): Saiba quais máquinas produzir antes de faltar para vender.
- [Painel dos produtos](modulos.md#painel-dos-produtos): Descubra o que vende, o que dá lucro e o que vai faltar.
- [Peças à venda](modulos.md#peças-à-venda): As peças que o cliente compra, prontas para vender em todo canal.
- [Tornearia (usinadas)](modulos.md#tornearia-usinadas): As peças usinadas na tornearia, numa lista só.
- [Insumos](modulos.md#insumos): O que vai dentro das máquinas, separado do que se vende.

**Configurações**

- [Documentos](modulos.md#documentos): Todo arquivo da empresa achado em segundos, num lugar só.
- [Scrum das equipes](modulos.md#scrum-das-equipes): Cada equipe entrega um pouco toda semana, sem perder o foco.

### Processos em que entra

Nenhum processo dos esquemas é deste perfil: ele cuida só das telas acima.

## Compras

_Ordens de compra, cotações, necessidades, notas de fornecedor (custo, preço para aprovação, vínculo com a OC), fornecedores e estoque._

- **Atalhos na barra do celular:** Compras e cotações · Notas fiscais · Fornecedores · Produtos e estoque
- **O que pode criar ou alterar:**
  - Produção, compras de peças e cotações
  - Receber compras no estoque
  - NF-e de fornecedores (entrada)
  - Cadastrar e editar fornecedores

### Telas que abre (17)

**Vendas**

- [Gestão de preços](modulos.md#gestão-de-preços): Os preços num lugar só: o que revisar, as regras e as tabelas.

**Cadastros**

- [Fornecedores](modulos.md#fornecedores): Fornecedores conferidos e protegidos contra pagamento a golpista.
- [Serviços](modulos.md#serviços): Preço de cada serviço padronizado para a OS e para a venda.

**Logística**

- [Transportadoras](modulos.md#transportadoras): Transportadoras e contatos num lugar só, prontos para cotar.

**Assistência**

- [Máquinas](modulos.md#máquinas): Cada modelo de máquina completo: peças, custo, manuais e clientes.

**Fábrica e estoque**

- [Painel da fábrica](modulos.md#painel-da-fábrica): Veja a fábrica de relance: o que monta, o que falta e o que comprar.
- [Produtos e estoque](modulos.md#produtos-e-estoque): Cadastro limpo, estoque certo em SC e SP e preço com margem.
- [Compras e cotações](modulos.md#compras-e-cotações): Compre certo, no preço certo, para SC ou SP.
- [Acompanhamento de compras](modulos.md#acompanhamento-de-compras): Cada peça pedida: ordem de compra, nota, transporte e chegada.
- [Painel das máquinas](modulos.md#painel-das-máquinas): Saiba quais máquinas produzir antes de faltar para vender.
- [Painel dos produtos](modulos.md#painel-dos-produtos): Descubra o que vende, o que dá lucro e o que vai faltar.
- [Peças à venda](modulos.md#peças-à-venda): As peças que o cliente compra, prontas para vender em todo canal.
- [Tornearia (usinadas)](modulos.md#tornearia-usinadas): As peças usinadas na tornearia, numa lista só.
- [Insumos](modulos.md#insumos): O que vai dentro das máquinas, separado do que se vende.

**Fiscal**

- [Notas fiscais](modulos.md#notas-fiscais): Toda nota emitida e recebida num lugar só.

**Configurações**

- [Documentos](modulos.md#documentos): Todo arquivo da empresa achado em segundos, num lugar só.
- [Scrum das equipes](modulos.md#scrum-das-equipes): Cada equipe entrega um pouco toda semana, sem perder o foco.

### Processos em que entra

Nos esquemas, este perfil é **Compras** e **Estoque**. Os passos dele em cada processo (só os que acontecem numa tela que ele abre):

- **Compra de peças e insumos:** 2. Cotação · Compras e cotações; 3. Pedido de compra · Compras e cotações; 5. Entrada no estoque · Produtos e estoque
- **Nota do fornecedor:** 2. Conferir os itens · Notas fiscais; 3. Entrada no estoque · Produtos e estoque
- **Produção de uma máquina:** 4. Comprar o que falta · Compras e cotações; 7. Pronta no estoque · Produtos e estoque
- **Devolução de venda:** 3. Conferir o que voltou · Produtos e estoque

## Só o giga

_Só a tela do Teste do giga (REG-006): lança e anula os testes das máquinas, sem ver o resto do ERP._

- **Atalhos na barra do celular:** Teste do giga (REG-006)
- **O que pode criar ou alterar:**
  - Lançar e anular testes do giga (REG-006)

### Telas que abre (1)

**Assistência**

- [Teste do giga (REG-006)](modulos.md#teste-do-giga-reg-006): Toda máquina testada e registrada antes de sair da fábrica.

### Processos em que entra

Nenhum processo dos esquemas é deste perfil: ele cuida só das telas acima.

## Representante (portal)

_Externo: só o portal, com os próprios pedidos, orçamentos, clientes da carteira e comissões._

Não entra no ERP: tem um login próprio só para o portal.

- **O que vê:** O representante entra com o login dele e vê só os próprios pedidos, orçamentos, carteira de clientes e comissões.
- **Como ganha o acesso:** Comissões → Vendedores e representantes → botão Portal no representante (cria o login dele; só ele entra no portal, o seu login abre o ERP)
