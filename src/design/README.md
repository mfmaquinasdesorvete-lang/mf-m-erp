# Design system do ERP Line · v1.0 (30/10/2026)

O manual da interface: fundamentos, peças, padrões e regras de contribuição. Parte do inventário real do código (medido em
30/10) e diz o que fazer com as divergências. Dono: chat DSG ("ERP Line – Design system"). As regras de qualidade de
cada tela ficam em `.claude/skills/dsg/regras-design.md`; este arquivo diz **com o quê** montar as telas.

**Como usar:** antes de escrever uma tela, procure aqui a peça; se nenhuma serve, leia "Quando criar uma peça nova"
antes de criar. Quem muda uma peça atualiza a ficha dela aqui no mesmo commit.

---

## 1. Inventário (30/10/2026)

Medido no código da `paineis-no-ar`. Para medir de novo, rode os comandos do teste guarda
(`src/lib/__tests__/designSystemPadrao.test.ts`).

### Peças mais usadas (arquivos que usam)

| Peça | Arquivos | | Peça | Arquivos |
|---|---|---|---|---|
| `Button` | 305 | | `Stat` | 39 |
| `Modal` | 152 | | `Section` | 36 |
| `Field` | 145 | | `Badge` | 36 |
| `Card` | 134 | | `CartaoPainel` | 21 |
| `Carregando` | 108 | | `Vazio` | 14 |
| `chip()` | 82 | | `Indicador` | 13 |
| `PageHeader` | 49 | | `MaisAcoes` | 8 |
| `Table` | 48 | | `ErroLista` | 6 |
| `Tabs` | 46 | | `MenuAcoes` | 4 |

### O que as telas ainda fazem à mão (já existe peça para isso)

| O quê | Quantas vezes | Peça certa |
|---|---|---|
| Botão `<button>` sem peça | ≤ 356 (o teste conta) | `Button`, `.botao-icone`, `.botao-mini`, `chip()` |
| Selo ou etiqueta (`rounded-full px-2 py-0.5 text-xs`) | 124 | `Selo` (nova, ver D1) |
| Rótulo de campo (`mb-1.5 block text-xs font-semibold`) | 90 | `Field` |
| Texto "Carregando…" solto | 87 em 75 arquivos | `Carregando` |
| Texto "Nenhum… encontrado/ainda" solto | 64 | `Vazio` |
| Camada solta (`z-10…z-50`) | 37 | `z-acima`, `z-gaveta`, `z-janela`… |
| Cor solta (`bg-[#…]`) | 31 | tokens de cor |
| Cartão à mão (`rounded-2xl border bg-surface`) | 34 | `Card` / `.cartao` |
| Janela à mão (`fixed inset-0`) | 10 em 8 arquivos | `Modal` (há 2 casos legítimos: aviso do meio da tela e notificações) |
| `window.confirm` / `alert` | 5 | `confirmar()` |
| Canto pela escala (`rounded-xl`) em vez do nome de uso (`rounded-cartao`) | 1.524 contra 47 | nomes de uso (só ao mexer na tela) |

### Peças repetidas ou quase sem uso

- **Cartão de número:** 4 peças para o mesmo papel: `Stat` (39), `CartaoPainel` (21), `Indicador` (13) e
  `NumeroEscuro` (painéis escuros).
- **Tom de cor:** 4 vocabulários. `Stat` usa `bom/atencao/critico/info/neutro`; `Indicador` usa
  `verde/ambar/vermelho/azul…`; o botão usa `tom` por área (`fiscal`, `logistica`…); o painel escuro usa
  `cinza/…` (`TOM_ESCURO`).
- **Menu de mais ações:** 2 peças, `MaisAcoes` (8) e `MenuAcoes` (4).
- **Quase sem uso:** `CLASSE_BOTAO` (0 fora do ui), `TITULO` (1), `TOM` (1), `AcoesNoTopo` (1),
  `fitValor` (2), `Luz` (3, já não desenha nada), `estiloBrilho` (4, já é liso).
