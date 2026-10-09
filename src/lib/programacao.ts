// Decisão de pagamento das contas a pagar: "pagar" (aprovada), "agendado" (pagar em tal dia) ou "nao_pagar"
// (segurada, com motivo). Sem decisão = a decidir. Funções puras (sem React, sem Supabase).

export type Decisao = "pagar" | "agendado" | "nao_pagar";
export type ContaDecisao = {
  id: string; valor: number; vencimento: string; status: string; unidade_id?: string | null;
  decisao?: Decisao | null; pagar_em?: string | null; decisao_motivo?: string | null; decisao_por_nome?: string | null; decisao_em?: string | null;
};
export type FiltroDecisao = "todas" | "decidir" | "hoje" | "agendadas" | "nao_pagar";
export type Tom = "ok" | "agenda" | "parada" | "decidir" | "atrasada";

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Em que dia a conta deve sair do caixa: o dia escolhido; sem decisão, o vencimento. */
export const diaDoPagamento = (c: ContaDecisao) => (c.status === "aberto" && c.decisao !== "nao_pagar" && c.pagar_em) || c.vencimento;

/** Aprovadas/agendadas para hoje ou antes, ainda em aberto: o que o financeiro paga hoje. */
export const paraPagarHoje = <T extends ContaDecisao>(l: T[], hoje: string) =>
  l.filter((c) => c.status === "aberto" && (c.decisao === "pagar" || c.decisao === "agendado") && (c.pagar_em ?? "") <= hoje);

export const aDecidir = <T extends ContaDecisao>(l: T[]) => l.filter((c) => c.status === "aberto" && !c.decisao);

export function filtrarDecisao<T extends ContaDecisao>(l: T[], f: FiltroDecisao, hoje: string): T[] {
  if (f === "todas") return l;
  if (f === "decidir") return aDecidir(l);
  if (f === "hoje") return paraPagarHoje(l, hoje);
  if (f === "agendadas") return l.filter((c) => c.status === "aberto" && (c.decisao === "agendado" || c.decisao === "pagar") && (c.pagar_em ?? "") > hoje);
  return l.filter((c) => c.status === "aberto" && c.decisao === "nao_pagar");
}

/** Rótulo curto da decisão para mostrar na lista. */
export function rotuloDecisao(c: ContaDecisao, hoje: string): { texto: string; tom: Tom; dica: string } | null {
  if (c.status !== "aberto") return null;
  const quem = [c.decisao_por_nome, c.decisao_em && `${dm(c.decisao_em.slice(0, 10))}`].filter(Boolean).join(" em ");
  const por = quem ? ` (decidido por ${quem})` : "";
  if (!c.decisao) {
    return c.vencimento < hoje
      ? { texto: "Vencida, a decidir", tom: "atrasada", dica: "Escolha: pagar, agendar ou não pagar" }
      : { texto: "A decidir", tom: "decidir", dica: "Escolha: pagar, agendar ou não pagar" };
  }
  if (c.decisao === "nao_pagar") return { texto: "Não pagar", tom: "parada", dica: `${c.decisao_motivo ?? ""}${por}` };
  const d = c.pagar_em ?? c.vencimento;
  if (d <= hoje) return { texto: "Pagar hoje", tom: "ok", dica: `${c.decisao === "agendado" ? "Agendada" : "Aprovada"} para ${dm(d)}${por}` };
  return { texto: c.decisao === "agendado" ? `Agendada ${dm(d)}` : `Aprovada · ${dm(d)}`, tom: "agenda", dica: `Pagar em ${dm(d)}${por}` };
}

export const COR_TOM: Record<Tom, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  agenda: "bg-sky-100 text-sky-800",
  parada: "bg-slate-200 text-slate-700",
  decidir: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  atrasada: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
};

/** Conta a pagar como entra no fluxo de caixa previsto: na data escolhida; as "não pagar" ficam fora. */
export const paraFluxo = <T extends ContaDecisao>(l: T[]) =>
  l.filter((c) => !(c.status === "aberto" && c.decisao === "nao_pagar")).map((c) => (c.status === "aberto" && c.pagar_em ? { ...c, vencimento: c.pagar_em } : c));

/** Contas do lote agrupadas por unidade (cada grupo sai de uma conta bancária da própria unidade). */
export function gruposPorUnidade<T extends ContaDecisao>(l: T[]) {
  const m = new Map<string, T[]>();
  for (const c of l) {
    const k = c.unidade_id ?? "";
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return [...m.entries()].map(([unidade_id, contas]) => ({ unidade_id: unidade_id || null, contas, total: Math.round(contas.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100 }));
}
