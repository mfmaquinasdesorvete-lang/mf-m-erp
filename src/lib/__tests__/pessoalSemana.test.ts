import { describe, expect, it } from "vitest";
import { faixaAnterior, faixaDoPeriodo, faixaSemana } from "@/lib/pessoal";

describe("semana no painel pessoal", () => {
  it("vai de segunda a domingo e compara com a semana anterior", () => {
    expect(faixaSemana("2026-10-27")).toEqual({ de: "2026-10-26", ate: "2026-11-01" });
    expect(faixaSemana("2026-11-01")).toEqual({ de: "2026-10-26", ate: "2026-11-01" });
    const f = faixaDoPeriodo("semana", "2026-10", [], "2026-10-27");
    expect(f).toEqual({ de: "2026-10-26", ate: "2026-11-01" });
    expect(faixaAnterior("semana", "2026-10", f)).toEqual({ de: "2026-10-19", ate: "2026-10-25" });
  });
});