- **Nomes misturados:** `Button`, `Card`, `Modal` e `title`/`label`/`icon` (inglês) convivem com `Carregando`,
  `Vazio`, `Indicador` e `titulo`/`rotulo`/`icone` (português).

---

## 2. Fundamentos

Fonte única: `src/design/tokens.js` → Tailwind (classes) e variáveis CSS (`--raio-cartao`, `--texto-sm`…). As cores
do tema ficam em `src/index.css` (claro em `:root`, escuro em `:root[data-theme="dark"]`). A aparência da empresa
(Sobre → Design) troca por cima, sem mexer nas telas.

### 2.1 Cor: cada cor tem um papel

| Papel | Classes | Quando |
|---|---|---|
| Marca | `bg-brand`, `text-brand`, `ring-brand`, `text-brand-fg` (texto sobre a marca) | A ação principal da tela, link, foco, item ativo |
| Superfície | `bg-canvas` (fundo da página), `bg-surface` (cartão), `bg-campo` (campo) | Fundos. Nunca `bg-white` nas telas internas |
| Texto | `text-fg` (principal), `text-slate-600` (apoio), `text-slate-500` (rótulo), `text-slate-400` (desativado ou "—") | Toda letra |
| Linha | `border` (cor padrão `linha`), `border-slate-200` | Bordas, divisórias, tabelas |
| Sucesso | `emerald-*` (`bg-emerald-50 text-emerald-700`) | Pago, autorizado, feito |
| Alerta | `amber-*` | Vence logo, falta conferir |
| Erro | `red-*` (`rose` segue o vermelho do tema) | Atrasado, rejeitado, erro |
| Informação | `sky-*` (`blue` segue o `sky`) | Em andamento, dica |
| Área do menu | `bg-modulo`, `text-modulo` | A cor da área aberta (Vendas, Fiscal…) |
| Fixas | `fixo-*`, `solido-*`, `noite-*`, `publico-*` | Não mudam com o tema: fundo sólido com letra branca, apps escuros do celular, páginas públicas |

**Regras:**
- As escalas `slate/emerald/amber/red/sky/indigo/purple/orange` (e `rose`, `green`, `blue`) **se invertem no
  escuro**: `50` é o fundo sutil, `700–900` é o texto forte. Use par de fundo claro com texto escuro
  (`bg-red-50 text-red-700`) e funciona nos dois temas.
- Para fundo sólido com letra branca use `solido-*` (não muda no escuro).
- A cor nunca é o único sinal: o estado também tem texto ou ícone.
- Sem degradê, brilho ou sombra pesada como enfeite.
- Página do cliente (ficha, proposta, cotação, área do cliente) chama `usePaginaClara()` e fica sempre clara.

### 2.2 Letras

| Token | Tamanho | Uso |
|---|---|---|
| `text-2xs` | 11 px | Só selos e etiquetas curtas |
| `text-xs` | 12 px (13 no celular) | Rótulos, ajuda, metadados |
| `text-sm` | 14 px (15 no celular) | Texto de lista, tabela e formulário (o padrão) |
| `text-base` | 16 px | Campos no celular (o iPhone não dá zoom), texto corrido |
| `text-lg` / `text-xl` | 18 / 20 px | Título de seção / de janela |
| `text-2xl` / `text-3xl` | 24 / 30 px | Título da página / número grande |

- Famílias: `font-display` (Poppins) em títulos, botões, abas e números grandes; `font-sans` (DM Sans) no resto.
- Números em colunas: classe `num` (algarismos alinhados).
- Caixa-alta pequena: `tracking-rotulo` (rótulo), `tracking-selo` (selo), `tracking-titulo` (painel escuro).
- Nunca `text-[13px]`: o teste guarda barra.

### 2.3 Espaço, cantos, bordas, sombras e camadas

