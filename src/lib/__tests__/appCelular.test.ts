import { describe, expect, it } from "vitest";
import { ehDoTecnico } from "../appCelular";

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
