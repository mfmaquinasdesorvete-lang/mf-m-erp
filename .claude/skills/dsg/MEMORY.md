# MEMORY — DSG (ERP Line – Design system)
Atualizado em 27/10/2026.

## Estado agora
Desde 27/10 este chat também é o **auditor de design** do ERP: regras em `regras-design.md` (12 regras + gestão +
conferência de cada tela) e auditorias datadas (`auditoria-2026-10-27.md`).
Visual seguindo as diretrizes de design da usuária (24/10): ação principal clara, cartões lisos com borda fina, sem
degradê nem brilho decorativo, escuro liso como padrão. Celular repaginado no jeito do modelo enviado por ela.

## No ar
- Tokens num lugar só (`src/design/tokens.js`) e teste que barra cor e token soltos e botão feito à mão.
- Escuro liso padrão (chave `fundo4`); Aurora, Grafite e Marinho continuam em Aparência (3be6035).
- Sem degradê decorativo em ~50 telas; cartões de número lisos (`estiloBrilho` liso, `Luz` desligada) (18a8f1f, 3be6035).
- Estados padrão: peças `Carregando`, `Vazio`, `ErroLista`; já ligados no CrudPage e na Table (18a8f1f).
- Busca padrão (`BarraFiltros`) numa linha no celular; `AcoesNoTopo` põe as ações ao lado do título (c8a6f9c, 0484936).
- Início do celular: topo limpo, resumo azul liso com 4 números, acesso rápido em cartõezinhos (com Técnicos),
  barra de baixo nas cores do tema, Ajuda IA com o robozinho, botão redondo de gasto (master).
- Resumo do dono no Início de um usuário do financeiro (`ResumoDono`, `veResumoDono` pelo nome).
- Equipe online no Início da conta master (`EquipeOnline`, usa acessos_usuarios).
- Organizar as seções arrastando (peça `Secoes`, ordem no perfil "ordem:<página>"): Início e os 10 painéis das áreas.
  A master pode "Usar para toda a equipe" (configuracoes.aparencia.ordem_secoes); vale: a da pessoa > a da equipe > a do código.
- Janela de avisos: setas, "Ciente em todos" e ligar/desligar o som (d515e01).
- Cartão do cliente no celular: selos numa fila, contato só em ícones no rodapé, sem marcador repetido (c05d1a2).
- Design System "ERP Line" no Claude (artifact) atualizado com o visual de 24/10 (antes do escuro liso).

- Topo da Venda de Peças compacto no celular: Relatório, Exportar e quadro/lista no "Mais", "Novo" curto, Pagamento
  numa fila só, "Marcar todos" só com algo marcado, "Limpar" some sem busca nem filtro (27/10, no ar 28/10).

- Nota fiscal: caixa da rejeição e da GNRE legíveis no escuro; tons rose e 950 seguem o tema (28/10, no ar).

- Clean Code (28/10): avisos (`JanelaAviso`, `ItemHistorico`, `acaoDoHistorico`, `dicaDoSom`, `linhaRemetente`) e
  `CampoMascara` (`atalhoDoCampo`, `tecladoDoCampo`) separados, com teste; mesma tela (montado).

- Largura no Organizar (29/10): cada seção com meia tela ou tela toda no computador; vai na lista da ordem
  ("id|largo" / "id|meia", só quando difere do código), então vale no perfil e no "Usar para toda a equipe".

- Páginas do cliente (ficha, proposta, cotação, área do cliente) sempre claras pela peça `usePaginaClara` (marca
  "publica"): a ficha abria com as cores do escuro quando quem abria estava logado no tema escuro (30/10).

- Área de toque no celular (botões de ícone, mini e chips) e rolagem suave no site, com troca de tela e setas
  do teclado instantâneas (30/10).

- Manual do design system `src/design/README.md` v1.0 (30/10): inventário, fundamentos, estados, acessibilidade,
  fichas das peças, padrões, nomes, quando criar peça, divergências D1–D11 e governança. Teste guarda com 3 limites
  novos (estados soltos 87/64, selos à mão 124, window.confirm 5).

