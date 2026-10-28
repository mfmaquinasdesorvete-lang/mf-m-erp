# MEMORY — TIN (ERP Line – Importações do Tiny)
Atualizado em 27/10/2026.

## Estado agora
Quase tudo do Tiny da MF já está no ERP: contatos, produtos, kits, pedidos, propostas, OCs, OS e os backups de 19 e 20/10.
O que falta depende de botões que só a usuária pode clicar (a função do Tiny exige o login dela) ou de planilhas que ela manda.
A base da My Frost (empresa anterior) passou para o MYF em 23/10.

## No ar
- Botões "Atualizar cadastros do Tiny" e "Trazer a data de cadastro" (Importar → Tiny) e a aba "Decidir" das
  recebidas sem dono (`DecidirRecebidasTiny`).
- As tags e os marcadores do Tiny viram marcadores no ERP, com o mesmo nome; a de garantia também ganha "Garantia"
  (migração 20261023012230).
- OCs do Tiny com data, ID e número; itens de OC com custo e a origem anotada.
- Backup de 19/20-10: as tags dos clientes, os campos vazios de contatos e produtos (só onde estava vazio) e os técnicos
  novos.
- A lista "Propostas do Tiny (MF)" abre com todas, sem o filtro da semana (7164b1b).
- O aviso da Implantação conta só os cadastros vivos, sem unificados e arquivados (migração 20261023042645).
- Kits: 33 de 34 com composição; o que falta é só um cálculo interno inativo.
- 43 fornecedores homologados pela categoria Homologado do Tiny; uma empresa que era só cliente virou fornecedor.
- Categoria de cliente "Vendeu a máquina" (`tipos_contato` vendeu_maquina) e marcador "Comprou usada", juntando as
  duas bases.
- Propostas do Tiny em aberto: todas fechadas, como Concluído (virou venda) ou Não aprovado.

- Planilhas finais do Tiny (27/10, com o ok dela): contas a pagar pagas até 28/09 (`id_externo` tiny-planilha:cp:…) e
  recebimentos do caixa do Tiny ligados ao pedido (tiny-planilha:cr:pedido:n), como histórico.
- XML do Tiny (27/10): as notas de saída já estavam todas; entraram as notas de entrada emitidas pela MF, as de uso
  negado, um cancelamento e as cartas de correção que faltavam (referencia importada-<chave>).

## Em andamento
- Pedido "MF SC desde 06/2022" (o FIS coordena, 28/10): mandei ao FIS o levantamento mês a mês. O Tiny da MF só tem
  movimento a partir de 02/2025, e está todo no ERP. Antes disso há só algumas notas, já no ERP; o resto vem da Sefaz,
  do contador ou do banco (FIS/FAZ).
- Virada do Tiny (o GER propõe a data): mandei ao GER a lista do que falta trazer. No ERP, pedidos e NF-e do Tiny vão até o
  fim de setembro, contas a pagar até 20/10 e os recebimentos do Tiny nunca foram buscados.

## Esperando a usuária
- Ver no Tiny a situação de 10 NF de saída sem XML (96, 101, 132, 203, 255, 278, 318, 360, 393, 426; a 255 é o pedido 415 do ERP (418 no Tiny),
  sem NF autorizada). Auditoria de 28/10: os 386 XML de saída de 2023 a 2026 estão todos no ERP. Avisei o FIS, que confere
  também 16 números sem nota (ela acha que não foram inutilizados). Em 28/10 entrou a NF 15 de entrada (estorno da
  NF 14); as outras 13 de entrada já estavam.
- Exportar do Tiny, antes de cancelar: NFS-e emitidas (se houver), os anexos e a NF de entrada de 01/2025 que falta.
- Backup final do Tiny da MF antes de cancelar a assinatura (o Tiny não é usado desde 28/09): antes, rodar os botões
  de recebimentos e cadastros (a API para quando a assinatura acaba); depois baixar contas a pagar e receber (todas as
  situações), XML das NF-e emitidas e de entrada, NFS-e, pedidos com itens, OCs, OS, propostas, produtos com estoque e
  os anexos. Mandar o zip aqui; eu confiro o que ainda não está no ERP.
- Clicar em "Atualizar cadastros do Tiny" e em "Buscar recebimentos do Tiny" (esse último alimenta a aba "Decidir").
- Planilha de contas a pagar do Tiny filtrada pelos contatos de um instalador de ar-condicionado e da empresa dele, para
  ligar os pagamentos aos fornecedores (pedido do GER).
- Ok para aplicar as contas pagas do Tiny em Aprovações, os extratos das contas que faltam e o XML das NF de entrada.
- Três dúvidas antigas do backup MF: contas a pagar de 2027, compras da SC que não batem com as notas e um RPS sem
  número de NFS-e.

## Decisões da usuária
- Cadastro único: o mesmo cliente da MF e da My Frost é um cadastro só, e a planilha da MF só completa o que está vazio
  no cadastro que veio da My Frost.
- Do backup só entram os contatos ativos que são cliente, transportadora, fornecedor ou técnico. Os que são só "Outro" e
  os contatos com nome de anotação ficam de fora.
- Código de barras inventado pelo Tiny (repetido, sem o prefixo do fabricante) não entra no produto.
- O restaurante das marmitas fica sem o selo de homologado; o contato de protesto não vira fornecedor.
- Proposta do Tiny não é apagada: fecha como Não aprovado ou Concluído e continua no histórico.

## Onde está
- Telas: `src/pages/Importar.tsx`, `src/components/ImportarTiny.tsx`, `ImportarContatos.tsx`, `ImportarProdutos.tsx`,
  `vendas/ImportarPropostasTiny.tsx`, `vendas/PropostasTiny.tsx`, `DecidirRecebidasTiny.tsx`.
- Banco: `importacao_tiny`, `tiny_documentos`, `propostas_tiny`, `importar_contatos`, `importar_produtos`,
  `decidir_recebida_tiny`, `pedidos_compra` (ids do Tiny).
- Funções do Supabase: `tiny-importar`, `tiny-historico` (token só no secret `TINY_API_TOKEN`).

## Próximos passos
0. Na virada: a usuária clica em histórico, recebimentos e cadastros do Tiny; eu confiro as contagens com o Tiny.
1. Quando ela rodar "Buscar recebimentos do Tiny": conferir a aba "Decidir" e cruzar com o ENT.
2. Quando a planilha do instalador chegar: mostrar a lista, ligar aos dois fornecedores com o ok dela e avisar o GER.
3. Se o TRA pedir transportador e forma de envio dos pedidos, gravar esses campos numa próxima busca do pedido.obter.
