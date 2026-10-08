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
