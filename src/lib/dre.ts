// DRE gerencial a partir das contas a receber e a pagar: cada categoria do plano de contas cai numa linha
// (receita, deduções, custos, despesas, financeiro, outros). Regime de competência (pelo vencimento ou mês de
// referência da conta fixa) ou de caixa (pela data em que o dinheiro entrou/saiu). Pode filtrar por centro de custo.

export type GrupoDre = "receita" | "deducao" | "custo" | "despesa_operacional" | "receita_financeira" | "despesa_financeira"
  | "outros" | "investimento" | "retirada" | "transferencia";
export type CategoriaFin = { nome: string; tipo: "receita" | "despesa"; grupo: GrupoDre };
export type Rateio = { centro_custo_id: string; percentual: number }[];
export type LancDre = {
  tipo: "receber" | "pagar"; categoria?: string | null; valor: number; valor_pago?: number | null; status: string;
  vencimento: string; data_pagamento?: string | null; competencia?: string | null; rateio?: Rateio | null;
};
export type Regime = "competencia" | "caixa";
export type LinhaDre = { chave: string; rotulo: string; valores: number[]; total: number; tipo: "grupo" | "resultado" | "info"; detalhes: { categoria: string; valores: number[]; total: number }[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export const ROTULO_GRUPO: Record<GrupoDre, string> = {
  receita: "Receita de vendas e serviços", deducao: "Impostos sobre vendas e deduções", custo: "Custos (mercadoria, matéria-prima, frete)",
  despesa_operacional: "Despesas operacionais", receita_financeira: "Receitas financeiras", despesa_financeira: "Despesas financeiras (tarifas, juros)",
  outros: "Outras receitas e despesas", investimento: "Investimentos (fora do resultado)", retirada: "Distribuição de lucros (fora do resultado)",
  transferencia: "Transferências (não entram no DRE)",
};

/** Meses AAAA-MM terminando no mês de `ate`, do mais antigo ao mais novo. */
export function mesesAte(ate: string, n: number) {
  const y = Number(ate.slice(0, 4)), m = Number(ate.slice(5, 7));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function dre(lancs: LancDre[], categorias: CategoriaFin[], meses: string[], regime: Regime, centro?: string | null) {
  const mapa = new Map(categorias.map((c) => [`${c.tipo}|${norm(c.nome)}`, c.grupo]));
  const grupoDe = (l: LancDre): GrupoDre =>
    mapa.get(`${l.tipo === "receber" ? "receita" : "despesa"}|${norm(l.categoria)}`) ?? (l.tipo === "receber" ? "receita" : "despesa_operacional");
  // valores com sinal: entrada +, saída −
  const valores = new Map<string, { grupo: GrupoDre; categoria: string; v: number[] }>();
  for (const l of lancs) {
    if (l.status === "cancelado") continue;
    let mes: string, v: number;
    if (regime === "caixa") {
      if (l.status !== "pago" || !l.data_pagamento) continue;
      mes = l.data_pagamento.slice(0, 7); v = Number(l.valor_pago ?? l.valor);
    } else {
      mes = (l.competencia ?? l.vencimento).slice(0, 7); v = Number(l.valor);
    }
    const i = meses.indexOf(mes);
    if (i < 0) continue;
    let peso = 1;
    if (centro) {
      const rat = l.rateio ?? [];
      peso = centro === "sem" ? (rat.length ? 0 : 1) : Number(rat.find((r) => r.centro_custo_id === centro)?.percentual ?? 0) / 100;
    }
    if (!peso) continue;
    const grupo = grupoDe(l);
    if (grupo === "transferencia") continue;
    const categoria = (l.categoria ?? "").trim() || (l.tipo === "receber" ? "vendas" : "outros");
    const k = `${grupo}|${categoria.toLowerCase()}`;
    const x = valores.get(k) ?? { grupo, categoria, v: meses.map(() => 0) };
    x.v[i] += (l.tipo === "receber" ? 1 : -1) * v * peso;
    valores.set(k, x);
  }
  const total = (a: number[]) => r2(a.reduce((s, x) => s + x, 0));
  const detalhes = (gs: GrupoDre[]) => [...valores.values()].filter((x) => gs.includes(x.grupo))
    .map((x) => ({ categoria: x.categoria, valores: x.v.map(r2), total: total(x.v) })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const soma = (gs: GrupoDre[]) => meses.map((_, i) => r2([...valores.values()].filter((x) => gs.includes(x.grupo)).reduce((s, x) => s + x.v[i], 0)));
  const mais = (a: number[], b: number[]) => a.map((x, i) => r2(x + b[i]));
  const grupo = (chave: string, rotulo: string, gs: GrupoDre[], tipo: LinhaDre["tipo"] = "grupo"): LinhaDre => {
    const v = soma(gs);
    return { chave, rotulo, valores: v, total: total(v), tipo, detalhes: detalhes(gs) };
  };
  const resultado = (chave: string, rotulo: string, v: number[]): LinhaDre => ({ chave, rotulo, valores: v, total: total(v), tipo: "resultado", detalhes: [] });

  const receita = grupo("receita", "Receita bruta", ["receita"]);
  const deducao = grupo("deducao", "(−) Impostos e deduções", ["deducao"]);
  const liquida = resultado("liquida", "(=) Receita líquida", mais(receita.valores, deducao.valores));
  const custo = grupo("custo", "(−) Custos", ["custo"]);
  const bruto = resultado("bruto", "(=) Lucro bruto", mais(liquida.valores, custo.valores));
  const despesas = grupo("despesas", "(−) Despesas operacionais", ["despesa_operacional"]);
  const operacional = resultado("operacional", "(=) Resultado operacional", mais(bruto.valores, despesas.valores));
  const financeiro = grupo("financeiro", "(±) Resultado financeiro", ["receita_financeira", "despesa_financeira"]);
  const outros = grupo("outros", "(±) Outras receitas e despesas", ["outros"]);
  const liquido = resultado("liquido", "(=) Lucro líquido", mais(mais(operacional.valores, financeiro.valores), outros.valores));
  const investimentos = grupo("investimentos", "Investimentos (fora do resultado)", ["investimento"], "info");
  const retiradas = grupo("retiradas", "Distribuição de lucros (fora do resultado)", ["retirada"], "info");

  const margem = liquido.valores.map((v, i) => (receita.valores[i] > 0 ? v / receita.valores[i] : null));
  return {
    meses, linhas: [receita, deducao, liquida, custo, bruto, despesas, operacional, financeiro, outros, liquido, investimentos, retiradas],
    margem, margemTotal: receita.total > 0 ? liquido.total / receita.total : null,
    resumo: (i: number) => ({
      receita: receita.valores[i], custos: r2(deducao.valores[i] + custo.valores[i]),
      despesas: r2(despesas.valores[i] + financeiro.valores[i] + outros.valores[i]), lucro: liquido.valores[i], margem: margem[i],
    }),
  };
}
