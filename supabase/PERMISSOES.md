# Matriz de permissões do ERP Line

Quem vê e quem mexe em cada coisa, em duas camadas: **as telas** (o menu e os botões de cada perfil, em
`src/lib/permissoes.ts`) e **o banco** (as regras de linha — RLS — de cada tabela). A tela só esconde; quem
garante é o banco: mesmo que alguém chame a API direto, o banco recusa o que o perfil não pode.

Retrato de 17/10/2026. Ao mudar perfil, tela ou regra de tabela, atualize este arquivo (as consultas para gerar
estão no fim). O teste `src/lib/__tests__/bancoSeguranca.test.ts` confere as funções do banco a cada `npm test`.

## Perfis

- **admin** passa em toda regra de papel do banco (`tem_papel` aceita sempre o administrador).
- **equipe** = qualquer usuário interno ativo (`is_erp_user`): todos os perfis **menos** contador e representante.
- **Papel adicional**: um usuário pode ter papéis extras (ex.: Vendas + Marketplaces); vale a soma.
- **Contador** só lê (e escreve só no checklist, nas exceções da auditoria e nas mensagens). Não vê o painel pessoal.
- **Representante** não lê as tabelas: usa só as funções do portal, que filtram pelos clientes e pedidos dele.
- **Visitante sem login** (`anon`) não lê nem grava tabela nenhuma: as páginas públicas (proposta, cotação de
  fornecedor, ficha cadastral, área do cliente, máquina, loja) usam funções com o código (token) do link.

### Telas que cada perfil vê

| | Administrador | Vendas | Financeiro | Técnico | Contador | Expedição | Marketplaces | Compras | Representante (portal) |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Painel inicial | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |
| Vendas, orçamentos e PDV | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| Mercado Livre (anúncios, estoque e preço) | ✔ | ✔ | ✔ |  |  |  | ✔ |  |  |
| Fluxo de pedidos | ✔ | ✔ | ✔ |  |  | ✔ |  |  |  |
| Separação e embalagem | ✔ | ✔ | ✔ |  |  | ✔ |  |  |  |
| Fretes e envios | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| Comissões | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| Metas de vendas | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| Clientes | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |
| Fornecedores e transportadoras | ✔ | ✔ | ✔ |  |  |  |  | ✔ |  |
| Produtos e estoque | ✔ | ✔ | ✔ | ✔ |  |  | ✔ | ✔ |  |
| Produção, compras e cotações | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |  |
| Teste do giga (REG-006) | ✔ |  | ✔ | ✔ |  |  |  |  |  |
| Funcionários (RH) | ✔ |  | ✔ |  |  |  |  |  |  |
| Assistência técnica | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |
| Garantias | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |
| Financeiro | ✔ | ✔ | ✔ |  | ✔ |  |  |  |  |
| Conciliação bancária | ✔ |  | ✔ |  | ✔ |  |  |  |  |
| Margem | ✔ |  | ✔ |  |  |  |  |  |  |
| Relatórios | ✔ |  | ✔ |  |  |  |  |  |  |
| Notas fiscais | ✔ | ✔ | ✔ |  | ✔ |  |  | ✔ |  |
| Contador e fechamento | ✔ |  | ✔ |  | ✔ |  |  |  |  |
| Auditoria | ✔ |  | ✔ |  | ✔ |  |  |  |  |
| Documentos | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |
| E-mail | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| Configurações | ✔ |  |  |  |  |  |  |  |  |
| Usuários | ✔ |  |  |  |  |  |  |  |  |
| Troca do Tiny (implantação) | ✔ |  | ✔ |  |  |  |  |  |  |
| Importar dados | ✔ |  | ✔ |  |  |  |  |  |  |

### O que cada perfil pode fazer

