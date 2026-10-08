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
        brand: { DEFAULT: v("brand"), dark: v("brand-dark"), light: v("brand-light"), fg: v("brand-fg"), ice: v("brand-nav") },
        ink: { DEFAULT: "#071528", soft: "#0f2a4d", line: "#173459" },
        nav: { texto: "#c9d5e6", fraco: "#86a0c2", titulo: "#5a7499" },
      },
      borderColor: { DEFAULT: v("slate-200") },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / var(--sombra)), 0 1px 1px rgb(0 0 0 / calc(var(--sombra) * 0.6))",
        pop: "0 16px 40px -10px rgb(0 0 0 / calc(var(--sombra) * 6))",
      },
    },
  },
  plugins: [],
};
