// Filtros das listas de notas fiscais: período (com atalhos), número de/até, valor e UF. Arquivo puro (testado).

export type FiltroNota = { de: string; ate: string; numDe: string; numAte: string; valorMin: string; valorMax: string; uf: string };
export const FILTRO_VAZIO: FiltroNota = { de: "", ate: "", numDe: "", numAte: "", valorMin: "", valorMax: "", uf: "" };

export type DadosNota = { data: string | null | undefined; numero: string | number | null | undefined; valor: number | null | undefined; uf?: string | null };

/** "1.234,56" / "1234,56" / "1234.56" / "R$ 1.234" -> número; vazio ou inválido -> null */
export function valorDigitado(v: string): number | null {
  let s = String(v ?? "").replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const numeroDe = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); return d ? Number(d) : null; };

export function passaFiltro(n: DadosNota, f: FiltroNota): boolean {
  const dia = String(n.data ?? "").slice(0, 10);
  if (f.de && (!dia || dia < f.de)) return false;
  if (f.ate && (!dia || dia > f.ate)) return false;
  const num = numeroDe(n.numero);
  const nDe = numeroDe(f.numDe), nAte = numeroDe(f.numAte);
  // só "de" preenchido: aquela nota; os dois: a faixa
  if (nDe != null && nAte == null && num !== nDe) return false;
  if (nDe != null && nAte != null && (num == null || num < Math.min(nDe, nAte) || num > Math.max(nDe, nAte))) return false;
  if (nDe == null && nAte != null && (num == null || num > nAte)) return false;
  const vMin = valorDigitado(f.valorMin), vMax = valorDigitado(f.valorMax), v = Number(n.valor ?? 0);
  if (vMin != null && v < vMin) return false;
  if (vMax != null && v > vMax) return false;
  if (f.uf && String(n.uf ?? "").toUpperCase() !== f.uf.toUpperCase()) return false;
  return true;
}

export const filtrosEmUso = (f: FiltroNota) =>
  [f.de || f.ate, f.numDe || f.numAte, f.valorMin || f.valorMax, f.uf].filter(Boolean).length;

export type Atalho = "hoje" | "semana" | "7d" | "mes" | "mes_passado" | "ano";
export const ATALHOS: { id: Atalho; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" }, { id: "semana", rotulo: "Esta semana" }, { id: "7d", rotulo: "7 dias" }, { id: "mes", rotulo: "Este mês" },
  { id: "mes_passado", rotulo: "Mês passado" }, { id: "ano", rotulo: "Este ano" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Período do atalho a partir de hoje (AAAA-MM-DD). */
export function periodoDoAtalho(a: Atalho, hoje: string): { de: string; ate: string } {
  const [y, m, d] = hoje.split("-").map(Number);
  if (a === "hoje") return { de: hoje, ate: hoje };
  // semana de segunda a domingo (os vencimentos e entregas dos próximos dias da semana também entram)
  if (a === "semana") {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const seg = d - ((dow + 6) % 7);
    return { de: iso(new Date(Date.UTC(y, m - 1, seg))), ate: iso(new Date(Date.UTC(y, m - 1, seg + 6))) };
  }
  if (a === "7d") return { de: iso(new Date(Date.UTC(y, m - 1, d - 6))), ate: hoje };
  if (a === "mes") return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  if (a === "mes_passado") return { de: iso(new Date(Date.UTC(y, m - 2, 1))), ate: iso(new Date(Date.UTC(y, m - 1, 0))) };
  return { de: `${y}-01-01`, ate: hoje };
}
