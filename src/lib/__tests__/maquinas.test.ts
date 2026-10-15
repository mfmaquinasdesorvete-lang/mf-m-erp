import { describe, expect, it } from "vitest";
import { custoMedioCompras, mensagemMaquina, pecasEmGarantia } from "../maquinas";

describe("pecasEmGarantia", () => {
  it("soma só as OS em garantia, pelo custo do cadastro", () => {
    const r = pecasEmGarantia([
      { em_garantia: true, itens: [{ descricao: "Motor", quantidade: 1, produto: { preco_custo: 410 } }, { descricao: "Vedação", quantidade: 2, produto: { preco_custo: 38.5 } }] },
      { em_garantia: true, itens: [{ descricao: "Vedação", quantidade: 1, produto: { preco_custo: 38.5 } }] },
      { em_garantia: false, itens: [{ descricao: "Placa", quantidade: 1, produto: { preco_custo: 610 } }] },
    ]);
    expect(r.quantidade).toBe(4);
    expect(r.custo).toBe(525.5);
    expect(r.pecas.map((p) => p.descricao)).toEqual(["Motor", "Vedação"]);
    expect(r.pecas[1]).toMatchObject({ quantidade: 3, custo: 115.5 });
  });
  it("peça sem custo conta na quantidade com custo zero", () => {
    const r = pecasEmGarantia([{ em_garantia: true, itens: [{ descricao: "Parafuso", quantidade: 4, produto: null }] }]);
    expect(r).toMatchObject({ quantidade: 4, custo: 0 });
  });
});

describe("custoMedioCompras", () => {
  const linhas = [
    { evento: "compra", data: "2026-09-01", quantidade: 10, valor_unitario: 40 },
    { evento: "compra", data: "2026-03-01", quantidade: 30, valor_unitario: 36 },
    { evento: "compra", data: "2025-01-01", quantidade: 10, valor_unitario: 30 },
    { evento: "alteracao", data: "2026-09-02", quantidade: null, valor_unitario: null },
  ];
  it("média ponderada pela quantidade", () => {
    const r = custoMedioCompras(linhas)!;
    expect(r.medio).toBeCloseTo((400 + 1080 + 300) / 50, 6);
    expect(r).toMatchObject({ compras: 3, quantidade: 50, menor: 30, maior: 40 });
  });
  it("respeita o período", () => {
    expect(custoMedioCompras(linhas, "2025-10-15")!.medio).toBeCloseTo(37, 6);
    expect(custoMedioCompras(linhas, "2027-01-01")).toBeNull();
  });
});

describe("mensagemMaquina", () => {
  it("usa o primeiro nome e o link da máquina", () => {
    const m = mensagemMaquina("Juliana Rezende", "Máquina MF-150", "abc");
    expect(m).toMatch(/^Olá, Juliana!/);
    expect(m).toContain("/maquina/abc");
    expect(mensagemMaquina(null, "MF-150", "x")).toMatch(/^Olá! /);
  });
});
