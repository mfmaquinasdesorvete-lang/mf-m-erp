// Adiantamento para funcionário: a conta a pagar sai na categoria "adiantamento a funcionários" (fora do DRE) e, na
// prestação de contas, vira os gastos de verdade (combustível, correios…) mais o troco devolvido. Arquivo puro (testado).
import type { LancDre } from "./dre";

export const CATEGORIA_ADIANTAMENTO = "adiantamento a funcionários";
const norm = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
export const ehAdiantamento = (categoria: string | null | undefined) => norm(categoria) === norm(CATEGORIA_ADIANTAMENTO);

export type GastoAdiantamento = { conta_pagar_id: string; data: string; categoria: string; valor: number; descricao?: string | null };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Quanto foi gasto, o troco que deve voltar e, se gastou mais do que levou, quanto a empresa ainda deve a ele. */
export function resumoPrestacao(valorAdiantado: number, gastos: { valor: number }[], trocoDevolvido = 0) {
  const gasto = r2(gastos.reduce((s, g) => s + Number(g.valor || 0), 0));
  const sobra = r2(valorAdiantado - gasto);
  return {
    gasto,
    trocoEsperado: Math.max(0, sobra),
    aReembolsar: Math.max(0, -sobra),
    diferencaTroco: r2(Math.max(0, sobra) - trocoDevolvido),
  };
}

/** Linhas do DRE com os gastos da prestação, no lugar da conta do adiantamento (que fica fora como transferência). */
export function gastosParaDre(gastos: GastoAdiantamento[], contas: { id: string; status: string; unidade_id?: string | null; rateio?: LancDre["rateio"] }[]): LancDre[] {
  const porId = new Map(contas.map((c) => [c.id, c]));
  return gastos.flatMap((g) => {
    const c = porId.get(g.conta_pagar_id);
    if (!c || c.status === "cancelado") return [];
    return [{ tipo: "pagar" as const, categoria: g.categoria, valor: Number(g.valor), valor_pago: Number(g.valor), status: c.status === "pago" ? "pago" : "aberto",
      vencimento: g.data, data_pagamento: c.status === "pago" ? g.data : null, unidade_id: c.unidade_id ?? null, rateio: c.rateio ?? null,
      descricao: g.descricao ?? null, origem: "conta" as const }];
  });
}
