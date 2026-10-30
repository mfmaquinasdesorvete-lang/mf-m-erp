# MEMORY — CLI (ERP Line – Cadastro de clientes)
Atualizado em 27/10/2026.

## Estado agora
Cadastro de clientes limpo nas IEs (nenhum cliente ativo como contribuinte com IE baixada ou não encontrada).
Ficha 360 e lista de clientes mais coloridas e enxutas, com as redes de clientes destacadas. Tudo no ar.

## No ar
- IE baixada: clientes da MF corrigidos com o ok da usuária (IE nova ativa ou não contribuinte, IE antiga nas
  observações); os da base My Frost foram corrigidos pelo MYF do mesmo jeito (dados, 23/10).
- Marcadores do Tiny que faltavam ("Vendedor", "Homologado") somados aos cadastros (dados, 23/10).
- Cliente que também presta serviço vira fornecedor sem deixar de ser cliente (`clientes_virar_fornecedor` com
  `p_manter_cliente = true`) (dados, 24/10).
- Ficha 360: abas em blocos coloridos (`BlocoFicha`) e etiqueta da máquina maior na lista e na ficha (37e9f9b).
- Lista de clientes: só o botão do WhatsApp (ligar só sem WhatsApp), e-mail só no ícone, sem as etiquetas
  "My Frost (histórico)" e "Dono de máquina My Frost" (8162211).
- Redes de clientes: fundo fraquinho no cartão e na linha, selo da rede e, na ficha, os outros clientes da mesma
  rede (c5a5300).
- Dados fiscais: clientes-receita preenche regime tributário e data de abertura vazios (5aee418); 1.142 PJ
  preenchidos (27/10).
- Inativar/Reativar clientes, botão Inativos, selo USADA, selo da ficha assinada, anexos em link do Gmail/Drive
  (207 em 153 clientes), lista mais leve (bb9615a) e agendamentos leves (20261101000174).
- Repetidos pelo nome unificados com o ok dela: 58 grupos (pessoa CPF + empresa CNPJ, ou um sem documento), fica o
  cadastro com CNPJ (dados, 26/10). "Compra da máquina" preenchida com a data da máquina mais recente onde estava
  vazia (dados, 26/10).

## Em andamento
- Nada novo (rodada de fechamento: função nova só se ela pedir).
- Pedido do CNF e do ELO (27/10): 22 pedidos testados e com "Testado em 27/10: …" gravado no detalhe (um update só),
  incluindo 7e3b667c, cd15f506, bef6b62e e o 23cf9fcf (dados fiscais), que virou "feito". a681f43c (licença e comodato
  da Yozzy Natal) é do SOR.

- Desfeita a unificação 590 ← 300 (27/10, com o ok dela): o 300 era filial diferente (já recriada como 2176 pelo
  Tiny). Não há botão de desfazer; à mão: tirar de `enderecos_extras` e `unificacoes` do que ficou o que tem origem
  "cadastro nº X", levar a pessoa de contato "Cadastro unificado nº X" e conferir de quem são pedidos e notas pelo CNPJ
  do destinatário (`unificar_clientes` não registra o que moveu).

- Achados do DSG (auditorias de 30/10): ficha pelo link (FichaPublica) itens 1–5 e 8 consertados (redes sociais
  com teclado de letras e "@suaempresa", "Não foi possível abrir" com Tentar de novo, todos os erros da assinatura de
  uma vez, botão "Falar com a MF" no 1º passo, aviso de CEP não encontrado, erro do servidor em frase simples);
  ClienteForm: nome vazio fica vermelho com foco, exemplo do CPF/CNPJ conforme o tipo. Publicado em 30/10 (6e68b1b); falta o teste no ar com um link de verdade.
  Itens 6, 7, 9, 10, 11 da ficha ficam para depois.

