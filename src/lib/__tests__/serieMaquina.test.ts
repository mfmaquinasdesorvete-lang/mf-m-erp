import { describe, expect, it } from "vitest";
import { bicosDoModelo, lerSerieMF, proximaPreventiva6m, serieMF } from "../serieMaquina";

describe("nº de série MF", () => {
  it("monta pelo exemplo: Top 300, NF 72315 de outubro/2023", () => {
    expect(serieMF(3, "2023-10-14", 72315)).toBe("031023315");
    expect(serieMF(bicosDoModelo("Máquina Top 300"), "2023-10-14", "72315")).toBe("031023315");
  });
  it("descobre os bicos pela descrição", () => {
    expect(bicosDoModelo("Máquina de Sorvete Soft MF-300 (3 bicos)")).toBe(3);
    expect(bicosDoModelo("My Frost Top 200 - Expresso 3 Sabores")).toBe(3);
    expect(bicosDoModelo("Máquina Expressa MF-150 Balcão")).toBe(1);
    expect(bicosDoModelo("Peça qualquer")).toBeNull();
  });
  it("lê a série de volta e recusa o que não segue a regra", () => {
    expect(lerSerieMF("031023315")).toEqual({ bicos: 3, mes: 10, ano: 2023, finalNF: "315" });
    expect(lerSerieMF("031325315")).toBeNull();
    expect(serieMF(3, null, 1)).toBeNull();
  });
  it("preventiva de 6 em 6 meses a partir da compra", () => {
    expect(proximaPreventiva6m("2025-01-10", "2026-10-19")).toBe("2027-01-10");
    expect(proximaPreventiva6m("2025-04-10", "2026-10-19")).toBe("2026-10-10");
    expect(proximaPreventiva6m(null, "2026-10-19")).toBeNull();
  });
});
