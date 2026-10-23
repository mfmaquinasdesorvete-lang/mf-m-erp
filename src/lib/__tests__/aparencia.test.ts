import { describe, expect, it } from "vitest";
import { contraste, cssDaAparencia, tonsArea, tonsMarca } from "../aparencia";

const rgb = (s: string) => s.split(" ").map(Number) as [number, number, number];
const BRANCO: [number, number, number] = [255, 255, 255], NOITE: [number, number, number] = [11, 18, 32];

describe("tons da cor escolhida", () => {
  it("cor clara (amarelo) fica legível no tema claro e cor escura (marinho) no escuro", () => {
    const amarelo = tonsMarca("#ffd400"), marinho = tonsMarca("#0b1f3a");
    expect(contraste(rgb(amarelo.claro.brand), BRANCO)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(rgb(marinho.escuro.brand), NOITE)).toBeGreaterThanOrEqual(4.5);
  });
  it("texto da área legível nos dois temas", () => {
    const t = tonsArea("#fde047");
    expect(contraste(rgb(t["modulo-texto"]), BRANCO)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(rgb(t["modulo-texto-escuro"]), NOITE)).toBeGreaterThanOrEqual(4.5);
    expect(t.modulo).toBe("253 224 71");
  });
});

describe("CSS da aparência", () => {
  it("marca, área e fontes", () => {
    const css = cssDaAparencia({ cor_marca: "#e0a65a", cores_areas: { vendas: "#ff0000" }, fonte_titulos: "montserrat" });
    expect(css).toContain(':root[data-accent="marca"] { --brand:');
    expect(css).toContain(':root[data-theme="dark"][data-accent="marca"]');
    expect(css).toContain(':root[data-modulo="vendas"] { --modulo: 255 0 0;');
    expect(css).toContain('--fonte-titulos: "Montserrat Variable"; --fonte-texto: "DM Sans Variable";');
  });
  it("ignora cor inválida e nome de área estranho (nada entra no CSS sem conferir)", () => {
    const css = cssDaAparencia({ cor_marca: "vermelho", cores_areas: { vendas: "#12", 'x"] {} body': "#ffffff" }, fonte_titulos: "nao-existe" });
    expect(css).not.toContain("data-accent");
    expect(css).not.toContain("data-modulo");
    expect(css).toContain("--fonte-titulos: Poppins;");
  });
});
