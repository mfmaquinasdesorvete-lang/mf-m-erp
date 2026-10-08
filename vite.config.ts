import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

// `npm run build:demo` gera a prévia com dados de exemplo num único arquivo HTML.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "demo" ? [viteSingleFile()] : [])],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5174 },
  build: mode === "demo" ? { outDir: "dist-demo" } : undefined,
}));
