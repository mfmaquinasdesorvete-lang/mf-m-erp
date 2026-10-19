import { describe, expect, it } from "vitest";
import { ehAdiantamento, gastosParaDre, resumoPrestacao } from "../adiantamento";

describe("adiantamento para funcionário", () => {
  it("reconhece a categoria com ou sem acento", () => {
    expect(ehAdiantamento("Adiantamento a Funcionarios")).toBe(true);
    expect(ehAdiantamento("fornecedores")).toBe(false);
  });
  it("500 adiantados: 50 de gasolina + 420 de correios → 30 de troco", () => {
    expect(resumoPrestacao(500, [{ valor: 50 }, { valor: 420 }], 30)).toEqual({ gasto: 470, trocoEsperado: 30, aReembolsar: 0, diferencaTroco: 0 });
  });
  it("gastou mais do que levou → a empresa deve a diferença", () => {
    expect(resumoPrestacao(500, [{ valor: 50 }, { valor: 480 }])).toMatchObject({ trocoEsperado: 0, aReembolsar: 30 });
  });
  it("os gastos entram no DRE com a categoria de cada um", () => {
    const l = gastosParaDre([{ conta_pagar_id: "a", data: "2026-10-19", categoria: "combustível", valor: 50 }, { conta_pagar_id: "x", data: "2026-10-19", categoria: "correios", valor: 450 }],
      [{ id: "a", status: "pago", unidade_id: "sc" }]);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ categoria: "combustível", valor: 50, status: "pago", data_pagamento: "2026-10-19" });
  });
});