| Grupo | Tokens | Regra |
|---|---|---|
| Espaço | escala de 4 px do Tailwind (`gap-2` = 8 px, `p-4` = 16 px); nomes `p-cartao`, `p-cartao-largo`, `px-pagina`, `min-h-toque` (42 px) | Use 1, 2, 3, 4, 6, 8. Dentro de cartão `p-cartao`; entre seções `gap-4`; entre botões `gap-2` |
| Cantos | **nomes de uso:** `rounded-chip`, `rounded-campo`, `rounded-botao`, `rounded-cartao`, `rounded-painel` | Código novo usa o nome de uso. `rounded-xl` antigo só muda quando a tela for mexida |
| Bordas | `border` (1 px), `border-2`, `border-4` (faixa colorida da esquerda) | A cor vem sozinha (`linha`) |
| Sombras | `shadow-card` (cartão), `shadow-pop` (janela, menu, aviso) | Nada de `shadow-xl` nas telas |
| Camadas | `z-acima` 1, `z-gaveta` 40, `z-janela` 50, `z-sobre-janela` 55, `z-flutuante` 60, `z-alerta` 70 | Nunca `z-50` nem `z-[60]` |

### 2.4 Movimento

- `transition` curto (≈150 ms) em hover, foco e toque; entrada de janela e aviso com `animate-[entrar_.3s_ease-out]`.
- Animação só para explicar uma mudança. `prefers-reduced-motion` desliga tudo (em `index.css`).
- Rolagem suave no site; troca de tela e setas do teclado usam `behavior: "instant"`.

---

## 3. Estados

### 3.1 Estados de interação (toda peça clicável)

| Estado | Como aparece | Onde está |
|---|---|---|
| Normal | Cor do papel | — |
| Hover | Fundo um tom acima (`hover:bg-slate-100`) | Só no computador |
| Foco | Contorno de 2 px na cor da marca (`:focus-visible`) | `index.css`, global: não tirar |
| Ativo / selecionado | `chip-ativo`, `aria-pressed`, `aria-current` | `chip()`, abas, menu |
| Desativado | `disabled` + `opacity-50`, `cursor-not-allowed` | Peças de botão |
| Carregando (ação) | `Button carregando` → ícone girando e trava o clique | `Button` |
| Erro (campo) | Borda vermelha + mensagem embaixo + `aria-invalid` | `Field erro`, `CampoMascara` |

### 3.2 Estados de dados (toda lista, painel ou tela que busca dados)

| Estado | Peça | Regra |
|---|---|---|
| Carregando | `Carregando` (`linhas` para o esqueleto) | Nunca o texto "Carregando…" solto |
| Vazio | `Vazio titulo texto acao` | Diz o próximo passo ("Cadastrar o primeiro", "Limpar busca") |
| Erro | `ErroLista erro onTentar` | Sempre com "Tentar de novo" |
| Sucesso | `notify("…")` | Diz o que aconteceu; "Desfazer" quando der |
| Confirmação | `confirmar(texto, { ok, perigo })` | Antes do que não se desfaz (excluir, cancelar nota, pagar) |

---

## 4. Acessibilidade (WCAG 2.2 AA)

- **Contraste:** 4,5:1 no texto, 3:1 em texto grande e ícones que informam. Os pares de token já passam nos dois
  temas; cor solta não tem essa garantia.
- **Toque:** ação principal com `min-h-toque` no celular. Botões de ícone, mini e chips ganham a área invisível de
  ~44 px em tela de toque (`index.css`); não tire o `position` deles.
- **Nome:** todo botão só com ícone tem `aria-label`; ícone decorativo leva `aria-hidden`.
- **Campos:** sempre dentro de `Field` (rótulo ligado, obrigatório com `*` e "(obrigatório)" para o leitor de tela,
  erro em `aria-describedby`).
- **Teclado:** tudo funciona sem mouse. `Modal` prende o foco, fecha no Esc e pergunta antes de perder (`sujo`).
- **Avisos:** erro de tela com `role="alert"`; aviso que chega com `aria-live`.
- **Movimento:** respeitar `prefers-reduced-motion` (já global).

---

