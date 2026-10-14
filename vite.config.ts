import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

// `npm run build:demo` gera a prévia com dados de exemplo num único arquivo HTML.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "demo" ? [viteSingleFile()] : [])],
  resolve: {
    alias: [
      // fora da demonstração, os dados de exemplo (demo.ts) não vão para o site
      ...(mode === "demo" ? [] : [{ find: /^(\.\/demo|@\/lib\/demo)$/, replacement: path.resolve(__dirname, "./src/lib/demo-vazio.ts") }]),
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
  server: { port: 5174 },
  build: mode === "demo" ? { outDir: "dist-demo" } : undefined,
}));
