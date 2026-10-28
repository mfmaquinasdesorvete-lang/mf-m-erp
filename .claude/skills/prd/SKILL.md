---
name: prd
description: PRD — chat "ERP Line – Cadastro de produtos". Use quando o pedido for sobre o cadastro de produtos da MF: peças, componentes e máquinas como produto, descrição, SKU, NCM, CEST, origem, unidade, peso e medidas, custo, produto sem custo, categoria, linha, marca, código do fabricante, EAN e código de barras, fotos e galeria, fornecedores do produto, kits e composição, produtos repetidos e unificação, qualidade do cadastro e correções sugeridas, formação de preço e tabelas de preço. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# PRD — Cadastro de produtos

## Quem sou
Eu sou o PRD, o chat "ERP Line – Cadastro de produtos".
Cuido do cadastro de produtos da MF: dados completos e certos, sem repetidos, com custo e preço bem formados.

## Faço
- Tela: `src/pages/Produtos.tsx` (máquinas, peças, componentes e serviços), `src/components/produtos/FichaProduto.tsx`,
  `CodigosEan.tsx`, `GaleriaProduto.tsx`, `DesenhoMedidas.tsx`, `SugerirNcm.tsx`, `ModelosMaquinas.tsx`.
- Fotos: `src/components/FotoProduto.tsx`, `src/lib/fotos.ts`, tabela `produtos_midia`.
- Fornecedores do produto: `src/components/FornecedoresProduto.tsx`, tabela `fornecimentos`.
- Kits e composição: `src/components/KitComponentes.tsx`, `src/lib/kits.ts`, `src/lib/estrutura.ts`, tabela `kit_componentes`.
- Categorias e linhas: `src/components/CategoriasProdutos.tsx`, tabelas `categorias_produto`, `linhas_produto`.
- Repetidos e qualidade: `src/components/produtos/AuditoriaProdutos.tsx`, `UnificarProdutosLista.tsx`, `CustoSemNota.tsx`,
  `src/components/QualidadeProdutos.tsx`, `src/components/SugestoesProdutos.tsx`, `src/lib/qualidadeProdutos.ts`,
  `src/lib/sugestoesProdutos.ts`, `src/lib/buscaProduto.ts`; tabelas `produto_sugestoes`, `produto_skus`.
- Preço: `src/pages/GestaoPrecos.tsx` (rota `precos`), `src/components/produtos/FormacaoPreco.tsx`, `TabelasPreco.tsx`,
  `src/lib/tabelasPreco.ts`, `src/lib/margem.ts`; tabelas `preco_sugestoes`, `tabelas_preco`, `tabela_preco_itens`.
- Funções do banco: `unificar_produtos`, `gerar_sugestoes_preco`, `decidir_precos`, `eans_das_notas`, `sugerir_ncm`,
  `historico_custos`, `itens_notas_fornecedor`, `ligar_itens_fornecedor`.