## 5. Componentes

Cada ficha diz: **para que serve · entradas · estados · acessibilidade · não use quando**. Nome em itálico =
mudança proposta (seção 8).

### Ações

**`Button`** (`ui.tsx`): o botão do ERP.
- **Entradas:** `variant` (`primary` | `secondary` | `ghost` | `danger`), `tom` (cor da área: `fiscal`,
  `logistica`…), `tamanho="mini"` (dentro de linhas e cartões), `carregando`, e os atributos de `<button>`.
- **Estados:** hover, foco, desativado, carregando (trava o clique).
- **Acessibilidade:** só com ícone, precisa de `aria-label`.
- **Regras:** um `primary` por tela ou janela; o resto `secondary`, `ghost` ou dentro de `MaisAcoes`.
- **Não use quando** a ação é um link de navegação (`Link` com `link-acao`) ou um ícone sozinho na linha
  (`.botao-icone`).

**Classes de botão** (`index.css`):
- `.botao-icone` / `.botao-icone-perigo`: ícone sozinho.
- `.botao-mini`: pequeno sem `Button`.
- `.botao-claro`: sobre fundo colorido.
- `.botao-toque`: encolhe ao tocar.
- `.link-acao` / `.link-discreto`: texto clicável.
- `.linha-clicavel`: linha inteira de lista.

**`MaisAcoes`** (`ui.tsx`): agrupa as ações secundárias do topo num botão "Mais".
- **Entradas:** `children` (os botões).
- **No celular:** abre como lista.
- *Proposta:* juntar com `MenuAcoes` (D6).

**`confirmar` / `pedirTexto`** (`Dialogos.tsx`): perguntas antes de agir.
- `confirmar(texto, { titulo, ok, perigo, voltar })` devolve `Promise<boolean>`.
- `pedirTexto(texto, inicial, { minimo })` devolve o texto ou `null`.
- **Não use** `window.confirm`.

### Campos

**`Field`** (`ui.tsx`): rótulo + campo + ajuda + erro, ligados entre si.
- **Entradas:** `label`, `obrigatorio`, `dica`, `erro`, `className`, `children` (o campo).
- **Estados:** normal, erro (borda vermelha, `aria-invalid`, mensagem).
- **Use sempre** em volta de `input`, `select` e `textarea` com a classe `.input`.

**`CampoMascara`** (`CrudPage.tsx`): CPF/CNPJ, telefone, WhatsApp, CEP, e-mail, UF, IE.
- Formata, confere e mostra atalhos (WhatsApp, ligar, e-mail, buscar CNPJ/CEP).
- O teclado do celular vem de `tecladoDoCampo`.

**`CampoNumero`** (valor em reais e quantidade com vírgula) e **`CampoMes`** (mês e ano).

**`ClienteBusca` / `ProdutoBusca`**: escolher cadastro digitando.
- Setas, Enter, "cadastrar novo".
- São peças **conectadas** (buscam dados): a busca fica declarada no nome.

### Estrutura da página

**`PageHeader`** (`ui.tsx`): título, ícone da área, explicação e ações da página.
- **Entradas:** `title`, `subtitle`, `icon`, `actions`, `compacto`.
- **Regras:** o botão principal fica à direita; no celular o nome curto vem do `title` do botão.
- **`AcoesNoTopo`:** para pôr as ações no topo vindo de uma peça de dentro da página.

**`Card`** (`ui.tsx`) / classe `.cartao`: caixa com borda fina, fundo `surface` e `rounded-cartao`.
- Use a classe quando não precisar do componente.
- *Não criar mais "cartões" próprios* (34 à mão hoje).

**`Section`** (`ui.tsx`): bloco com título e ações.
- `recolhivel` (no celular começa fechado) e `resumo` (o que aparece fechado).

**`Secoes`** (`Secoes.tsx`): página com seções que a pessoa organiza (ordem e meia ou tela toda).
- Cada seção: `{ id, titulo, conteudo, largo, soCelular, soComputador }`.
- `pagina` é a chave salva no perfil.

