import { describe, expect, it } from "vitest";
import { ehDoTecnico, progressoEtapas } from "../appCelular";

describe("OS do técnico", () => {
  it("nome completo, primeiro nome e acento", () => {
    expect(ehDoTecnico("Lucas Técnico", "Lucas Técnico")).toBe(true);
    expect(ehDoTecnico("Lucas", "Lucas Silva")).toBe(true);
    expect(ehDoTecnico("joão", "João Pedro")).toBe(true);
    expect(ehDoTecnico("Lucas / Ana", "Ana Souza")).toBe(true);
  });
  it("não confunde nomes parecidos nem vazio", () => {
    expect(ehDoTecnico("Lucas", "Luciana Rocha")).toBe(false);
    expect(ehDoTecnico(null, "Lucas")).toBe(false);
    expect(ehDoTecnico("Lucas", "")).toBe(false);
  });
});

describe("etapas da OP", () => {
  it("conta as feitas e aponta a próxima na ordem", () => {
    expect(progressoEtapas([{ nome: "A", feita: true }, { nome: "B", feita: false }, { nome: "C", feita: true }])).toEqual({ total: 3, feitas: 2, pct: 67, proxima: "B" });
    expect(progressoEtapas([])).toEqual({ total: 0, feitas: 0, pct: 0, proxima: null });
  });
});
