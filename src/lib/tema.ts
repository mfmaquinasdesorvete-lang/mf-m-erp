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
  document.documentElement.dataset.theme = t === "escuro" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "escuro" ? "#061226" : "#f4f6f9");
  try { localStorage.setItem(CHAVE, t); } catch { /* navegação privada: só não lembra a escolha */ }
}

export type Destaque = "ciano" | "laranja" | "roxo" | "dourado" | "verde" | "azul";
const CHAVE_COR = "mf-erp-destaque";

export const DESTAQUES: { value: Destaque; label: string; cor: string; par: string }[] = [
  { value: "ciano", label: "Navy + Ciano", cor: "#00d4ff", par: "#0b1f3a" },
  { value: "laranja", label: "Navy + Laranja", cor: "#ff6b00", par: "#102a43" },
  { value: "roxo", label: "Roxo + Rosa", cor: "#ff4fa3", par: "#6c2bd9" },
  { value: "dourado", label: "Dourado da marca", cor: "#e0a65a", par: "#071528" },
  { value: "verde", label: "Navy + Verde", cor: "#2ee59d", par: "#0b1f3a" },
  { value: "azul", label: "Azul clássico", cor: "#60a5fa", par: "#1e3a8a" },
];

export function lerDestaque(): Destaque {
  try {
    const v = localStorage.getItem(CHAVE_COR) as Destaque | null;
    return v && DESTAQUES.some((d) => d.value === v) ? v : "ciano";
  } catch {
    return "ciano";
  }
}

export function aplicarDestaque(d: Destaque) {
  document.documentElement.dataset.accent = d;
  try { localStorage.setItem(CHAVE_COR, d); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/** Aplica a aparência salva no perfil do usuário (vale em qualquer aparelho). */
export function aplicarPreferencias(p: { tema?: string; destaque?: string } | null | undefined) {
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
