# MEMORY — DSG (ERP Line – Design system)
Atualizado em 27/10/2026.

## Estado agora
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
- Janela de avisos: setas, "Ciente em todos" e ligar/desligar o som (d515e01).
- Cartão do cliente no celular: selos numa fila, contato só em ícones no rodapé, sem marcador repetido (c05d1a2).
- Design System "ERP Line" no Claude (artifact) atualizado com o visual de 24/10 (antes do escuro liso).

## Em andamento
- Nada aberto.

## Esperando a usuária
- Nada.

## Decisões da usuária
- Cor primária: o ciano de sempre (cada pessoa pode trocar em Aparência).
- Escuro padrão liso; Aurora só para quem escolher.
- Marcadores nunca somem do registro; no cartão pode esconder o que já aparece de outro jeito.
- Contato no cartão do cliente: só os ícones de WhatsApp e e-mail.
- Cada pessoa organiza a ordem das seções só para ela (não muda para a equipe).
- Card azul no alto do Início do celular (resumo) e acesso rápido em cartõezinhos coloridos.

## Onde está
- Telas: `src/components/ui.tsx`, `src/index.css`, `src/lib/tema.ts`, `src/components/Layout.tsx`,
  `src/pages/Dashboard.tsx`, `src/components/painel/*` (AcessoRapido, ResumoDono, EquipeOnline),
  `src/components/filtros/BarraFiltros.tsx`, `src/components/CrudPage.tsx`, `src/components/voz/MascoteIA.tsx`.
- Banco: só leitura (acessos_usuarios, usuarios_erp, saldos_bancarios); nenhuma migração deste chat.
- Teste guarda: `src/lib/__tests__/designSystemPadrao.test.ts` (cores soltas ≤ 33, tokens soltos ≤ 7, botões ≤ 356).

## Próximos passos
1. Ligar `Secoes` em outras páginas que a usuária pedir (ex.: Financeiro, Ficha 360).
2. Ligar `Carregando`/`Vazio`/`ErroLista` nas telas que não usam o CrudPage.
3. Atualizar o Design System no Claude com o escuro liso e as peças novas.
4. Baixar os limites do teste guarda conforme as telas forem ficando no padrão.