| | Administrador | Vendas | Financeiro | Técnico | Contador | Expedição | Marketplaces | Compras | Representante (portal) |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Criar e editar pedidos, orçamentos e vendas no PDV | ✔ | ✔ |  |  |  |  |  |  |  |
| Cadastrar e editar clientes | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |
| Separar, conferir, embalar e despachar pedidos | ✔ | ✔ | ✔ |  |  | ✔ |  |  |  |
| Emitir NF-e | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| Emitir NFS-e | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| Cancelar NFS-e | ✔ |  | ✔ |  |  |  |  |  |  |
| Configurar a NFS-e | ✔ |  | ✔ |  |  |  |  |  |  |
| Abrir e editar ordens de serviço | ✔ |  |  | ✔ |  |  |  |  |  |
| Cadastrar equipamentos dos clientes | ✔ | ✔ |  | ✔ |  |  |  |  |  |
| Cadastrar e editar produtos e preços | ✔ |  | ✔ |  |  |  | ✔ |  |  |
| Movimentar estoque e contagem | ✔ |  | ✔ |  |  |  |  |  |  |
| Produção, compras de peças e cotações | ✔ |  | ✔ | ✔ |  |  |  | ✔ |  |
| Receber compras no estoque | ✔ |  | ✔ |  |  |  |  | ✔ |  |
| Lançar e anular testes do giga (REG-006) | ✔ |  |  | ✔ |  |  |  |  |  |
| Cadastrar e editar fornecedores | ✔ |  | ✔ |  |  |  |  | ✔ |  |
| Cadastrar transportadoras | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| Cotar e aprovar frete | ✔ | ✔ |  |  |  |  |  |  |  |
| Contas a receber, baixas e cobranças | ✔ |  | ✔ |  |  |  |  |  |  |
| Contas a pagar e pagamentos | ✔ |  | ✔ |  |  |  |  |  |  |
| NF-e de fornecedores (entrada) | ✔ |  | ✔ |  |  |  |  | ✔ |  |

- **Administrador**: Acesso total, usuários e configurações
- **Vendas**: Pedidos, PDV, clientes, cobranças e NF-e das vendas
- **Financeiro**: Contas a pagar/receber, notas fiscais, estoque, compras e fornecedores
- **Técnico**: Assistência técnica, garantias, produção e compras de peças
- **Contador**: Só consulta: notas fiscais, financeiro e o fechamento mensal (XML e planilhas)
- **Expedição**: Separar, conferir, embalar e despachar os pedidos; etiquetas e DANFE
- **Marketplaces**: Ajusta os cadastros dos produtos para os anúncios: título, descrição, fotos, EAN, categorias e medidas (sem preço, custo nem estoque)
- **Compras**: Ordens de compra, cotações, necessidades, notas de fornecedor (custo, preço para aprovação, vínculo com a OC), fornecedores e estoque
- **Representante (portal)**: Externo: só o portal, com os próprios pedidos, orçamentos, clientes da carteira e comissões

## Banco: quem lê e quem grava cada tabela

"—" = ninguém pela API (só o servidor, pelas funções e Edge Functions). Barra (/) separa regras alternativas.
Registros arquivados ou excluídos (clientes, notas, pedidos, OC, OP, OS) ficam fora da leitura por uma regra
restritiva a mais. Documentos de funcionário só para o financeiro.

