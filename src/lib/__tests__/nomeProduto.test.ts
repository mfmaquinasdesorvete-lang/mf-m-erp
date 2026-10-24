import { describe, expect, it } from "vitest";
import { nomePadrao, separarCompatibilidade } from "../marketplace";

describe("nomePadrao", () => {
  it("ampère depois do número e faixa entre números", () => {
    expect(nomePadrao("Inversor de Frequência 3 CV 220 V 10 a")).toBe("Inversor de Frequência 3 CV 220 V 10 A");
    expect(nomePadrao("Relé de Estado Sólido 40 a 80 a Monofásico (SSR)")).toBe("Relé de Estado Sólido 40 a 80 A Monofásico (SSR)");
    expect(nomePadrao("Relé de Sub e Sobretensão com Voltímetro 63 a 220 V")).toBe("Relé de Sub e Sobretensão com Voltímetro 63 a 220 V");
  });
  it("o-ring escrito de vários jeitos", () => {
    expect(nomePadrao("Vedações Oring's - Dosador")).toBe("Vedações O-Rings - Dosador");
    expect(nomePadrao("Vedação o-Ring dos Pistões")).toBe("Vedação O-Ring dos Pistões");
  });
});

describe("separarCompatibilidade", () => {
  it("tira a frase do nome e põe no subtítulo com os modelos", () => {
    expect(separarCompatibilidade("Mecânica Dupla (2 Motores) - Top 300 / P 765 - Compatível com Máquinas My Frost")).toEqual({
      nome: "Mecânica Dupla (2 Motores) - Top 300 / P 765", subtitulo: "Compatível com máquinas My Frost Top 300 e P 765",
    });
    expect(separarCompatibilidade("Manípulo de Alumínio da Chave Extratora - Compatível com Máquinas My Frost")).toEqual({
      nome: "Manípulo de Alumínio da Chave Extratora", subtitulo: "Compatível com máquinas My Frost",
    });
  });
  it("nome sem a frase fica sem subtítulo", () => {
    expect(separarCompatibilidade("Motor Elétrico IBR 1,5 CV")).toEqual({ nome: "Motor Elétrico IBR 1,5 CV", subtitulo: null });
  });
});