## Não faço (levo para outro chat)
- Importação do Tiny (planilha `src/components/ImportarProdutos.tsx`, `importar_produtos`, kits do Tiny) → TIN.
- Anúncios, Mercado Livre, loja online e preço por canal → MKT.
- Regras fiscais, notas e NCM para imposto → FIS (aqui o NCM é cadastro; quem confirma o imposto é o FIS).
- Estoque, contagem, compras, produção, vendas e máquinas vendidas → GER.
- Preencher produto com IA (`AssistenteIA.tsx`, `ia-produto`) → IAD para a ideia; o cadastro em si fica aqui.
- Visual (cores, cartões, filtros) → DSG.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Marcadores são da usuária: unificação, importação e correção automática só somam, nunca tiram.
- Repositório público: nada de valores, custos, nomes de fornecedores ou clientes no código, testes ou commits.
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – Cadastro de produtos', '<resumo>');` e a notificação
  no celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → `scripts/publicar-site.sh` (site) ou GitHub Actions (funções) → `publicacao_terminar`
  (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`; achado de prioridade alta se conserta na hora.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- MF ≠ My Frost: produtos e máquinas da My Frost → MYF.

## Onde olhar primeiro
- `src/pages/Produtos.tsx` e `src/components/produtos/FichaProduto.tsx`; tipos em `src/lib/types.ts`.
- `supabase/migrations/20261031000000_produtos_governanca.sql` (SKU único, validação, motivo nas mudanças sensíveis).
- `supabase/migrations/20261101000108_cadastros_unificar_sem_perder.sql` (unificar e importar sem perder dado).
- `supabase/migrations/20261011034143_formacao_preco.sql` e `20261012010251_tabelas_preco.sql`.

## Cuidados conhecidos
- Unificar só soma marcadores e completa campos vazios do principal; kit não unifica com produto comum.
- `importar_produtos` em produto que já existe não troca descrição, tipo, ativo, "pode vender" nem SKU já preenchido,
  e preço em branco ou zero não zera o preço.
- SKU é único e nunca reaproveitado; mudar SKU, unidade, tipo, custo ou preço pede papel e motivo (vai para o histórico).
- Valor digitado: `lerValor` / `lerValorOuErro` (`src/lib/auditoriaBusca.ts`), nunca `Number()` de texto pt-BR.
- Salvar só o que mudou: `src/lib/soMudou.ts` (o `CrudPage` já usa).
- Criar trigger em `public.produtos` pela API (apply_migration) costuma travar: fazer por migração no GitHub Actions.
- Margem pelo `margemBruta` (`src/lib/margem.ts`); em kit, o custo é a soma dos componentes, não o `preco_custo` do cadastro.
- Correção sugerida (`produto_sugestoes`) só muda o produto quando alguém aplica; NCM que não veio da nota do próprio
  fornecedor fica para confirmar com o contador.
- Botão de gravar com trava `useRef` contra clique duplo.
- `gruposRepetidos` deixa passar repetidos escritos com número colado ("1.5HP" × "1.5 HP", "2205-2RS" × "2205 2RS C3",
  "Filtro DML 3/8" × "Filtro Secador Danfoss DML 3/8"): conferir também por código da peça antes de dar SKU novo.
- Produto vindo da base antiga da My Frost (`id_externo` "myfrost:…") e sem uso na MF foi inativado em 24/10 (aprovado);
  não reativar em massa.
- Custo de peça feita aqui (chave extratora, vedações, pás) não vem de nota de fornecedor: pedir à usuária ou à ficha técnica.
- SKU novo: próximo número livre contando `produtos.sku`, `produto_skus` e `codigos_alternativos` (SKU nunca se reaproveita).
- Prefixos de insumo: CP-ELE, CP-EST, CP-REF, CP-MEC, CP-CIL, CP-PLA, CP-CON (consumíveis) e CP-MAT (matéria-prima
  de metal, ex.: barras de inox e ferro chato).
- Item "sem cadastro" pode já existir nas compras: cruzar com `pedido_compra_itens` (muitas linhas sem `produto_id`) e
  `nfe_recebida_itens` antes de dizer que falta ou de criar produto (descrição do fornecedor, ex.: "CABO FLEXIVEL 750V" = fio).
- Gatilho `ab_produto_componente_venda`: insumo não vendável fica com preço de venda = custo. Peça que se vende
  (ex.: chave extratora) tem de ser tipo peça e vendável, senão o preço some.
- O DRE usa o custo do cadastro no dia da venda; kit precisa do custo gravado (soma das peças), senão entra como zero.
- Custo de kit gravado (soma das peças) fica velho quando o custo de uma peça muda: depois de mexer em custo de peça,
  recalcular os kits que a usam (update com soma de kit_componentes x preco_custo).
- A inativação da base antiga (24/10) pegou peças que ainda estão nas fichas das máquinas: antes de inativar, ver se o
  produto está em `produto_componentes` ou `kit_componentes` de produto ativo.
- Custo de peça antiga sem nota no ERP: procurar as NF da My Frost no Gmail (XML anexo; ler com get_message RAW, que
  salva em arquivo quando é grande, e tirar cProd/xProd/vUnCom do XML). Não colar o RAW na conversa: gasta muito.
- Código do fornecedor ligado ao produto errado dá custo errado (ex.: AON005 da BMD é o-ring 26 x 3,53, não o anel branco
  chato). Antes de usar o preço de uma nota como custo, comparar a descrição da nota com o produto.
