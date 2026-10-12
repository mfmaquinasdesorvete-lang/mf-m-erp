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
  15. `20261101000034_apagar_testes.sql` (ainda não aplicada)
