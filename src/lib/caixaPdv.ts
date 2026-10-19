// Caixa do PDV: troco inicial, vendas do balcão por forma de recebimento, sangrias, reforços e devoluções, e a conferência
// no fechamento (contado x esperado). Arquivo puro (testado).

export type MovimentoCaixa = { tipo: "sangria" | "reforco" | "devolucao"; valor: number; forma: string };
export type VendaCaixa = { forma: string; valor: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Forma de recebimento da conta da venda de balcão, com o mesmo nome que aparece no resumo. */
export function formaDaConta(c: { forma_pagamento: string | null; status: string; descricao: string | null }): string {
  const d = c.descricao ?? "";
  if (c.status === "aberto") return /link/i.test(d) ? "Link (a pagar)" : "A prazo";
  if (/cr[eé]dito/i.test(d)) return "Crédito";
  if (/d[eé]bito/i.test(d)) return "Débito";
  if (c.forma_pagamento === "dinheiro") return "Dinheiro";
  if (c.forma_pagamento === "pix") return "Pix";
  if (c.forma_pagamento === "cartao") return "Cartão";
  return c.forma_pagamento ?? "Outro";
}

/** Quanto deve haver em cada forma: dinheiro = troco + vendas + reforços − sangrias − devoluções em dinheiro. */
export function resumoCaixa(troco: number, vendas: VendaCaixa[], movimentos: MovimentoCaixa[]) {
  const m = new Map<string, number>([["Dinheiro", r2(troco)]]);
  const somar = (f: string, v: number) => m.set(f, r2((m.get(f) ?? 0) + v));
  for (const v of vendas) somar(v.forma, Number(v.valor));
  const tot = { sangrias: 0, reforcos: 0, devolucoes: 0 };
  for (const x of movimentos) {
    const f = x.tipo === "devolucao" ? x.forma || "Dinheiro" : "Dinheiro";
    if (x.tipo === "reforco") { somar(f, x.valor); tot.reforcos = r2(tot.reforcos + x.valor); }
    else { somar(f, -x.valor); if (x.tipo === "sangria") tot.sangrias = r2(tot.sangrias + x.valor); else tot.devolucoes = r2(tot.devolucoes + x.valor); }
  }
  const formas = [...m].map(([forma, valor]) => ({ forma, valor })).sort((a, b) => (a.forma === "Dinheiro" ? -1 : b.forma === "Dinheiro" ? 1 : b.valor - a.valor));
  return { formas, total: r2(formas.reduce((s, f) => s + f.valor, 0)), vendido: r2(vendas.reduce((s, v) => s + Number(v.valor), 0)), ...tot };
}

/** Conferência do fechamento: diferença por forma (contado − esperado) e a total. Forma não contada fica igual ao esperado. */
export function conferencia(esperado: { forma: string; valor: number }[], contado: Record<string, number | null | undefined>) {
  const linhas = esperado.map((e) => {
    const c = contado[e.forma];
    const valorContado = c == null || Number.isNaN(c) ? e.valor : r2(c);
    return { forma: e.forma, esperado: e.valor, contado: valorContado, diferenca: r2(valorContado - e.valor) };
  });
  return { linhas, diferenca: r2(linhas.reduce((s, l) => s + l.diferenca, 0)) };
}
