import { describe, expect, it } from "vitest";
import { previsaoCustoOp, resumoCustoOp } from "../custoOp";

describe("custo de montar cada unidade", () => {
  it("divide o total da OP pela quantidade e ordena as peças pela mais cara", () => {
    const r = resumoCustoOp([
      { descricao: "Parafuso", quantidade: 40, custo_unitario: 0.5 },
      { descricao: "Compressor", quantidade: 2, custo_unitario: 1200 },
      { descricao: "Etiqueta", quantidade: 2, custo_unitario: 0 },
    ], 2);
    expect(r.total).toBe(2420);
    expect(r.porUnidade).toBe(1210);
    expect(r.pecas.map((p) => p.descricao)).toEqual(["Compressor", "Parafuso", "Etiqueta"]);
    expect(r.pecas[0].porUnidade).toBe(1);
    expect(r.pecas[0].custoPorUnidade).toBe(1200);
    expect(r.pecas[1].porUnidade).toBe(20);
    expect(r.semCusto).toBe(1);
  });

  it("quantidade zero ou vazia conta como 1 e linha sem quantidade sai", () => {
    const r = resumoCustoOp([{ descricao: "A", quantidade: 3, custo_unitario: 10 }, { descricao: "B", quantidade: 0, custo_unitario: 99 }], 0);
    expect(r.porUnidade).toBe(30);
    expect(r.pecas).toHaveLength(1);
  });

  it("previsão desce nos subconjuntos e usa o custo de hoje", () => {
    const fichas = [
      { produto_id: "m", componente_id: "sub", quantidade: 1 },
      { produto_id: "m", componente_id: "a", quantidade: 2 },
      { produto_id: "sub", componente_id: "b", quantidade: 3 },
    ];
    const produtos = [
      { id: "m", descricao: "Máquina" }, { id: "sub", descricao: "Subconjunto" },
      { id: "a", descricao: "Peça A", preco_custo: 10 }, { id: "b", descricao: "Peça B", preco_custo: 5 },
    ];
    const linhas = previsaoCustoOp(fichas, produtos, "m", 2);
    expect(resumoCustoOp(linhas, 2).porUnidade).toBe(35);
    expect(linhas.find((l) => l.componente_id === "b")?.quantidade).toBe(6);
  });
});
