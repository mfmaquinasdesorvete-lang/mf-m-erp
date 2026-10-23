import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { contarCodigo, ehCodigo, horasNoProjeto, linhasDoTexto, type HorasProjeto, type TecnicaCodigo } from "./src/lib/codigoErp";
import { FORMATO_GIT_CHATS, lerEntregasChats, type EntregaChat } from "./src/lib/chatsEntregas";
import { agruparHistorico, contarAlteracoesTelas, dataHoraBR, FORMATO_GIT, FORMATO_GIT_ARQUIVOS, numeroVersao, type AlteracaoTela, type DiaHistorico, type InfoVersao } from "./src/lib/atualizacoes";

// Versão e histórico do ERP (página Atualizações e rodapé do menu), lidos do git na hora de montar o site.
// Sem git (cópia sem o histórico), o site sai sem número de versão e a página mostra só os destaques.
function versaoDoGit(): { versao: InfoVersao | null; historico: DiaHistorico[]; telas: AlteracaoTela[] } {
  try {
    const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    const historico = agruparHistorico(git("log", "--no-merges", `--format=${FORMATO_GIT}`));
    const [hash, data] = git("log", "-1", "--format=%h%x1f%cI").trim().split("\x1f");
    const telas = contarAlteracoesTelas(git("log", "--no-merges", `--format=${FORMATO_GIT_ARQUIVOS}`, "--name-only", "--", "src/pages"));
    return { versao: historico.length && hash && data ? { numero: numeroVersao(historico), hash, data, quando: dataHoraBR(data) } : null, historico, telas };
  } catch {
    return { versao: null, historico: [], telas: [] };
  }
}
const { versao, historico, telas } = versaoDoGit();

// Linhas de código por técnica (Sobre → Código), nos arquivos que estão no git.
function codigoDoGit(): TecnicaCodigo[] {
  try {
    const lista = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter((c) => c && ehCodigo(c));
    return contarCodigo(lista.map((caminho) => {
      try { return { caminho, linhas: linhasDoTexto(readFileSync(caminho, "utf8")) }; } catch { return { caminho, linhas: 0 }; }
    }));
  } catch {
    return [];
  }
}
const codigo = codigoDoGit();

// Horas no projeto (Sobre → Código): pelos horários dos envios do código desde o começo.
function horasDoGit(): HorasProjeto {
  try {
    return horasNoProjeto(execFileSync("git", ["log", "--no-merges", "--format=%aI"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).split("\n"));
  } catch {
    return horasNoProjeto([]);
  }
}
const horas = horasDoGit();

// Entregas de cada chat do Claude nos últimos 30 dias (Sobre → Chats → Central dos chats).
function entregasDosChats(): EntregaChat[] {
  try {
    return lerEntregasChats(execFileSync("git", ["log", "--no-merges", "--since=30 days ago", `--format=${FORMATO_GIT_CHATS}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return [];
  }
}
const entregasChats = entregasDosChats();

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
  define: { __ERP_VERSAO__: JSON.stringify(versao), __ERP_HISTORICO__: JSON.stringify(historico), __ERP_TELAS__: JSON.stringify(telas), __ERP_CODIGO__: JSON.stringify(codigo), __ERP_HORAS__: JSON.stringify(horas), __ERP_ENTREGAS_CHATS__: JSON.stringify(entregasChats) },
  server: { port: 5174 },
  // xmllint (validador de NF-e) abre um worker e um .wasm pelo próprio caminho: não pode ser pré-empacotado
  optimizeDeps: { exclude: ["xmllint-wasm"] },
  worker: { format: "es" },
  build: mode === "demo" ? { outDir: "dist-demo" } : undefined,
}));
