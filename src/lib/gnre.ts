// GNRE da NF-e para outro estado (DIFAL do consumidor final, FCP do destino e ICMS-ST): os valores da nota, a situação
// da guia (a gerar no portal, gerada, paga, cancelada) e a conferência do código de barras. O banco lança a conta a
// pagar sozinho quando a nota sai autorizada (gnre_lancar_interna); a tela mostra e completa a guia.

export type GuiaGnre = {
  id: string; nota_fiscal_id: string; uf: string; nf_numero: string | null;
  valor_difal: number; valor_fcp: number; valor_st: number; valor_total: number; vencimento: string;
  conta_pagar_id: string | null; situacao: "a_gerar" | "gerada" | "cancelada"; codigo_barras: string | null; observacao: string | null;
  conta?: { id: string; status: string; data_pagamento: string | null } | null;
};

/** Portal nacional onde a guia é gerada (UF de destino, receita, valor e a NF-e). */
export const PORTAL_GNRE = "https://www.gnre.pe.gov.br";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** DIFAL, FCP e ICMS-ST (com o FCP-ST) somados dos itens da nota. */
export function valoresGnre(itens: Record<string, unknown>[] | null | undefined) {
  const s = (f: (i: Record<string, unknown>) => number) => r2((itens ?? []).reduce((t, i) => t + f(i), 0));
  const difal = s((i) => num(i.icms_valor_uf_destino));
  const fcp = s((i) => num(i.fcp_valor_uf_destino));
  const st = s((i) => num(i.icms_valor_st) + num(i.fcp_valor_st));
  return { difal, fcp, st, total: r2(difal + fcp + st) };
}

export type SituacaoGnre = { codigo: "a_gerar" | "gerada" | "paga" | "cancelada" | "vencida"; rotulo: string; cor: string; dica: string };

/** Situação para mostrar: a conta paga vale mais que a guia; a gerar e vencida avisa. */
export function situacaoGnre(g: Pick<GuiaGnre, "situacao" | "vencimento" | "conta">, hoje = new Date().toISOString().slice(0, 10)): SituacaoGnre {
  if (g.situacao === "cancelada") return { codigo: "cancelada", rotulo: "Cancelada", cor: "bg-slate-100 text-slate-700", dica: "A NF-e foi cancelada; a GNRE não é mais devida." };
  if (g.conta?.status === "pago") return { codigo: "paga", rotulo: "Paga", cor: "bg-emerald-100 text-emerald-800", dica: "Guarde o comprovante junto da nota." };
  if (g.vencimento < hoje) return { codigo: "vencida", rotulo: "Vencida", cor: "bg-red-100 text-red-800", dica: "Pague com os acréscimos do estado de destino (confirmar com o contador)." };
  if (g.situacao === "gerada") return { codigo: "gerada", rotulo: "Guia gerada", cor: "bg-sky-100 text-sky-800", dica: "O código de barras já está na conta a pagar." };
  return { codigo: "a_gerar", rotulo: "Gerar a guia", cor: "bg-amber-100 text-amber-900", dica: "Gere a guia no portal da GNRE e cole o código de barras aqui." };
}

/** Código de barras da guia: só os números, 44 (código de barras) ou 48 (linha digitável). */
export function codigoGnre(texto: string): { ok: boolean; codigo: string; erro?: string } {
  const codigo = String(texto ?? "").replace(/\D/g, "");
  if (codigo.length === 44 || codigo.length === 48) return { ok: true, codigo };
  return { ok: false, codigo, erro: `O código de barras da GNRE tem 44 ou 48 números (veio ${codigo.length}).` };
}

/** UFs digitadas ("PR, rs pr") → lista sem repetir, em maiúsculas, só siglas válidas. */
const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
export function lerUfs(texto: string): string[] {
  return [...new Set(String(texto ?? "").toUpperCase().split(/[^A-Z]+/).filter((u) => UFS.includes(u)))].sort();
}
