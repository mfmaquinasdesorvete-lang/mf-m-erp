// Tokens do design system: os valores do visual do ERP num lugar só (Sobre → Design mostra todos).
// O tailwind.config.js lê daqui e cria as classes (rounded-cartao, text-sm, z-janela, tracking-rotulo…); cada valor
// também vira uma variável CSS (--raio-cartao, --texto-sm…), então a aparência da empresa pode mudar por cima sem
// mexer nas telas. Regra: tela nova usa estes nomes, não valor solto como rounded-[14px] ou text-[13px].
// (Arquivo .js, não .ts, porque o tailwind.config.js lê direto.)
import paleta from "tailwindcss/colors";

// ---- cores
// As do tema são variáveis CSS (src/index.css): o mesmo nome serve aos temas claro e escuro, em "R G B" para o
// Tailwind aplicar transparência (bg-brand/15). As outras são fixas e não mudam com o tema.
const v = (nome) => `rgb(var(--${nome}) / <alpha-value>)`;
const escala = (cor, passos) => Object.fromEntries(passos.map((p) => [p, v(`${cor}-${p}`)]));
const TONS = [50, 100, 200, 500, 600, 700, 800, 900];
// "fixo-…": as cores padrão do Tailwind que NÃO mudam com o tema (slate, emerald… do tema se invertem no escuro).
// Ficam aqui para nenhuma tela escrever cor solta (#10b981) na classe: bg-fixo-emerald-500, from-fixo-sky-500.
const FIXAS = ["slate", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "zinc", "gray"];

