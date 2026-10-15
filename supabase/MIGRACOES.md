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
