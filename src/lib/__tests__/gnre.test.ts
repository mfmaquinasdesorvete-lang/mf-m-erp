import { describe, expect, it } from "vitest";
import { codigoGnre, lerUfs, situacaoGnre, valoresGnre } from "../gnre";

describe("GNRE da NF-e para outro estado", () => {
  it("soma DIFAL, FCP e ICMS-ST dos itens (número ou texto)", () => {
    expect(valoresGnre([{ icms_valor_uf_destino: 10.5, fcp_valor_uf_destino: "2.00" }, { icms_valor_st: 5, fcp_valor_st: 0.25 }, { icms_valor: 99 }]))
      .toEqual({ difal: 10.5, fcp: 2, st: 5.25, total: 17.75 });
    expect(valoresGnre(null).total).toBe(0);
  });

  it("situação: cancelada, paga, vencida, gerada e a gerar", () => {
    const g = { situacao: "a_gerar" as const, vencimento: "2026-10-19", conta: { id: "c", status: "aberto", data_pagamento: null } };
    expect(situacaoGnre(g, "2026-10-17").codigo).toBe("a_gerar");
    expect(situacaoGnre({ ...g, situacao: "gerada" }, "2026-10-17").codigo).toBe("gerada");
    expect(situacaoGnre(g, "2026-10-20").codigo).toBe("vencida");
    expect(situacaoGnre({ ...g, conta: { id: "c", status: "pago", data_pagamento: "2026-10-19" } }, "2026-10-20").codigo).toBe("paga");
    expect(situacaoGnre({ ...g, situacao: "cancelada" }, "2026-10-20").codigo).toBe("cancelada");
  });

  it("código de barras com 44 ou 48 números", () => {
    expect(codigoGnre("85800000000 1 23450000000 2 12345678901 3 23456789012 4")).toMatchObject({ ok: true });
    expect(codigoGnre("8580000000012345000000012345678901234567890123").codigo).toHaveLength(46);
    expect(codigoGnre("123").ok).toBe(false);
  });

  it("UFs com inscrição de substituto", () => {
    expect(lerUfs("pr, RS rs; xx sc")).toEqual(["PR", "RS", "SC"]);
    expect(lerUfs("")).toEqual([]);
  });
});