**`Tabs`** (`ui.tsx`): abas.
- `value`, `onChange`, `options`.
- No celular viram uma lista de escolha de uma linha.

**`Modal`** (`ui.tsx`): janela.
- **Entradas:** `open`, `onClose`, `title`, `wide`, `sujo` (pergunta antes de fechar com algo digitado).
- **Comportamento:** prende o foco, fecha no Esc, empilha (uma por cima da outra) e vira tela cheia no celular.
- *Proposta:* título sempre com o que é ("Nova peça", não "Novo cadastro") (D5).

### Dados

**`Table`** (`ui.tsx`): tabela que vira cartões no celular.
- **Entradas:** `head`, `children`, `empty`, `carregando`, `limite`.
- **Celular:** cada `td` com `data-label` vira "rótulo → valor"; `cel-titulo` marca o título do cartão.

**Cartão de número.**
- **Hoje:** `Stat` (tom `bom/atencao/critico/info/neutro`, clicável), `Indicador` (cor por nome), `CartaoPainel`
  (com comparação de período) e `NumeroEscuro` (painel escuro).
- *Proposta:* dois só, `Stat` (claro, com `comparacao` opcional) e `NumeroEscuro` (D3).

**`Badge`** (`ui.tsx`): selo de **situação conhecida** (`pago`, `autorizada`, `atrasado`…), com a cor e o nome
de um mapa.
- `value`, `forte`.
- Situação desconhecida aparece como texto cinza.
- *Proposta:* `Selo` genérico com `tom` para o resto (D1).

### Listas e filtros

**`CrudPage`** (`CrudPage.tsx`): a página de cadastro inteira (lista, busca, filtros, exportar, lote, formulário
em passos ou abas).
- Recebe `campos` (`CampoForm`: `name`, `label`, `type`, `mask`, `required`, `options`, `span`, `secao`),
  `filtros`, `ordens`, `acoesLote`.
- Já traz carregando, vazio, erro, "Sair sem salvar?" e "Mostrar mais".
- *Proposta:* marcar obrigatório e mostrar o erro no campo (D2).

**`BarraFiltros`** (`filtros/BarraFiltros.tsx`): busca, período e filtros numa linha (no celular, só ícones).
- **Entradas:** `busca`, `onBusca`, `periodo`, `onPeriodo`, `filtros`, `nFiltros`, `onLimpar`, `direita`.
- **Junto:** `ChipsSituacao` (contagem por situação), `RodapeLista` (contagem, total e ações em lote) e
  `useSelecao`.

### Retorno

- **`Carregando`** (`linhas`): esqueleto enquanto carrega.
- **`Vazio`** (`titulo`, `texto`, `acao`).
- **`ErroLista`** (`erro`, `onTentar`).
- **`notify` / `notifyError`** (`lib/notify`): aviso depois da ação.

### Contato e cadastro

**`Contato`**, **`ContatoBotoes`**, **`NomeCadastro`**, **`Iniciais`**, **`CartaoCadastro`**, **`ComAvatar`**
(`Contato.tsx`): nome, avatar e botões de WhatsApp, telefone e e-mail do mesmo jeito em todo cadastro.

---

## 6. Padrões de uso

| Padrão | Como montar |
|---|---|
| **Cadastro** | `CrudPage` com `campos`. Longo (mais de ~10 campos) → `passos` ou `secao`. Obrigatório com `required`. Aviso de repetido antes de salvar (ex.: "Já cadastrados parecidos") |
| **Lista com busca** | `PageHeader` + `BarraFiltros` + `Table` (ou cartões) + `RodapeLista`. Estados com `Carregando` / `Vazio` / `ErroLista` |
| **Painel de área** | `CabecalhoPainel` + `Secoes` (a pessoa organiza) + `Stat` + `ListaAtencao` (o que pede atenção vem primeiro) |
| **Ação que não se desfaz** | `confirmar(texto, { perigo: true, ok: "Excluir" })` → `Button carregando` → `notify` |
| **Erro de formulário** | Mensagem no campo (`Field erro`), foco no primeiro campo com erro e, se o erro estiver fora da tela, aviso com o nome do campo |
| **Página do cliente** | `usePaginaClara()`, cartão branco, uma ação principal, botão "Falar com a MF", sem menu do ERP |
| **Celular** | Tabela vira cartão; ações secundárias no "Mais"; busca e filtros numa linha; nada rola para o lado |

