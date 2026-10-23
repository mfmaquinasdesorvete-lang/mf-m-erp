import { describe, expect, it } from "vitest";
import { cruzar, linhasPlanilha, SEM_COLUNA, type Dimensao, type Medida } from "../cruzamento";

type F = { venda: string; mes: string; produto: string; receita: number; mc: number };
const fatos: F[] = [
  { venda: "v1", mes: "2026-09", produto: "Queen", receita: 100, mc: 30 },
  { venda: "v1", mes: "2026-09", produto: "Bico", receita: 20, mc: 10 },
  { venda: "v2", mes: "2026-10", produto: "Queen", receita: 200, mc: 50 },
];
const mes: Dimensao<F> = { id: "mes", nome: "Mês", de: (f) => f.mes, ordem: "texto" };
const produto: Dimensao<F> = { id: "produto", nome: "Produto", de: (f) => f.produto };
const receita: Medida = { id: "receita", nome: "Receita", formato: "brl", de: (a) => a.somas.receita ?? 0 };
const vendas: Medida = { id: "vendas", nome: "Vendas", formato: "num", de: (a) => a.ids.size };
const mcPct: Medida = { id: "pct", nome: "MC %", formato: "pct", de: (a) => (a.somas.receita ? (a.somas.mc ?? 0) / a.somas.receita : 0) };
const base = { numeros: (f: F) => ({ receita: f.receita, mc: f.mc }), id: (f: F) => f.venda };

describe("cruzamento livre", () => {
  it("soma por linha e coluna, com os totais", () => {
    const c = cruzar(fatos, { linha: produto, coluna: mes, medida: receita, ...base });
    expect(c.linhas).toEqual(["Queen", "Bico"]); // maior valor primeiro
    expect(c.colunas).toEqual(["2026-09", "2026-10"]); // mês em ordem
    expect(c.valor("Queen", "2026-10")).toBe(200);
    expect(c.valor("Bico", "2026-10")).toBeNull();
    expect(c.totalLinha("Queen")).toBe(300);
    expect(c.totalColuna("2026-09")).toBe(120);
    expect(c.total).toBe(320);
  });
  it("contagem conta cada venda uma vez e o % é calculado sobre as somas", () => {
    const c = cruzar(fatos, { linha: mes, coluna: null, medida: vendas, ...base });
    expect(c.colunas).toEqual([SEM_COLUNA]);
    expect(c.valor("2026-09", SEM_COLUNA)).toBe(1);
    expect(c.total).toBe(2);
    const p = cruzar(fatos, { linha: mes, coluna: null, medida: mcPct, ...base });
    expect(p.valor("2026-09", SEM_COLUNA)).toBeCloseTo(40 / 120);
    expect(p.total).toBeCloseTo(90 / 320);
  });
  it("planilha com uma coluna por coluna escolhida, total e linha de total", () => {
    const c = cruzar(fatos, { linha: produto, coluna: mes, medida: receita, ...base });
    const l = linhasPlanilha(c, "Produto");
    expect(l[0]).toEqual({ Produto: "Queen", "2026-09": 100, "2026-10": 200, Total: 300 });
    expect(l[l.length - 1]).toEqual({ Produto: "Total", "2026-09": 120, "2026-10": 200, Total: 320 });
    const s = linhasPlanilha(cruzar(fatos, { linha: produto, coluna: null, medida: receita, ...base }), "Produto");
    expect(s[0]).toEqual({ Produto: "Queen", Total: 300 });
  });
});
