import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import { execFileSync } from "node:child_process";
import { agruparHistorico, dataHoraBR, FORMATO_GIT, numeroVersao, type DiaHistorico, type InfoVersao } from "./src/lib/atualizacoes";

// Versão e histórico do ERP (página Atualizações e rodapé do menu), lidos do git na hora de montar o site.
// Sem git (cópia sem o histórico), o site sai sem número de versão e a página mostra só os destaques.
function versaoDoGit(): { versao: InfoVersao | null; historico: DiaHistorico[] } {
  try {
    const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    const historico = agruparHistorico(git("log", "--no-merges", `--format=${FORMATO_GIT}`));
    const [hash, data] = git("log", "-1", "--format=%h%x1f%cI").trim().split("\x1f");
    return { versao: historico.length && hash && data ? { numero: numeroVersao(historico), hash, data, quando: dataHoraBR(data) } : null, historico };
  } catch {
    return { versao: null, historico: [] };
  }
}
const { versao, historico } = versaoDoGit();

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
  define: { __ERP_VERSAO__: JSON.stringify(versao), __ERP_HISTORICO__: JSON.stringify(historico) },
  server: { port: 5174 },
  build: mode === "demo" ? { outDir: "dist-demo" } : undefined,
}));
