import { describe, expect, it } from "vitest";
import { limparSocios, nomeMarca, somaParticipacao } from "../licenciados";

describe("sócios e marca da unidade", () => {
  it("limpa as linhas e soma a participação", () => {
    const s = limparSocios([{ nome: "  Ana  Paula ", participacao: "60" as never }, { nome: "", participacao: 10 }, { nome: "Bia", participacao: "40,5" as never }, { nome: "Caio" }]);
    expect(s.map((x) => x.nome)).toEqual(["Ana Paula", "Bia", "Caio"]);
    expect(s[1].participacao).toBe(40.5);
    expect(s[2].participacao).toBeNull();
    expect(somaParticipacao(s)).toBe(100.5);
    expect(somaParticipacao([{ nome: "X" }])).toBeNull();
  });
  it("marca padrão é My Frost", () => {
    expect(nomeMarca("yozzy")).toBe("Yozzy");
    expect(nomeMarca(null)).toBe("My Frost");
  });
});
