import { describe, expect, it } from "vitest";
import { valorDeVenda } from "../analistaFiscal";

describe("valorDeVenda", () => {
  const nota = (cfops: string[], extra = {}) => ({ valor_total: 1000, payload: { items: cfops.map((cfop) => ({ cfop, valor_bruto: 500 })) }, ...extra });
  it("venda inteira conta a nota toda", () => expect(valorDeVenda(nota(["6101", "6102"]))).toBe(1000));
  it("transferência, conserto, comodato e demonstração não contam", () => {
    for (const c of ["6151", "6915", "6908", "6912", "5202", "6949"]) expect(valorDeVenda(nota([c]))).toBe(0);
  });
  it("nota que mistura soma só os itens de venda", () => expect(valorDeVenda(nota(["5101", "5915"]))).toBe(500));
  it("nota de entrada e transferência ligada não contam", () => {
    expect(valorDeVenda(nota(["5101"], { tipo_operacao: "entrada" }))).toBe(0);
    expect(valorDeVenda(nota(["5101"], { transferencia_id: "x" }))).toBe(0);
  });
});
