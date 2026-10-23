/** @type {import('tailwindcss').Config} */
import paleta from "tailwindcss/colors";
// Cores por variáveis CSS (src/index.css): o mesmo nome serve aos temas claro e escuro.
// "nav" é fixo: o menu lateral é navy nos dois temas.
const v = (nome) => `rgb(var(--${nome}) / <alpha-value>)`;
const escala = (cor, passos) => Object.fromEntries(passos.map((p) => [p, v(`${cor}-${p}`)]));
const TONS = [50, 100, 200, 500, 600, 700, 800, 900];
// "fixo-…": as cores padrão do Tailwind que NÃO mudam com o tema (as de cima, como slate e emerald, se invertem no
// escuro). Ficam aqui para nenhuma tela escrever cor solta (#10b981) na classe: bg-fixo-emerald-500, from-fixo-sky-500.
const FIXAS = ["slate", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "zinc", "gray"];
const fixo = Object.fromEntries(FIXAS.map((n) => [n, paleta[n]]));

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: v("surface"),
        canvas: v("canvas"),
        campo: v("campo"),
        fg: v("fg"),
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
        modulo: { DEFAULT: v("modulo"), escuro: v("modulo-2"), texto: v("modulo-texto") },
        brand: { DEFAULT: v("brand"), dark: v("brand-dark"), light: v("brand-light"), fg: v("brand-fg"), ice: v("brand-nav") },
        ink: { DEFAULT: v("ink"), soft: v("ink-soft"), line: v("ink-line") },
        nav: { texto: "#c9d5e6", fraco: "#86a0c2", titulo: "#5a7499" },
        // fundos sólidos com letra branca: não mudam com o tema (no escuro a escala de cores se inverte)
        fixo,
        // fundo escuro dos apps do celular (Vendas, Financeiro, Produção, Expedição, Assistência) e da instalação do app
        noite: { fundo: "#07090f", "fundo-2": "#0b0e16", cartao: "#111521", texto: "#e9ecf2", medio: "#b8bfcd", fraco: "#8b93a7", apagado: "#6b7385", tinta: "#04130d" },
        // cores próprias das páginas abertas ao público (Área do cliente e Loja)
        publico: { petroleo: "#066d8c", "petroleo-escuro": "#05506a", marinho: "#0b1f3a", whatsapp: "#25d366", "whatsapp-tinta": "#06301a", sucesso: "#1b7a4b" },
        solido: { vermelho: "#dc2626", verde: "#047857", ambar: "#b45309", azul: "#1d4ed8", cinza: "#475569" },
      },
      borderColor: { DEFAULT: v("slate-200") },
      fontFamily: {
        // a fonte vem da aparência da empresa (Sobre → Design); o padrão (DM Sans e Poppins) fica em index.css
        sans: ["var(--fonte-texto)", '"DM Sans Variable"', '"DM Sans"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        // títulos, números grandes, botões, abas e menu (design system: Poppins + DM Sans)
        display: ["var(--fonte-titulos)", "Poppins", '"DM Sans Variable"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      // escala de letra (design system): 2xs 11px (etiquetas e chips), xs, sm, base, lg, xl, 2xl e 3xl — sem tamanhos soltos
      fontSize: { "2xs": "11px" },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / var(--sombra)), 0 1px 1px rgb(0 0 0 / calc(var(--sombra) * 0.6))",
        pop: "0 16px 40px -10px rgb(0 0 0 / calc(var(--sombra) * 6))",
      },
    },
  },
  plugins: [],
};
