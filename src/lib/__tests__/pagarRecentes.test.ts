import { describe, expect, it } from "vitest";
import { filtroRecentesPagar, inicioRecentes, periodoPedeHistorico } from "@/lib/pagarRecentes";

describe("contas a pagar recentes", () => {
  it("o corte é o 1º dia do mês, 3 meses antes (virando o ano)", () => {
    expect(inicioRecentes("2026-10-23")).toBe("2026-07-01");
    expect(inicioRecentes("2026-02-28")).toBe("2025-11-01");
    expect(inicioRecentes("2026-03-31")).toBe("2025-12-01");
  });
  it("período antes do corte ou sem começo pede o histórico", () => {
    const corte = "2026-07-01";
    expect(periodoPedeHistorico({ de: "2026-10-19", ate: "2026-10-25" }, corte)).toBe(false);
    expect(periodoPedeHistorico({ de: "2026-07-01", ate: "" }, corte)).toBe(false);
    expect(periodoPedeHistorico({ de: "2026-06-30", ate: "2026-10-25" }, corte)).toBe(true);
    expect(periodoPedeHistorico({ de: "", ate: "" }, corte)).toBe(true);
    expect(periodoPedeHistorico({ de: "", ate: "2026-10-25" }, corte)).toBe(true);
  });
  it("o filtro leva as abertas, as renegociadas e as datas a partir do corte", () => {
    let expr = "";
    filtroRecentesPagar("2026-07-01")({ or: (e: string) => { expr = e; } });
    expect(expr).toBe("status.eq.aberto,negociacao_id.not.is.null,vencimento.gte.2026-07-01,data_pagamento.gte.2026-07-01,emissao.gte.2026-07-01,competencia.gte.2026-07-01");
  });
});
