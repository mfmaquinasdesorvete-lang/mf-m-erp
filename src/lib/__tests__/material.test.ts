import { describe, expect, it } from "vitest";
import { consumo, faltaMedida, inteiroNaUnidade, pecasPorBarra, pecasPorChapa } from "@/lib/material";

describe("material", () => {
  it("peças por barra e por chapa", () => {
    expect(pecasPorBarra(6000, 420)).toBe(14);
    expect(pecasPorBarra(6000, 420, 3)).toBe(14);
    expect(pecasPorBarra(1000, 250, 3)).toBe(3); // 4 × 250 + 3 cortes passa de 1000
    expect(pecasPorChapa(1000, 2000, 150, 80)).toBe(156);
    expect(pecasPorChapa(1000, 2000, 1200, 50)).toBe(0 + Math.floor(1000 / 50) * Math.floor(2000 / 1200));
  });
  it("tubo de 6 m comprado por unidade: 1/14 do tubo por peça", () => {
    const tubo = { unidade: "UN", material_formato: "tubo", material_comprimento_mm: 6000 };
    const c = consumo(tubo, { modo: "comprimento", mm: 420 })!;
    expect(c.porInteiro).toBe(14);
    expect(c.sobra).toBe(120);
    expect(c.quantidade).toBeCloseTo(1 / 14, 4);
  });
  it("tubo comprado por metro conta a sobra", () => {
    const c = consumo({ unidade: "M", material_formato: "tubo", material_comprimento_mm: 6000 }, { modo: "comprimento", mm: 420 })!;
    expect(c.quantidade).toBeCloseTo(6 / 14, 4);
  });
  it("barra redonda por kg: pelo diâmetro do nome", () => {
    const barra = { descricao: "Barra Redonda Inox 304 3/4\" (19,05 mm)", unidade: "KG", material_formato: "barra", material_comprimento_mm: 3000 };
    expect(inteiroNaUnidade(barra)).toBeCloseTo(6.78, 1);
    const c = consumo(barra, { modo: "comprimento", mm: 100 })!;
    expect(c.porInteiro).toBe(30);
    // sem o comprimento da barra: só o pedaço
    const s = consumo({ ...barra, material_comprimento_mm: null }, { modo: "comprimento", mm: 100 })!;
    expect(s.quantidade).toBeCloseTo(0.226, 3);
    expect(s.aviso).toMatch(/sobra/);
  });
  it("chapa: pela peça ou por quantas saem", () => {
    const chapa = { unidade: "UN", material_formato: "chapa", material_comprimento_mm: 2000, material_largura_mm: 1000 };
    expect(consumo(chapa, { modo: "peca", comprimento: 150, largura: 80 })!.porInteiro).toBe(156);
    expect(consumo(chapa, { modo: "pecas", n: 12 })!.quantidade).toBeCloseTo(1 / 12, 4);
    expect(consumo(chapa, { modo: "peca", comprimento: 3000, largura: 80 })!.aviso).toMatch(/não cabe/);
    expect(faltaMedida({ ...chapa, material_largura_mm: null })).toBe("a largura");
    expect(faltaMedida({ ...chapa, unidade: "KG" })).toMatch(/espessura/);
  });
});