---

## 7. Quando criar uma peça nova (e quando não)

Componentizar demais também atrapalha: mais arquivos, mais propriedades, comportamento escondido. Uma peça nova só
entra se passar nas 5 perguntas:

1. **Repete?** O mesmo papel aparece em 3 telas ou mais (ou vai aparecer já).
2. **Propósito único?** Dá para dizer o que ela faz numa frase, sem "e também".
3. **Entradas claras?** Até ~6 propriedades; sem propriedade que muda o comportamento inteiro (aí são duas peças).
4. **Nada escondido?** Peça de visual não busca dados, não grava e não muda a URL. Peça que busca dados diz isso no
   nome (`ClienteBusca`) e na ficha.
5. **Acessível e com estados?** Tem foco, nome para leitor de tela e os estados da seção 3 que se aplicam.

**Não vire peça:**
- um arranjo usado numa tela só;
- um "atalho" que só renomeia classes (o `Card` é o limite: não criar outros iguais);
- uma variação que cabe numa propriedade da peça que já existe.

**Prefira** classe em `index.css` (`.cartao`, `.chip`) quando é só visual, e componente quando há comportamento ou
acessibilidade a garantir.

---

## 8. Nomes consistentes

| Regra | Exemplo |
|---|---|
| Peça nova em português, substantivo do que ela é | `Selo`, `CampoNumero`, `BarraFiltros` |
| Peças antigas em inglês (`Button`, `Card`, `Modal`, `Table`, `Tabs`, `Field`, `Badge`) **ficam** | Renomear 300 arquivos custa mais do que ajuda |
| Propriedades de texto em português nas peças novas: `titulo`, `rotulo`, `texto`, `dica`, `valor`, `icone` | — |
| Eventos seguem o React: `onX` | `onChange`, `onTentar`, `onLimpar` |
| Booleano é adjetivo ou estado | `carregando`, `obrigatorio`, `recolhivel`, `sujo`, `ativo` |
| **Um vocabulário só de tom:** `marca`, `sucesso`, `alerta`, `erro`, `info`, `neutro` | `Stat` (`bom/atencao/critico`) e `Indicador` (`verde/ambar…`) passam a aceitar estes, mantendo os antigos como apelido até migrar |
| Cor por área (`modulo`) é outra coisa: `tom` do botão por área continua (`fiscal`, `logistica`…) | — |
| Classe CSS de peça: `.substantivo-variacao` | `.botao-icone-perigo`, `.chip-ativo` |
| Token: nome de uso, não de valor | `rounded-cartao`, `z-janela`, `p-cartao` |

---

## 9. Divergências priorizadas

Por impacto na consistência e na manutenção × esforço. "Já" = próxima rodada do DSG; as outras entram aos poucos,
na tela que for mexida.

