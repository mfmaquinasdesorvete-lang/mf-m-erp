/** @type {import('tailwindcss').Config} */
// Cores por variáveis CSS (src/index.css): o mesmo nome serve aos temas claro e escuro.
// "nav" é fixo: o menu lateral é navy nos dois temas.
const v = (nome) => `rgb(var(--${nome}) / <alpha-value>)`;
const escala = (cor, passos) => Object.fromEntries(passos.map((p) => [p, v(`${cor}-${p}`)]));
const TONS = [50, 100, 200, 500, 600, 700, 800, 900];

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
