# MEMORY — CLI (ERP Line – Cadastro de clientes)
Atualizado em 26/10/2026.

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
- Repetidos pelo nome unificados com o ok dela: 58 grupos (pessoa CPF + empresa CNPJ, ou um sem documento), fica o
  cadastro com CNPJ (dados, 26/10). "Compra da máquina" preenchida com a data da máquina mais recente onde estava
  vazia (dados, 26/10).

## Em andamento
- Regra no banco para preencher "Compra da máquina" sozinha (migração 20261101000171): espera o "Pode publicar".

## Esperando a usuária
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
- "Compra da máquina" do cadastro acompanha a data das máquinas do cliente.
- Marcadores nunca são tirados; unificar, inativar ou corrigir em lote só depois de mostrar a lista e ter o ok.

## Onde está
- Telas: `src/pages/Clientes.tsx`, `src/components/FichaCliente.tsx`, `src/components/clientes/`
  (`BlocoFicha`, `MaquinasCliente` com `EtiquetaMaquina`, `RedeCliente`, `QualidadeClientes`, `PainelFicha`).
- Contato da lista: `src/components/Contato.tsx` (`enxuto`). Fundo da linha: `CrudPage` (`fundoLinha`).
- Regras: `src/lib/redesClientes.ts` (teste em `src/lib/__tests__/redesClientes.test.ts`).
- Banco: `clientes` (tags, marcadores, ie_situacao, contribuinte_icms), `marcadores`, `tipos_contato`,
  `fornecedores`, `pedidos_checklist`.
- A aba "Máquinas e compras" da ficha (`MaquinasComprasFicha.tsx`) é conduzida pelo MYF; aqui só o visual.

## Próximos passos
1. Levantamento da qualidade do cadastro, só com números, separando MF e My Frost.
2. Se ela pedir: dono da rede em destaque e cor própria para as outras redes.
