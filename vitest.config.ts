// Testes automáticos (npm test). Configuração separada do vite.config.ts: aqui não entra o desvio da
// demonstração (./demo → demo-vazio.ts) nem os plugins do site; só o atalho "@/" para ./src.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
