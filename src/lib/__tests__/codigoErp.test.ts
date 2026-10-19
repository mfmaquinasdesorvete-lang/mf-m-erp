import { describe, expect, it } from "vitest";
import { contarCodigo, linhasDoTexto } from "../codigoErp";

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