| Tabela | Ver | Incluir | Alterar | Apagar |
|---|---|---|---|---|
| aprovacoes_desconto | equipe | — | — | — |
| auditoria | compras / financeiro, contador | — | — | — |
| auditoria_checklist | financeiro, contador | financeiro, contador | financeiro, contador | — |
| auditoria_excecoes | financeiro, contador | financeiro, contador | financeiro, contador | — |
| avisos | vendas, financeiro, o próprio | — | admin | — |
| avisos_tipos | equipe | — | admin | — |
| backups_registro | financeiro | — | — | — |
| baixas_estoque | contador / tecnico, expedicao, financeiro, compras | — | — | — |
| cadeias_causa | regra do projeto | — | — | — |
| cartao_gastos | financeiro, contador | — | — | — |
| categorias_financeiras | equipe | financeiro | financeiro | — |
| categorias_produto | equipe | financeiro / marketplace | financeiro / marketplace | — |
| centros_custo | equipe | financeiro | financeiro | — |
| clientes | contador / equipe | tecnico, vendas, financeiro | tecnico, vendas, financeiro | admin |
| clientes_assinaturas | equipe | — | — | — |
| clientes_pessoas | contador / equipe | tecnico, vendas, financeiro | tecnico, vendas, financeiro | — |
| cobranca_envios | vendas, financeiro | — | — | — |
| cobrancas_link | contador / vendas, financeiro | — | — | — |
| coleta_frequencias | equipe | expedicao, vendas, financeiro | expedicao, vendas, financeiro | — |
| comissao_regras | vendas, financeiro | financeiro | financeiro | financeiro |
| comissoes | financeiro, o próprio | — | — | — |
| compras_legado | equipe | — | — | — |
| conciliacao_regras | financeiro, contador | financeiro | financeiro | — |
| configuracoes | contador / equipe | admin | admin | admin |
| contabilidade_contatos | financeiro, contador | financeiro | financeiro | — |
| contador_mensagens | financeiro, contador | financeiro, contador, o próprio | financeiro, contador | — |
| contagem_itens | financeiro, contador | — | financeiro | — |
| contagens_estoque | financeiro, contador | — | — | — |
| contas_bancarias | financeiro, contador | financeiro | financeiro | — |
| contas_pagar | contador / financeiro | financeiro | financeiro | admin |
| contas_receber | contador / vendas, financeiro | financeiro | financeiro | admin |
| contas_recorrentes | financeiro, contador | financeiro | financeiro | — |
| contatos_cliente | equipe | tecnico, vendas, financeiro | tecnico, vendas, financeiro | admin |
| cotacao_fornecedores | compras / tecnico, financeiro | compras / tecnico, financeiro | compras / tecnico, financeiro | tecnico, financeiro |
| cotacao_itens | compras / tecnico, financeiro | compras / tecnico, financeiro | compras / tecnico, financeiro | tecnico, financeiro |
| cotacao_respostas | compras / tecnico, financeiro | compras / tecnico, financeiro | compras / tecnico, financeiro | tecnico, financeiro |
| cotacoes | compras / tecnico, financeiro | compras / tecnico, financeiro | compras / tecnico, financeiro | admin |
| cotacoes_frete | vendas, financeiro | vendas | vendas | vendas |
| cte_faturas | expedicao, financeiro, compras, contador | financeiro | financeiro | — |
| ctes | contador, vendas, expedicao, financeiro, compras | expedicao, financeiro, compras | expedicao, financeiro, compras | — |
| documentos | contador / quem vê a origem | contador, o próprio / o próprio, quem vê a origem | o próprio, quem vê a origem, admin | o próprio, admin |
| ecl_execucoes | admin | admin | admin | — |
| email_contas | quem tem acesso à caixa | — | — | — |
| emails | quem tem acesso à caixa | — | quem tem acesso à caixa | — |
| embalagens | equipe | marketplace / vendas, financeiro | marketplace / vendas, financeiro | — |
| envio_cotacoes | equipe | vendas, financeiro | vendas, financeiro | — |
| envio_excecoes | equipe | vendas, financeiro, o próprio | — | — |
| envio_ocorrencias | equipe | vendas, financeiro | vendas, financeiro | — |
| envios | equipe | vendas, financeiro | vendas, financeiro | — |
| equipamentos | equipe | tecnico, vendas | tecnico, vendas | admin |
| estoque_movimentos | equipe | financeiro | — | — |
| estoque_unidade | equipe | — | — | — |
| etiquetas_envio | equipe | vendas, financeiro | vendas, financeiro | — |
| expedicoes | equipe | — | — | — |
| extrato_importacoes | financeiro, contador | — | — | — |
| extrato_lancamentos | financeiro, contador | — | — | — |
| fechamentos | financeiro, contador | — | — | — |
| formas_pagamento | equipe | financeiro | financeiro | — |
| fornecedor_itens_sem_estoque | equipe | — | — | — |
| fornecedores | contador / equipe | compras / financeiro | compras / financeiro | admin |
| fornecimentos | compras / tecnico, vendas, financeiro | compras / tecnico, financeiro | compras / tecnico, financeiro | admin |
| funcionarios | financeiro | financeiro | financeiro | financeiro |
| icms_uf | contador / equipe | — | admin | — |
| implantacao_etapas | equipe | admin | financeiro | — |
| importacao_tiny | financeiro | — | — | — |
| importacao_tiny_historico | admin | — | — | — |
| inter_conexoes | financeiro, contador | — | — | — |
| kit_componentes | equipe / financeiro | financeiro | financeiro | financeiro |
| linhas_produto | equipe | financeiro | financeiro | — |
| loja_clientes | equipe, o próprio | — | — | — |
| marcadores | equipe, contador | compras / marketplace / vendas, financeiro | compras / marketplace / vendas, financeiro | — |
| metas_vendas | financeiro, gestor do vendedor | — | — | — |
| ml_anuncios | marketplace / vendas, financeiro | — | — | — |
| ml_contas | marketplace / vendas, financeiro | — | — | — |
| ml_pedidos | vendas, financeiro | — | — | — |
| nfe_cartas_correcao | contador / vendas, financeiro | — | — | — |
| nfe_custos_itens | financeiro, compras | — | — | — |
| nfe_inutilizacoes | contador / vendas, financeiro | — | — | — |
| nfe_oc_baixas | tecnico, financeiro, compras | — | — | — |
| nfe_oc_vinculos | tecnico, financeiro, compras | — | — | — |
| nfe_recebida_itens | quem vê a nota | — | — | — |
| nfe_recebidas | compras / contador / financeiro | financeiro | financeiro | admin |
| nfse | contador / tecnico, vendas, financeiro | — | — | — |
| nfse_config | equipe | financeiro | financeiro | — |
| nfse_eventos | contador / tecnico, vendas, financeiro | — | — | — |
| nfse_importadas | contador / tecnico, vendas, financeiro, compras | — | — | — |
| notas_fiscais | contador / expedicao / vendas, financeiro | — | — | — |
| notas_fiscais_xml | contador / vendas, financeiro | — | — | — |
| notas_legado | equipe | — | — | — |
| notificacoes | contador / equipe / equipe, o próprio | — | — | — |
| notificacoes_ciencia | equipe, o próprio | — | — | — |
| obrigacoes_cumpridas | financeiro, contador | — | — | — |
| openfinance_conexoes | financeiro, contador | — | — | — |
| ordens_producao | equipe | tecnico, financeiro | tecnico, financeiro | admin |
| ordens_servico | compras / tecnico, vendas, financeiro | tecnico | tecnico | admin |
| os_itens | compras / tecnico, vendas, financeiro | tecnico | tecnico | tecnico |
| parcelamento_parcelas | financeiro, contador | financeiro | financeiro | — |
| parcelamentos | financeiro, contador | financeiro | financeiro | — |
| partes_relacionadas | financeiro, contador | admin | admin | — |
| pedido_compra_itens | compras / tecnico, financeiro | compras / tecnico, financeiro | compras / tecnico, financeiro | tecnico, financeiro |
| pedido_itens | compras / contador / vendas, financeiro | vendas | vendas | vendas |
| pedidos | compras / contador / vendas, financeiro | vendas | vendas | admin |
| pedidos_compra | compras / tecnico, financeiro | compras / tecnico, financeiro | compras / tecnico, financeiro | admin |
| pessoal_contas | o próprio | o próprio | o próprio | — |
| pessoal_lancamentos | o próprio | o próprio | o próprio | — |
| portal_convites | admin | — | — | — |
| preco_sugestoes | compras / vendas, financeiro | — | financeiro | — |
| produto_componentes | equipe | tecnico, financeiro | tecnico, financeiro | tecnico, financeiro |
| produto_fornecedor | compras / financeiro | compras / financeiro | compras / financeiro | admin |
| produto_skus | equipe | — | — | — |
| produto_sugestoes | equipe | — | — | — |
| produtos | contador / equipe | compras / financeiro | compras / financeiro / marketplace | admin |
| produtos_midia | equipe | marketplace / tecnico, financeiro | marketplace / tecnico, financeiro | — |
| projeto_itens | regra do projeto | — | — | — |
| propostas_tiny | equipe | — | vendas, financeiro | — |
| recibos | equipe | vendas, financeiro | vendas, financeiro | — |
| regras_desconto | admin / equipe | admin | admin | admin |
| regras_tributacao | contador / equipe / financeiro | financeiro | financeiro | financeiro |
| regua_cobranca | equipe | financeiro | financeiro | — |
| revisoes_contas | financeiro, contador | — | — | — |
| tabela_preco_itens | equipe | financeiro | financeiro | financeiro |
| tabelas_preco | equipe | financeiro | financeiro | financeiro |
| tecnicos | equipe | tecnico, financeiro | tecnico, financeiro | — |
| teste_giga_parametros | tecnico, financeiro | — | — | — |
| testes_giga | tecnico, financeiro | — | tecnico | — |
| tiny_documentos | admin | — | — | — |
| tipos_contato | equipe | vendas, financeiro | vendas, financeiro | — |
| transferencia_itens | equipe | tecnico, financeiro | tecnico, financeiro | tecnico, financeiro |
| transferencias | contador / equipe | tecnico, financeiro | tecnico, financeiro | tecnico, financeiro |
| transportadoras | equipe | vendas, financeiro | vendas, financeiro | admin |
| unidades | contador / equipe | admin | admin | — |
| usuarios_erp | admin / o próprio, admin | admin | admin | admin |
| vencimentos_chaves | admin | admin | admin | — |
| vendedores | equipe / financeiro | financeiro | financeiro | financeiro |
| whatsapp_mensagens | vendas, financeiro | — | — | — |