export const COR = {
  // fundos e texto do tema
  surface: v("surface"),
  canvas: v("canvas"),
  campo: v("campo"),
  fg: v("fg"),
  // escalas do tema (verde, âmbar, vermelho, azul… com contraste certo no claro e no escuro)
  slate: escala("slate", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
  emerald: escala("emerald", TONS),
  green: escala("emerald", TONS),
  amber: escala("amber", TONS),
  red: escala("red", TONS),
  sky: escala("sky", TONS),
  blue: escala("sky", TONS),
  indigo: escala("indigo", TONS),
  purple: escala("purple", TONS),
  orange: escala("orange", TONS),
  // cor da área aberta (muda com a tela) e cor da marca (escolhida na aparência)
  modulo: { DEFAULT: v("modulo"), escuro: v("modulo-2"), texto: v("modulo-texto") },
  brand: { DEFAULT: v("brand"), dark: v("brand-dark"), light: v("brand-light"), fg: v("brand-fg"), ice: v("brand-nav") },
  // menu lateral (navy nos dois temas)
  ink: { DEFAULT: v("ink"), soft: v("ink-soft"), line: v("ink-line") },
  // titulo: 5,1:1 sobre o fundo do menu (era #5a7499, 3,8:1 — auditoria de 27/10, regra de contraste WCAG AA)
  nav: { texto: "#c9d5e6", fraco: "#86a0c2", titulo: "#7089ad" },
  fixo: Object.fromEntries(FIXAS.map((n) => [n, paleta[n]])),
  // fundo escuro dos apps do celular (Vendas, Financeiro, Produção, Expedição, Assistência) e da instalação do app
  noite: { fundo: "#07090f", "fundo-2": "#0b0e16", cartao: "#111521", texto: "#e9ecf2", medio: "#b8bfcd", fraco: "#8b93a7", apagado: "#6b7385", tinta: "#04130d" },
  // cores próprias das páginas abertas ao público (Área do cliente e Loja)
  publico: { petroleo: "#066d8c", "petroleo-escuro": "#05506a", marinho: "#0b1f3a", whatsapp: "#25d366", "whatsapp-tinta": "#06301a", sucesso: "#1b7a4b" },
  // fundos sólidos com letra branca: não mudam com o tema (no escuro a escala de cores se inverte)
  solido: { vermelho: "#dc2626", verde: "#047857", ambar: "#b45309", azul: "#1d4ed8", cinza: "#475569" },
  // cor da linha de bordas, divisórias e tabelas
  linha: v("slate-200"),
};

/** Fontes: a da aparência da empresa (Sobre → Design) e, se ela não carregar, as padrão. */
export const FONTE = {
  // texto corrido e campos
  sans: ["var(--fonte-texto)", '"DM Sans Variable"', '"DM Sans"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
  // títulos, números grandes, botões, abas e menu
  display: ["var(--fonte-titulos)", "Poppins", '"DM Sans Variable"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
};

/** Cantos (border-radius). A escala é a do Tailwind; os nomes de uso dizem onde cada um vale. */
export const RAIO = {
  escala: { none: "0px", sm: "0.125rem", DEFAULT: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" },
  uso: {
    chip: "md", // chips de filtro e selos quadrados
    campo: "lg", // campos de preencher
    botao: "lg", // botões
    cartao: "xl", // cartões e caixas
    painel: "2xl", // painéis grandes, janelas e quadros escuros
  },
  /** cada linha da tabela vira um cartão no celular */
  linhaCelular: "14px",
};

/** Letras: tamanho e altura da linha. Só estes 8 tamanhos (2xs é o das etiquetas e chips). */
export const TEXTO = {
  "2xs": ["11px", "1rem"],
  xs: ["0.75rem", "1rem"],
  sm: ["0.875rem", "1.25rem"],
  base: ["1rem", "1.5rem"],
  lg: ["1.125rem", "1.75rem"],
  xl: ["1.25rem", "1.75rem"],
  "2xl": ["1.5rem", "2rem"],
  "3xl": ["1.875rem", "2.25rem"],
};

/** Espaço entre letras das caixas-altas pequenas (rótulos, títulos de painel e selos). */
export const ESPACO_LETRAS = {
  titulo: "0.12em", // título em caixa-alta do painel escuro
  rotulo: "0.14em", // rótulo pequeno em caixa-alta (centro do anel, cabeçalhos)
  selo: "0.16em", // selo/etiqueta em caixa-alta bem pequena
};

/**
 * Espaços: a escala do Tailwind (1 = 4px: p-2 = 8px, gap-4 = 16px…) mais os nomes de uso abaixo.
 * `toque` é a altura mínima de um botão no celular (dedo); `cartao` e `pagina` são os respiros padrão.
 */
export const ESPACO = {
  toque: "42px",
  cartao: "1rem",
  "cartao-largo": "1.25rem",
  pagina: "1rem",
};

/** Bordas: grossura padrão e a cor da linha (a mesma em cartões, tabelas e campos). */
export const BORDA = {
  fina: "1px",
  grossa: "2px",
  destaque: "4px", // faixa colorida da esquerda (linhas da tabela no celular, avisos)
};

/** Sombras (a força acompanha o tema pela variável --sombra). */
export const SOMBRA = {
  card: "0 1px 2px rgb(0 0 0 / var(--sombra)), 0 1px 1px rgb(0 0 0 / calc(var(--sombra) * 0.6))",
  pop: "0 16px 40px -10px rgb(0 0 0 / calc(var(--sombra) * 6))",
};

/** Camadas (z-index): o que fica por cima de quê. */
export const CAMADA = {
  acima: "1", // um item por cima do vizinho (barra, selo)
  gaveta: "40", // menu do celular, listas de busca abertas, botão flutuante
  janela: "50", // janelas (Modal) e menus suspensos
  "sobre-janela": "55", // aviso que abre por cima de uma janela
  flutuante: "60", // notificações, toasts e menus de ação
  alerta: "70", // erro da tela e foto em tela cheia: sempre por cima de tudo
};

/** Variáveis CSS de cada token (o tailwind.config.js põe no :root). */
export function variaveis() {
  /** @type {Record<string, string>} */
  const v = {};
  for (const [k, x] of Object.entries(RAIO.escala)) v[`--raio-${k === "DEFAULT" ? "padrao" : k}`] = x;
  for (const [k, x] of Object.entries(RAIO.uso)) v[`--raio-${k}`] = `var(--raio-${x})`;
  v["--raio-linha-celular"] = RAIO.linhaCelular;
  for (const [k, [tam]] of Object.entries(TEXTO)) v[`--texto-${k}`] = tam;
  for (const [k, x] of Object.entries(ESPACO)) v[`--espaco-${k}`] = x;
  return v;
}

/** Os mesmos tokens no formato do Tailwind (as classes apontam para as variáveis). */
export const TAILWIND = {
  colors: COR,
  borderColor: { DEFAULT: COR.linha },
  fontFamily: FONTE,
  borderRadius: {
    ...Object.fromEntries(Object.keys(RAIO.escala).map((k) => [k, k === "full" ? RAIO.escala.full : `var(--raio-${k === "DEFAULT" ? "padrao" : k})`])),
    ...Object.fromEntries(Object.keys(RAIO.uso).map((k) => [k, `var(--raio-${k})`])),
  },
  fontSize: Object.fromEntries(Object.entries(TEXTO).map(([k, [, linha]]) => [k, [`var(--texto-${k})`, { lineHeight: linha }]])),
  letterSpacing: ESPACO_LETRAS,
  spacing: Object.fromEntries(Object.keys(ESPACO).map((k) => [k, `var(--espaco-${k})`])),
  borderWidth: { DEFAULT: BORDA.fina, 2: BORDA.grossa, 4: BORDA.destaque },
  boxShadow: SOMBRA,
  zIndex: CAMADA,
};
