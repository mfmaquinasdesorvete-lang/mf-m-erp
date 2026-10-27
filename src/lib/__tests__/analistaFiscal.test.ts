import { describe, expect, it } from "vitest";
import { partesDaSaida, valorDeVenda } from "../analistaFiscal";

const nota = (cfops: string[], extra = {}) => ({ valor_total: 1000, payload: { items: cfops.map((cfop) => ({ cfop, valor_bruto: 500 })) }, ...extra });

describe("valorDeVenda", () => {
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

describe("partesDaSaida", () => {
  it("venda, transferência e remessa ficam separadas", () => {
    expect(partesDaSaida(nota(["6101"]))).toEqual({ venda: 1000, transferencia: 0, outras: 0 });
    expect(partesDaSaida(nota(["6151"]))).toEqual({ venda: 0, transferencia: 1000, outras: 0 });
    expect(partesDaSaida(nota(["6912"]))).toEqual({ venda: 0, transferencia: 0, outras: 1000 });
    expect(partesDaSaida(nota(["5101", "5915"]))).toEqual({ venda: 500, transferencia: 0, outras: 500 });
    expect(partesDaSaida(nota(["5101"], { transferencia_id: "x" }))).toEqual({ venda: 0, transferencia: 1000, outras: 0 });
  });
});

describe("partesDaSaida para outra unidade", () => {
  it("nota antiga para a filial com CFOP de venda conta como transferência", () => {
    expect(partesDaSaida(nota(["6102"]), { paraOutraUnidade: true })).toEqual({ venda: 0, transferencia: 1000, outras: 0 });
  });
});

describe("partesDaSaida com CFOP de transferência para terceiro", () => {
  it("não conta como transferência nem como venda", () => {
    expect(partesDaSaida(nota(["6151"]), { paraOutraUnidade: false })).toEqual({ venda: 0, transferencia: 0, outras: 1000 });
    expect(partesDaSaida(nota(["6151"]), { paraOutraUnidade: null })).toEqual({ venda: 0, transferencia: 1000, outras: 0 });
  });
});