**Fechadas para a API** (RLS ligada e nenhuma regra: só o servidor): `aprovacao_tentativas`, `backups_config`,
`ml_anuncios_envio`, `ml_oauth_estados`, `ml_sync_fila`, `nfe_recebida_itens_lidos`, `senhas_aprovacao`, `sync_estado`.

**Permissões gerais das tabelas** (migração `20261017173100_integridade_chaves_permissoes`): `anon` sem INSERT,
UPDATE, DELETE, TRUNCATE, TRIGGER e REFERENCES; `authenticated` sem TRUNCATE, TRIGGER e REFERENCES. Vale também
para as tabelas criadas depois.

## Funções do banco (security definer)

Função `security definer` roda com o dono do banco e passa por cima das regras acima; por isso cada uma precisa
conferir quem chama. O teste `bancoSeguranca.test.ts` lê todas as migrações e falha se uma função assim:

1. não fixa o `search_path`;
2. não confere o papel (`exigir_papel`, `tem_papel`, `is_erp_*`, `e_contador`, `auth.uid()`, portal do vendedor…),
   não é gatilho, não foi fechada para `authenticated` e não está na lista justificada do teste;
3. é liberada para `anon` sem estar na lista das páginas públicas.

Liberadas para visitante (`anon`), todas pelo token do link: `area_cliente`, `cotacao_publica`, `cotacao_responder`,
`cotacao_recusar`, `ficha_cadastral_publica`, `ficha_cadastral_assinar`, `maquina_publica`, `proposta_publica`,
`proposta_responder`, `loja_dados` (vitrine) e `erp_sem_usuarios` (só diz se o ERP ainda não tem usuário, para a
primeira instalação).

Só para o servidor (fechadas para `anon` e `authenticated`): as que leem segredos (`email_senha`, `inter_chaves`,
`openfinance_chaves`, `ml_segredos`, `whatsapp_segredos`…), as de importação automática e as de rotina.

## Como gerar de novo

- Telas: `permissoes.ts` (`telasDoPapel`, `acoesDoPapel`).
- Banco: `select tablename, cmd, permissive, roles, qual, with_check from pg_policies where schemaname = 'public'`.
- Funções liberadas: `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')`.