- Menus (30/10, pedido dela): lista com ícones de enviar a ficha e ver como o cliente vê; Ficha 360 com 6 abas
  (Máquinas só máquinas e notas; Compras com o que compra) e atalhos iguais no alto; página do cliente com a ficha em
  "Meus dados" (assinada, Conferir e assinar, ou pedir o link) e "Cliente desde" pela data mais antiga
  (`cliente_desde`, 20261101000200); fim da assinatura com "Ver minha página" (20261101000201).
  Auditoria: `.claude/skills/cli/auditoria-2026-10-30-menus.md`.

## Esperando a usuária
- Conferir no ERP no ar os menus publicados em 30/10 (pedido c5348c1c): ícones da lista, Ficha 360 com 6 abas,
  ficha em "Meus dados" da página do cliente e "Ver minha página" depois de assinar.
- Testar no celular um link de ficha cadastral de verdade (redes sociais, CEP errado, assinar vazio) para fechar
  o pedido e3e2cb8c; daqui o site no ar não abre.
- Anexos sem dono (~50 do ZapSign e ~40 arquivos genéricos do Drive): ligar à mão se ela quiser.
- Levantamento da qualidade do cadastro (sem CPF/CNPJ, sem cidade/UF, sem telefone, repetidos): só com números,
  quando ela pedir.
- Cor das redes "outras" (hoje ciano) e se quer destacar o dono da rede.

## Decisões da usuária
- IE baixada sem IE ativa nova: cliente vira não contribuinte (9), IE vazia, IE antiga guardada nas observações.
- Na lista de clientes, o contato rápido é só o WhatsApp; e-mail só como ícone.
- Etiquetas da My Frost (histórico e dono de máquina) não aparecem na lista: a etiqueta da máquina já mostra.
- Redes: milk shake amarelo, açaí roxo, My Frost Sorveterias rosa. A rede vem do marcador "F - …" do Tiny ou da
  categoria Licenciado My Frost.
- Repetidos: unificar só mesmo nome na mesma cidade (pessoa + empresa vale). Ficam separados: só o primeiro nome,
  cidades diferentes, dois CNPJs (filiais) ou dois CPFs diferentes.
- "Compra da máquina" do cadastro acompanha a data das máquinas do cliente (gatilho em equipamentos, no ar).
- Inativar esconde o cliente da lista (inativo_em), sem arquivar; os com "Vendeu a máquina" foram inativados.
- Anexos achados no Gmail/Drive entram como link (tipo 'link', caminho = URL com ?cliente=<código>), porque a
  sessão não sobe arquivo para o Storage; "certos" e "prováveis" (pelo nome) entraram com o ok dela.
- Máquina repetida (base My Frost sem data × nota com data, mesmo modelo): a tela mostra só a com data.
- Marcadores nunca são tirados; unificar, inativar ou corrigir em lote só depois de mostrar a lista e ter o ok.

## Onde está
- Telas: `src/pages/Clientes.tsx`, `src/components/FichaCliente.tsx`, `src/components/clientes/`
  (`BlocoFicha`, `MaquinasCliente` com `EtiquetaMaquina`, `RedeCliente`, `QualidadeClientes`, `PainelFicha`).
- Contato da lista: `src/components/Contato.tsx` (`enxuto`). Fundo da linha: `CrudPage` (`fundoLinha`).
- Colunas da lista: `src/lib/clientesLista.ts` (sem `receita` e `dados_arquivados`); coluna nova usada na tela entra ali.
- Agendamentos: erp-clientes-receita (1 min) e erp-clientes-redes (5 min) checam com `receita_tem_pendente()` e
  `redes_tem_pendente()` (migração 20261101000174).
- Regras: `src/lib/redesClientes.ts` (teste em `src/lib/__tests__/redesClientes.test.ts`).
- Banco: `clientes` (tags, marcadores, ie_situacao, contribuinte_icms), `marcadores`, `tipos_contato`,
  `fornecedores`, `pedidos_checklist`.
- A aba "Máquinas e compras" da ficha (`MaquinasComprasFicha.tsx`) é conduzida pelo MYF; aqui só o visual.

## Próximos passos
1. Levantamento da qualidade do cadastro, só com números, separando MF e My Frost.
2. Se ela pedir: dono da rede em destaque e cor própria para as outras redes.
