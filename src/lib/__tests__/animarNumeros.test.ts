// Contagem dos números (GSAP, 30/10): só o número de dentro anima e o formato fica igual
import { describe, expect, it } from "vitest";
import { formatarComo, separarNumero } from "@/components/Animar";

describe("números que sobem até o valor", () => {
  it("lê dinheiro, porcentagem e quantidade", () => {
    expect(separarNumero("R$ 11.461,00")).toMatchObject({ antes: "R$ ", numero: 11461, casas: 2, milhar: true, depois: "" });
    expect(separarNumero("61%")).toMatchObject({ numero: 61, casas: 0, depois: "%" });
    expect(separarNumero("25 UN")).toMatchObject({ numero: 25, depois: " UN" });
    expect(separarNumero("-3,5 mil")).toMatchObject({ numero: -3.5, casas: 1, depois: " mil" });
  });
  it("não anima data, hora, fração nem texto sem número", () => {
    for (const t of ["27/10", "10:30", "3/5", "—", "sem dados"]) expect(separarNumero(t)).toBeNull();
  });
  it("o meio do caminho sai no mesmo formato", () => {
    const p = separarNumero("R$ 11.461,00")!;
    expect(formatarComo(5730.5, p)).toBe("R$ 5.730,50");
    expect(formatarComo(11461, p)).toBe("R$ 11.461,00");
    expect(formatarComo(30.4, separarNumero("61%")!)).toBe("30%");
  });
});
