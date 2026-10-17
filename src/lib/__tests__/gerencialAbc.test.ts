import { describe, expect, it } from "vitest";
import { periodoABC } from "../gerencial";

describe("período da curva ABC", () => {
  it("meses para trás, este ano, ano passado e tudo", () => {
    expect(periodoABC("12m", "2026-10-17")).toEqual({ de: "2025-10-18", ate: "2026-10-17" });
    expect(periodoABC("3m", "2026-10-17").de).toBe("2026-07-19");
    expect(periodoABC("ano", "2026-10-17")).toEqual({ de: "2026-01-01", ate: "2026-10-17" });
    expect(periodoABC("ano_passado", "2026-10-17")).toEqual({ de: "2025-01-01", ate: "2025-12-31" });
    expect(periodoABC("tudo", "2026-10-17")).toEqual({ de: null, ate: "2026-10-17" });
  });
});