| # | Divergência | Impacto | Esforço | Proposta |
|---|---|---|---|---|
| D1 | **124 selos à mão**; o `Badge` só aceita situações do mapa | Alto: cada tela inventa cor e tamanho; contraste sem garantia | Médio | Peça `Selo` (`tom`, `icone`, `children`) que o `Badge` usa por dentro; migrar ao mexer; teste guarda |
| D2 | ~~Obrigatório sem `*` e erro sem campo vermelho no `CrudPage`~~ **feito em 30/10** (A1–A5) | Alto: todos os cadastros | Baixo | Passar `obrigatorio` e `erro` ao `Field`; foco no primeiro com erro; um jeito só de avisar |
| D3 | **4 cartões de número** (`Stat`, `Indicador`, `CartaoPainel`, `NumeroEscuro`) | Alto: mudar o visual pede 4 consertos | Médio | `Stat` ganha `comparacao` e o tom único; `Indicador` e `CartaoPainel` passam a desenhar com `Stat` (mesmo nome por fora até migrar) |
| D4 | **87 "Carregando…" e 62 "Nenhum…" soltos** | Médio: tela sem próximo passo nem erro | Baixo por tela | Trocar pelas peças; teste guarda com limite que só desce |
| D5 | ~~Título genérico da janela~~ **feito em 30/10** (`tituloCadastro`, prop `singular`) | Médio | Baixo | `CrudPage` recebe o nome no singular e monta "Nova peça" / "Editar · Nome" |
| D6 | **`MaisAcoes` e `MenuAcoes`** | Médio | Baixo | Um só (`MaisAcoes` com `itens` opcional); o outro vira apelido |
| D7 | **4 vocabulários de tom** | Médio | Médio | Seção 8; apelidos antigos aceitos |
| D8 | **90 rótulos de campo à mão** | Médio: sem `*`, sem erro ligado | Médio | `Field` ao mexer na tela |
| D9 | **Peças mortas**: `Luz`, `estiloBrilho`, `fitValor`, `CLASSE_BOTAO`, `TITULO`, `TOM` | Baixo: confunde quem lê | Baixo | Tirar o que não tem uso; trocar `Luz` e `estiloBrilho` (já não fazem nada) nas 7 telas |
| D10 | **37 camadas soltas, 31 cores soltas, 5 `window.confirm`, 10 janelas à mão** | Baixo a médio | Baixo por item | Trocar ao mexer; teste guarda já cobre cores e camadas `z-[…]` |
| D11 | **`rounded-xl` em vez de `rounded-cartao`** (1.524) | Baixo: visual igual hoje | Alto | Só em código novo e na tela que for mexida; sem troca em massa |

**Validação da proposta:**
- **Arquitetura:** nada muda de lugar. As peças ficam em `ui.tsx` e afins, os tokens em `tokens.js`. Migração aos
  poucos, sem quebrar telas: nome antigo vira apelido.
- **Acessibilidade:** D1, D2 e D8 melhoram (contraste garantido, `*` e erro ligados ao campo).
- **Manutenção:** de 4 cartões para 2, de 2 menus para 1, de 4 tons para 1. Nenhuma peça nova além do `Selo`.

---

## 10. Governança e contribuição

**Dono:** chat DSG. Os outros chats usam as peças; mudança numa peça comum passa pelo DSG.

**Para mudar ou criar uma peça:**
1. Procurar aqui e em `ui.tsx`. Se uma peça serve com uma propriedade nova, prefira isso.
2. Passar nas 5 perguntas da seção 7.
3. Escrever a peça com estados e acessibilidade; atualizar a ficha na seção 5 no mesmo commit.
4. Conferir no claro, no escuro, no celular (390 e 320 px) e só com o teclado.
5. Rodar `npx vitest run` (o teste guarda incluído) e a conferência de 8 itens de `regras-design.md`.
6. Peça que sai: marcar `@deprecated` no código com o substituto, migrar e só então apagar.

**Teste guarda** (`src/lib/__tests__/designSystemPadrao.test.ts`): conta o que é feito fora das peças. Os limites
**só descem**: quem tira uma ocorrência baixa o número no mesmo commit. Hoje cobre:
- cor solta;
- canto, letra e camada com valor solto;
- botão feito à mão;
- texto "Carregando…" e "Nenhum…" soltos;
- selo feito à mão;
- `window.confirm` e `alert`.

**Versão do design system:**
- **Maior** (2.0): troca que muda telas sem elas mudarem o código (ex.: novo tom padrão).
- **Média** (1.1): peça ou token novo.
- **Pequena** (1.0.1): conserto.

A versão e a data ficam no título deste arquivo. O histórico é o próprio git deste arquivo e de `tokens.js`.
