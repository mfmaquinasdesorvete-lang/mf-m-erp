/** @type {import('tailwindcss').Config} */
// Os valores do visual (cores, letras, espaços, cantos, bordas, sombras e camadas) ficam em src/design/tokens.js;
// aqui só entram no Tailwind. As variáveis de cada token (--raio-cartao, --texto-sm…) vão para o :root.
import plugin from "tailwindcss/plugin";
import { TAILWIND, variaveis } from "./src/design/tokens.js";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: TAILWIND,
  },
  plugins: [plugin(({ addBase }) => addBase({ ":root": variaveis() }))],
};
