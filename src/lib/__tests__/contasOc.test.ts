import { describe, expect, it } from "vitest";
import { divergenciaContasOc, podeLancarOc } from "../contasOc";

const conta = (vencimento: string, valor: number, status = "aberto") => ({ id: vencimento, vencimento, valor, status });

describe("contas lançadas pela OC", () => {
  it("batem com as parcelas: sem aviso", () => {
    expect(divergenciaContasOc([conta("2026-11-10", 500), conta("2026-12-10", 500)],
      [{ vencimento: "2026-12-10", valor: 500 }, { vencimento: "2026-11-10", valor: 500 }], 1000)).toBeNull();
  });
  it("sem contas: nada a conferir", () => {
    expect(divergenciaContasOc([], [{ vencimento: "2026-11-10", valor: 500 }], 500)).toBeNull();
  });
  it("total, quantidade e datas que mudaram", () => {
    const aviso = divergenciaContasOc([conta("2026-11-10", 500)], [{ vencimento: "2026-11-15", valor: 300 }, { vencimento: "2026-12-15", valor: 300 }], 600)!;
    expect(aviso).toContain("maior");
    expect(aviso).toContain("2 parcelas");
    const datas = divergenciaContasOc([conta("2026-11-10", 500)], [{ vencimento: "2026-11-15", valor: 500 }], 500)!;
    expect(datas).toContain("vencimentos");
  });
  it("conta cancelada não conta", () => {
    expect(divergenciaContasOc([conta("2026-11-10", 500), conta("2026-11-10", 500, "cancelado")], [{ vencimento: "2026-11-10", valor: 500 }], 500)).toBeNull();
  });
  it("só lança OC enviada, com fornecedor, valor e sem contas", () => {
    expect(podeLancarOc({ status: "enviado", fornecedor_id: "f", valor_total: 10 }, false)).toBe(true);
    expect(podeLancarOc({ status: "cotacao", fornecedor_id: "f", valor_total: 10 }, false)).toBe(false);
    expect(podeLancarOc({ status: "enviado", fornecedor_id: null, valor_total: 10 }, false)).toBe(false);
    expect(podeLancarOc({ status: "parcial", fornecedor_id: "f", valor_total: 10 }, true)).toBe(false);
    expect(podeLancarOc({ status: "recebido", fornecedor_id: "f", valor_total: 10 }, false)).toBe(false);
  });
});
