import { aparenciaAtual, corValida } from "./aparencia";
import { aplicarOrdensDoPerfil } from "./ordemSecoes";

export type Tema = "escuro" | "claro";
const CHAVE = "mf-erp-tema";

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE) === "claro" ? "claro" : "escuro";
  } catch {
    return "escuro";
  }
}

export function aplicarTema(t: Tema) {
  // páginas públicas (área do cliente, página da máquina) ficam sempre claras; a escolha só é guardada
  document.documentElement.dataset.theme = t === "escuro" && document.documentElement.dataset.publica !== "1" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "claro" ? "#f4f6f9" : { marinho: "#061226", grafite: "#101216", app: "#0a0b1a", aurora: "#0d0820" }[lerFundo()]);
  try { localStorage.setItem(CHAVE, t); } catch { /* navegação privada: só não lembra a escolha */ }
}

/** Fundo do tema escuro: "app" liso (padrão desde 24/10, diretrizes de design: sem degradê nem brilho), "aurora"
 *  (tendências 2026 — vidro, degradês rosa/violeta/azul e brilho, padrão de 23/10),
 *  "app" (azul-noite com brilho, o de antes), grafite neutro ou o azul-marinho antigo.
 *  Chave nova (fundo3): todo mundo começa no Aurora e pode voltar ao de antes em Aparência. */
export type Fundo = "aurora" | "app" | "grafite" | "marinho";
// fundo4: escolha feita depois do escuro liso (todo mundo começa no liso; quem quiser volta ao Aurora em Aparência)
const CHAVE_FUNDO = "mf-erp-fundo4";
const FUNDOS: Fundo[] = ["aurora", "app", "grafite", "marinho"];

export function lerFundo(): Fundo {
  try {
    const v = localStorage.getItem(CHAVE_FUNDO) as Fundo | null;
    return v && FUNDOS.includes(v) ? v : "app";
  } catch {
    return "app";
  }
}

export function aplicarFundo(f: Fundo) {
  document.documentElement.dataset.fundo = f;
  try { localStorage.setItem(CHAVE_FUNDO, f); } catch { /* sem armazenamento: vale só nesta visita */ }
  if (document.documentElement.dataset.theme === "dark") aplicarTema("escuro");
}

export type Destaque = "marca" | "ciano" | "laranja" | "roxo" | "dourado" | "verde" | "azul";
const CHAVE_COR = "mf-erp-destaque";

// "marca": a cor da empresa escolhida em Sobre → Design (só aparece na escolha quando ela existe)
export const DESTAQUES: { value: Destaque; label: string; cor: string; par: string }[] = [
  { value: "marca", label: "Cor da empresa", cor: "#0EA5E9", par: "#0b1f3a" },
  { value: "ciano", label: "Navy + Ciano", cor: "#00d4ff", par: "#0b1f3a" },
  { value: "laranja", label: "Navy + Laranja", cor: "#ff6b00", par: "#102a43" },
  { value: "roxo", label: "Roxo + Rosa", cor: "#ff4fa3", par: "#6c2bd9" },
  { value: "dourado", label: "Dourado da marca", cor: "#e0a65a", par: "#071528" },
  { value: "verde", label: "Navy + Verde", cor: "#2ee59d", par: "#0b1f3a" },
  { value: "azul", label: "Azul clássico", cor: "#60a5fa", par: "#1e3a8a" },
];

/** Sem escolha guardada: a cor da empresa, quando ela definiu uma; senão o ciano de sempre. */
const padraoDestaque = (): Destaque => (corValida(aparenciaAtual().cor_marca) ? "marca" : "ciano");

export function lerDestaque(): Destaque {
  try {
    const v = localStorage.getItem(CHAVE_COR) as Destaque | null;
    return v && DESTAQUES.some((d) => d.value === v) ? v : padraoDestaque();
  } catch {
    return padraoDestaque();
  }
}

export function aplicarDestaque(d: Destaque) {
  document.documentElement.dataset.accent = d;
  try { localStorage.setItem(CHAVE_COR, d); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/** Aplica a aparência salva no perfil do usuário (vale em qualquer aparelho). */
export function aplicarPreferencias(p: { tema?: string; destaque?: string; fundo?: string } | null | undefined) {
  aplicarOrdensDoPerfil(p as Record<string, unknown> | null | undefined);
  // fundo4: a escolha feita depois do escuro liso (fundo3 era a do Aurora, fundo2 a do visual de aplicativo)
  const f = (p as { fundo4?: string } | null | undefined)?.fundo4;
  if (f && FUNDOS.includes(f as Fundo)) aplicarFundo(f as Fundo);
  if (p?.tema === "claro" || p?.tema === "escuro") aplicarTema(p.tema);
  if (p?.destaque && DESTAQUES.some((d) => d.value === p.destaque)) aplicarDestaque(p.destaque as Destaque);
}

/** Cor da marca escolhida em Configurações usada de fundo com texto branco (páginas públicas):
 *  escurece só o necessário para o texto ficar legível (contraste 4,5:1). */
export function corFundoLegivel(hex: string | null | undefined, padrao = "#0EA5E9"): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim()) ?? /^#?([0-9a-f]{6})$/i.exec(padrao)!;
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const contraste = () => 1.05 / (0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b) + 0.05);
  for (let i = 0; i < 40 && contraste() < 4.5; i++) [r, g, b] = [r, g, b].map((v) => Math.floor(v * 0.95));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
