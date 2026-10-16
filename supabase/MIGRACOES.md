# Mudanças do banco (migrações)

Cada arquivo tem o mesmo número (versão) que o Supabase registrou ao aplicar a mudança, para o histórico
do GitHub bater com o do banco (`supabase migration list`).

## Regras
- **Só acréscimos:** nada de apagar tabela, coluna, política, gatilho ou dados nas migrações; funções com
  `create or replace`; "apagar" um cadastro é marcar `ativo = false`.
- Mudança aplicada pelo Supabase recebe como número a data e hora reais da aplicação. Depois de aplicar,
  o arquivo é renomeado para esse número.
- Arquivo que ainda não aparece no histórico do banco está esperando para ser aplicado.
- Arquivos que só têm `select 1;` são registro de histórico: a mudança foi aplicada em partes e o conteúdo
  completo está no arquivo indicado neles.
- A parte `20261101000014_1` (envios_fretes_regras) não tem arquivo próprio, porque esse número não é aceito
  como nome de arquivo: o conteúdo está em `20261101000014_envios_fretes.sql`.

## Ordem para montar um banco novo do zero
O normal é restaurar o backup do ERP. Se precisar montar pelas migrações, atenção: os arquivos de
`20261006000000` a `20261101000024` foram numerados à mão (com datas à frente) e os aplicados depois
receberam a data real, de 10/10/2026 em diante. Por isso a ordem alfabética não é a ordem em que foram aplicados.

