import { describe, expect, it } from "vitest";
import { contarCodigo, horasNoProjeto, linhasDoTexto } from "../codigoErp";

describe("código do ERP por técnica", () => {
  it("separa telas, regras, testes, funções e banco", () => {
    const r = contarCodigo([
      { caminho: "src/pages/Pdv.tsx", linhas: 800 },
      { caminho: "src/lib/caixaPdv.ts", linhas: 40 },
      { caminho: "src/lib/__tests__/caixaPdv.test.ts", linhas: 25 },
      { caminho: "supabase/functions/inter/index.ts", linhas: 300 },
      { caminho: "supabase/migrations/047.sql", linhas: 50 },
      { caminho: "package-lock.json", linhas: 9000 },
      { caminho: "src/assets/logo.webp", linhas: 3 },
    ]);
    expect(r.map((t) => [t.tecnica.split(" ")[0], t.linhas])).toEqual([["Telas", 800], ["Funções", 300], ["Banco", 50], ["Regras", 40], ["Testes", 25]]);
  });
  it("conta linhas com e sem quebra no fim", () => {
    expect(linhasDoTexto("a\nb\n")).toBe(2);
    expect(linhasDoTexto("a\nb")).toBe(2);
    expect(linhasDoTexto("")).toBe(0);
  });
});

describe("horas no projeto", () => {
  it("junta os envios próximos num período e soma 30 min pelo começo de cada um", () => {
    const h = horasNoProjeto([
      "2026-10-08T10:00:00Z", "2026-10-08T11:00:00Z", "2026-10-08T12:00:00Z", // 1 período: 2h + 30 min
      "2026-10-08T18:00:00Z", // outro período (pausa maior que 1h30): só os 30 min
      "2026-10-09T09:00:00Z", "2026-10-09T10:30:00Z", // 1h30 de intervalo ainda é o mesmo período: 1h30 + 30 min
    ]);
    expect(h).toEqual({ horas: 5, periodos: 3, dias: 2, desde: "2026-10-08T10:00:00.000Z" });
  });
  it("sem envios, zero", () => {
    expect(horasNoProjeto(["", "x"])).toEqual({ horas: 0, periodos: 0, dias: 0, desde: null });
  });
});
