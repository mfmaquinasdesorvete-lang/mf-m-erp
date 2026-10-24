import { describe, expect, it } from "vitest";
import { contarPorPasta, pastaDo } from "../pastaFuncionario";

describe("pasta do funcionário", () => {
  it("sem divisão ou com divisão desconhecida cai em Outros", () => {
    expect(pastaDo({ pasta: "contrato" })).toBe("contrato");
    expect(pastaDo({ pasta: null })).toBe("outros");
    expect(pastaDo({})).toBe("outros");
    expect(pastaDo({ pasta: "qualquer" })).toBe("outros");
  });
  it("conta por pessoa e divisão, ignorando anexo sem pessoa", () => {
    const m = contarPorPasta([
      { entidade_id: "a", pasta: "contrato" }, { entidade_id: "a", pasta: "contrato" }, { entidade_id: "a", pasta: null },
      { entidade_id: "b", pasta: "exames" }, { entidade_id: null, pasta: "contrato" },
    ]);
    expect(m.get("a")).toEqual({ contrato: 2, outros: 1 });
    expect(m.get("b")).toEqual({ exames: 1 });
    expect(m.size).toBe(2);
  });
});
