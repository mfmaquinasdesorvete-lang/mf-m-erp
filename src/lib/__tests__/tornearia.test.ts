import { describe, expect, it } from "vitest";
import { custoReceita, diametroDoNome, ehBarraPorKg, kgDaBarra, mmDaBarra } from "@/lib/tornearia";

describe("tornearia", () => {
  it("tira o diâmetro do nome da barra", () => {
    expect(diametroDoNome("Barra Redonda Inox 304 3/4\" (19,05 mm) - Eixo da Pá")).toBe(19.05);
    expect(diametroDoNome("Barra Redonda Inox 1 1/4\"")).toBe(31.75);
    expect(diametroDoNome("Barra Redonda Inox 1\"")).toBe(25.4);
    expect(diametroDoNome("Ferro Laminado Chato")).toBeNull();
  });
  it("só a barra redonda por kg mede em mm", () => {
    expect(ehBarraPorKg({ descricao: "Barra Redonda Inox 304 1/2\" (12,70 mm)", unidade: "KG" })).toBe(true);
    expect(ehBarraPorKg({ descricao: "Ferro Laminado Chato 3/4\" x 1/8\"", unidade: "UN" })).toBe(false);
  });
  it("converte comprimento em kg e volta", () => {
    // 100 mm de barra 3/4": ≈ 0,226 kg
    expect(kgDaBarra(19.05, 100)).toBeCloseTo(0.226, 3);
    expect(mmDaBarra(19.05, kgDaBarra(19.05, 120))).toBe(120);
    expect(kgDaBarra(0, 100)).toBe(0);
  });
  it("soma o custo e avisa o insumo sem custo", () => {
    const custos: Record<string, number> = { a: 26.5, b: 0 };
    const r = custoReceita([{ componente_id: "a", quantidade: 0.2 }, { componente_id: "b", quantidade: 1 }], (id) => custos[id]);
    expect(r.total).toBe(5.3);
    expect(r.semCusto).toEqual(["b"]);
  });
});