- Cadastros (CrudPage, 30/10): obrigatório com `*`, erro no campo com foco, um jeito só de avisar (noValidate),
  título "Nova peça" / "Editar · Nome" (`tituloCadastro`), vazio com "Limpar busca e filtros" (Table aceita o vazio).

- GSAP (30/10): `Animar.tsx` com `Contagem` (números sobem até o valor) e `useEntrada` (blocos em sequência nas
  Secoes); baixa à parte quando a tela fica livre; desliga com reduzir movimento. Cuidado: o React monta duas vezes
  em modo de desenvolvimento, e a limpeza da animação precisa deixar a próxima montagem animar.

- Barra de filtros nova (31/10, aprovada na proposta YBkemVWvgNHmoW1XEGfJxV): Visão (prontas com contagem + salvas no
  perfil "visoes:<página>"), busca que sugere filtros, período, Filtros em painel lateral/de baixo, pílulas e resultado.
  Ligada em Notas emitidas, Vendas (lista) e OS; as outras 37 telas ganharam só o painel novo e passam às partes novas aos poucos.

- Barra nova no site todo (31/10): CrudPage (todos os cadastros: filtros no painel com rótulo, pílulas, busca que
  sugere opções, visões salvas "cadastro-<tabela>") e as 37 telas com BarraFiltros. Onde os cartões de cima já escolhem a
  situação (Garantias, Códigos EAN, Acompanhamento de compras), sem Visão repetida: a escolha vira pílula.

- Material 3 (02/11, pedido "analise m3.material.io e aprimore"): camada de estado única (película 8/12/16% em
  `.camada-estado` e nas peças de botão, sem hover:bg nas peças) e tokens de movimento (MOVIMENTO, ease-padrao). O site
  m3.material.io não abre neste ambiente (rede); valores tirados do pacote oficial @material/web 2.2.0. Manual v1.1.

## Em andamento
- Rodada de fechamento: testar a janela de avisos com um aviso de verdade (pedido aec3838c).

## Esperando a usuária
- (06/11) Os 9 pedidos só visuais foram para "feito" com a aprovação dela, pela regra de 05/11 (teste na demonstração).
- Avisos do meio da tela (aec3838c): setas, "Ciente em todos" e som; não abre aviso de chat na demonstração.
- Visual da nota rejeitada (e47f15ea): tela de nota fiscal, fica com ela.

## Decisões da usuária
- Cor primária: o ciano de sempre (cada pessoa pode trocar em Aparência).
- Escuro padrão liso; Aurora só para quem escolher.
- Marcadores nunca somem do registro; no cartão pode esconder o que já aparece de outro jeito.
- Contato no cartão do cliente: só os ícones de WhatsApp e e-mail.
- Ordem das seções: cada pessoa arruma a sua; a master pode passar a dela para toda a equipe.
- O texto de regras de design dela (27/10) é a regra oficial; este chat audita o ERP por ele.
- Card azul no alto do Início do celular (resumo) e acesso rápido em cartõezinhos coloridos.

## Onde está
- Telas: `src/components/ui.tsx`, `src/index.css`, `src/lib/tema.ts`, `src/components/Layout.tsx`,
  `src/pages/Dashboard.tsx`, `src/components/painel/*` (AcessoRapido, ResumoDono, EquipeOnline),
  `src/components/filtros/BarraFiltros.tsx`, `src/components/CrudPage.tsx`, `src/components/voz/MascoteIA.tsx`.
- Banco: só leitura (acessos_usuarios, usuarios_erp, saldos_bancarios); nenhuma migração deste chat.
- Teste guarda: `src/lib/__tests__/designSystemPadrao.test.ts` (cores soltas ≤ 33, tokens soltos ≤ 7, botões ≤ 356).

## Próximos passos
1. Seguir a ordem da auditoria de 27/10: estados (86 "Carregando…", 20 "Nenhum…"), área de toque, trava de clique.
2. (feito 27/10) Letras do celular: texto 14 px e rótulos 12 px.
3. Ligar `Secoes` em outras páginas que a usuária pedir (ex.: Financeiro, Ficha 360).
3. Atualizar o Design System no Claude com o escuro liso e as peças novas.
4. Baixar os limites do teste guarda conforme as telas forem ficando no padrão.
