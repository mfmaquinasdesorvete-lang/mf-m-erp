export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Número digitado: "1.250,90", "285,72", "285.72", "1.250" (milhar), "R$ 10", "65%". Vazio ou inválido = null. */
export function numeroBR(t: string | number | null | undefined): number | null {
  if (typeof t === "number") return Number.isFinite(t) ? t : null;
  const s = String(t ?? "").trim().replace(/\s|R\$|%/g, "");
  if (!s) return null;
  const v = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", "."))
    : Number(/^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s);
  return Number.isFinite(v) ? v : null;
}

/** Número para mostrar num campo de digitação: 12.5 → "12,5"; 1250 → "1250" (sem milhar, para editar). */
export const numeroParaCampo = (v: number | string | null | undefined, casas = 4) => {
  const n = typeof v === "number" ? v : numeroBR(v);
  if (n == null || !Number.isFinite(n)) return "";
  return String(Math.round(n * 10 ** casas) / 10 ** casas).replace(".", ",");
};

export const dataBR = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = v.length === 10 ? new Date(v + "T12:00:00") : new Date(v);
  return d.toLocaleDateString("pt-BR");
};

/** Hoje no horário de Brasília (AAAA-MM-DD). Em UTC o dia já virava às 21h: baixa, recibo e "vencida" saíam com o dia seguinte. */
export const hoje = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** "17/10/2026 18:23" (hora do aparelho) */
export const dataHoraBR = (v: string | null | undefined) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
};

/** Hoje (Brasília) mais `dias`; com `base`, a partir dela. */
export const somarDias = (dias: number, base?: Date) =>
  new Date((base ? base.getTime() : Date.parse(`${hoje()}T12:00:00Z`)) + dias * 864e5).toISOString().slice(0, 10);

export const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function docFormat(v: string | null | undefined) {
  const d = digitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v ?? "";
}

/** Link wa.me com mensagem pronta. Números sem DDI recebem +55. */
export function whatsappLink(numero: string | null | undefined, mensagem: string) {
  let n = digitos(numero);
  if (n && n.length <= 11) n = "55" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
}

/** Conta em aberto com vencimento passado é exibida como vencida. */
export const situacaoConta = (status: string, vencimento: string) =>
  status === "aberto" && vencimento < hoje() ? "vencido" : status;

/** Rótulo nas listas de escolha: código, nome fantasia e razão social. */
export function rotuloCliente(c: { codigo?: number | null; nome: string; nome_fantasia?: string | null }) {
  const f = c.nome_fantasia?.trim();
  return `${c.codigo ? c.codigo + " · " : ""}${f && f.toLowerCase() !== c.nome.toLowerCase() ? `${f} (${c.nome})` : c.nome}`;
}

/** Singular ou plural pela quantidade: `${n} ${pl(n, "pedido", "pedidos")}` (no lugar de "pedido(s)"). Zero vai no plural. */
export const pl = (n: unknown, singular: string, plural: string) => (Math.abs(Number(n)) === 1 ? singular : plural);