1. Todos os arquivos em ordem alfabética, **menos** os da lista do passo 2.
2. Depois, nesta ordem (as próximas mudanças entram no fim desta lista):
   1. `20261010024627_clientes_cadastro_completo.sql`
   2. `20261010031233_ficha_search_path.sql`
   3. `20261010124833_backups.sql`
   4. `20261010142441_backups_hostinger_4h.sql`
   5. `20261010145342_clientes_virar_fornecedor.sql`
   6. `20261010234106_nfse.sql`
   7. `20261011034143_formacao_preco.sql`
   8. `20261011052905_fornecedores_cotacao.sql`
   9. `20261011184944_pdv.sql`
  10. `20261011232116_usuarios_permissoes.sql`
  11. `20261011234145_comissao_por_categoria.sql`
  12. `20261012010251_tabelas_preco.sql`
  13. `20261012025420_link_pagamento_pedido.sql`
  14. `20261012031116_open_finance.sql`
  15. `20261012102628_whatsapp_oficial.sql`
  16. `20261012161835_estrutura_multinivel.sql`
  17. `20261101000034_apagar_testes.sql` (ainda não aplicada)
  18. `20261012213505_funcionarios.sql`
  19. `20261013130811_perfis_expedicao.sql`
  20. `20261013135628_fornecedor_golpe.sql`
  21. `20261013162027_fluxo_aprovacao.sql`
  22. `20261013164713_boleto_conta_pagar.sql`
  23. `20261013175659_pagamento_so_aprovado.sql`
  24. `20261013194845_configuracoes_paginas.sql`
  25. `20261013210651_codigos_ean.sql`
  26. `20261013223050_regras_beneficio_desoneracao.sql`
  27. `20261014024330_extrato_por_email.sql`
  28. `20261014035644_inter_extrato.sql`
  29. `20261014041703_contas_bancarias_inter.sql`
  30. `20261014045631_legado_myfrost.sql`
  31. `20261014051949_maquina_usada.sql`
  32. `20261014053611_os_maquina_outra_empresa.sql`
  33. `20261014061524_propostas_tiny.sql`
  34. `20261014063805_descontos_aprovacao.sql`
  35. `20261014064148_descontos_aprovacao_2.sql`
  36. `20261014070823_descontos_conferencia.sql`
  37. `20261014070837_descontos_conferencia_proposta.sql`
  38. `20261014081934_kits_aninhados.sql`
  39. `20261014083601_marcadores_cadastros.sql`
  40. `20261014162044_seguranca_funcoes.sql` (funções internas fora do alcance de quem não está logado; caminho de busca fixo)
  41. `20261014171031_implantacao.sql` (plano de troca do Tiny: etapas com prazo e responsável + indicadores de uso)
  42. `20261014185800_busca_geral.sql` (busca geral do menu: clientes, vendas, notas, produtos, OS e fornecedores, com as permissões de quem busca)
  43. `20261014200212_excluir_os.sql` (excluir OS como a OC e a OP: some das listas, peças voltam ao estoque, conta em aberto cancelada, dá para restaurar; a OP leva junto as OC em cotação)
  44. `20261014230258_loja_google.sql` (lista de produtos do Google Shopping pelo ERP: título do anúncio, código de barras, categoria, peso e prazo de envio sob encomenda)
  45. `20261015103132_mercadolivre.sql` (Mercado Livre fase 1: contas, anúncios ligados aos produtos, vendas importadas com cliente, estoque de SP e conta a receber pelo líquido; cancelamento; chaves no cofre)
  46. `20261015104403_clientes_enderecos_unificacao.sql` (clientes com até 3 endereços com etiqueta; e-mail único vale também para a NF-e; unificar cadastros guarda o que é diferente no principal e deixa o aviso do que foi unificado)
  47. `20261015105119_ficha_enderecos.sql` (a ficha cadastral que o cliente confere e assina leva também os endereços 2 e 3 com etiqueta)
  48. `20261015110952_textos_padrao.sql` (textos padrão dos documentos: OP, OC, OS, pedido, termo da ficha cadastral e condições da máquina usada na proposta)
  49. `20261015112201_ultimas_compras.sql` (ordem de compra → ver últimas compras: pedidos de compra e itens das notas de fornecedor, por fornecedor ou pela descrição)
  50. `20261015113611_maquinas_midia_tecnicos.sql` (painel das máquinas: galeria de fotos e vídeos, manuais e dicas, especificações, etapas de produção na OP, técnicos com região, página da máquina para o cliente, histórico de custos e sugestor de NCM)
  51. `20261015114351_servicos.sql` (tipo serviço: carga de gás, limpeza e lavagem, troca de compressor, reparo em mecânica; sem estoque nem reposição)
  52. `20261015124941_itens_notas_fornecedor.sql` (itens das notas de fornecedor lidos do XML numa tabela própria; conferir itens: ligar ao produto, que já atualiza os fornecedores do produto, ou marcar como uso e consumo / bem da empresa / serviço; não mexe no estoque)
  53. `20261015131844_propostas_tiny_marcadores.sql` (propostas do Tiny: marcadores; vendas e financeiro mudam só próximo contato, situação e marcadores)
  54. `20261015140119_clientes_compra_maquina.sql` (cliente: data de compra da máquina, que no Tiny ficava no campo "Código"; importar contatos preenche só onde está vazio e unificar leva a data para o cadastro que fica)
  55. `20261015143058_maquinas_do_cliente.sql` (OS: máquinas do cliente com garantia, lidas dos equipamentos, das NF-e de venda emitidas (XML) e da data de compra do cadastro; taxa do diagnóstico por vídeo chamada fora da garantia, padrão R$ 150,00)
  56. `20261015152112_linhas_produto.sql` (linhas de produtos como no Tiny: comissão fixa, conforme o desconto do item ou herdada; produto ligado a uma linha; comissão item a item: vendedor+categoria → linha → categoria → vendedor)
  57. `20261015154454_compras_marketplace.sql` (compras em marketplaces: notas de fornecedor com intermediador (Mercado Livre, TikTok Shop, Shopee…), o usuário da loja e o número do pedido, lidos do XML; só leitura)
  58. `20261015172706_avisos_urgencia.sql` (avisos entre usuários: para todos, um perfil ou pessoas escolhidas; urgência normal, importante ou urgente; quem mandou vê quem deu ciente)
  59. `20261015173930_usuarios_ultimo_acesso.sql` (último acesso de cada usuário, lido do login, para a auditoria; só administrador, financeiro e contador)
  60. `20261015180031_partes_relacionadas.sql` (partes relacionadas: sócios e empresas ligadas com CPF/CNPJ só no banco, para o painel do dinheiro entre as contas da MF, sócios e empresas ligadas; lê administrador, financeiro e contador, cadastra só o administrador)
  61. `20261015184046_fornecedores_filiais.sql` (fornecedores como as transportadoras: marca com filiais (um nível), rede de filiais achadas na internet, agrupar e unificar repetidos sem apagar nada)
  62. `20261101000034_apagar_testes.sql` (apagar dados de teste: pedidos, OS, OP e contas escolhidos, com prévia; NF-e autorizada fica com observação, estoque volta e fica na auditoria). Aplicada pelo SQL Editor do Supabase em 15/10 (a confirmação do Supabase não chegava a tempo), por isso não aparece na lista de migrações do projeto
  63. `20261015201010_perfil_marketplace.sql` (perfil Marketplaces: ajusta os cadastros dos produtos — título, descrição, fotos, EAN, categorias, marcadores, medidas e embalagens — sem ver o financeiro; preço, custo, estoque, fornecedor, tipo e ativar/desativar ficam com o financeiro, travados também por gatilho)
  64. `20261015203337_nfe_entrada_estoque.sql` (NF-e de entrada emitida pela MF — máquina usada de pessoa física, conserto, retorno de comodato/demonstração —: o lançamento do estoque da nota direta de entrada dá entrada, e o estorno tira; nota de entrada não gera conta a receber)
  65. `20261015210615_usuarios_foto.sql` (foto de cada usuário, pequena e guardada no cadastro; aparece na lista de Usuários e no menu; só o administrador grava)
  66. `20261015214323_op_pedido.sql` (a ordem de produção guarda de qual venda é: Venda de Máquinas mostra Proposta → Pedido → OP → NF)
  67. `20261015220711_propostas_reimportar.sql` (importar de novo as propostas do Tiny ou o backup da My Frost não apaga o próximo contato e a situação mudados no ERP; a planilha só preenche o que está vazio)
  68. `20261015224933_notas_legado.sql` (notas fiscais da My Frost — número, data, tipo e valor da nota — ligadas ao cliente do ERP pelo CPF/CNPJ; aparecem na ficha do cliente e na proposta para saber por quanto ele comprou; não entram nos totais da MF)
  69. `20261015234511_licenciados_my_frost.sql` (etiqueta "Licenciado My Frost" no cadastro do cliente: quem compra máquina pela My Frost Sorveterias, a licenciadora; a Venda de Máquinas e as propostas filtram por ela)
  70. `20261016005702_ficha_grupos_etapas.sql` (ficha técnica por grupo — estrutura, refrigeração, elétrica, mecânica, cilindro e pás, acabamento, outros — e como cada item chega: comprado pronto, fabricado aqui ou com etapa em terceiro, como a injeção das pás; etapas com detalhe, mantendo os nomes para a lista da OP)
  71. `20261016044037_testes_conciliado_nao_e_teste.sql` (apagar dados de teste não apaga conta conciliada com o extrato do banco: o gatilho barra a operação inteira com o nome da conta, a data e o valor da entrada; a tela mostra essas contas travadas)
  72. `20261016052925_tiny_historico_pedidos.sql` (histórico do Tiny pela API: todos os pedidos de venda com itens entram como pedidos do ERP — `id_externo` `tiny:<id>`, número e situação do Tiny guardados — sem mexer em estoque, contas, comissão, expedição nem avisar cliente; o JSON do Tiny fica em `tiny_documentos`; as NF-e já importadas são ligadas ao pedido pela nota do Tiny ou, sem ela, por cliente + valor + data, para a venda não contar duas vezes; produtos genéricos TINY-ITEM e TINY-MAQUINA para item sem cadastro)
  73. `20261016125825_importar_backup_tiny.sql` (backup do Tiny de uma vez — contatos que faltam com marcador, produtos, pedidos de venda pela função do histórico, ordens de compra, contas a receber com a tarifa do recebimento, contas a pagar e cartas de correção — sem duplicar ao rodar de novo; contas já pagas entram como histórico e as em aberto vão para a aprovação; sem estoque, comissão nem mensagem a cliente)
  74. `20261016130915_ligar_notas_tiny_documento.sql` (NF-e do Tiny ligada ao pedido também pelo CPF/CNPJ do destinatário: a nota costuma sair sem o frete e a importada pelo XML pode estar sem cliente; nota emitida até 30 dias depois do pedido, valor até 10% do total ou dos produtos, só com par único; a nota ganha o cliente do pedido e a conta a receber aponta para a nota)
  75. `20261016131617_tiny_vendedor_sem_acento.sql` (pedido do Tiny acha o vendedor pelo nome sem acento e sem diferença de maiúsculas: "Olmêdo" no Tiny = "Olmedo" no ERP)
  76. `20261016142829_importar_backup_tiny_oc.sql` (ordens de compra do Tiny de todo o período: fornecedor achado pelo código do Tiny, depois pelo CNPJ e só por último pelo nome — filiais com o mesmo nome; item aceita o produto já achado na conferência; OC recebida entra com os itens recebidos, só histórico, sem mexer no estoque; produto cujo código já foi usado no ERP não entra de novo)
  77. `20261016142929_propostas_outra_empresa.sql` (a mesma proposta do Tiny não entra nas duas empresas: escolher "MF" para uma planilha da My Frost, ou o contrário, deixa de fora as que já estão na outra empresa e a tela mostra quantas)
  78. `20261016154555_ml_estoque_preco.sql` (Mercado Livre fase 2: o ERP manda o estoque da unidade da conta e o preço — de venda ou de uma tabela, com ajuste em % — para os anúncios ligados a produtos; kit pelo estoque das peças; estoque de segurança, limite mostrado e trava de preço com aprovação; exceções por anúncio; fila sem repetição preenchida por gatilhos, esvaziada a cada 5 minutos pela função mercadolivre e conferida todo dia; tudo começa desligado)
  79. `20261016162804_metas_vendas.sql` (metas de vendas por mês — da empresa, de cada vendedor, de cada estado e de cada região do IBGE, por unidade ou de todas — com faturamento, máquinas e margem mínima; gravadas e copiadas do mês anterior com % de aumento só pelo administrador ou financeiro; apuração meta x realizado com a regra das vendas do Painel gerencial — pedidos aprovados + NF-e de venda sem pedido, menos devoluções de venda —, % atingido, projeção pelos dias úteis, falta por dia útil e o mesmo mês do ano anterior; o vendedor vê só a própria meta)
