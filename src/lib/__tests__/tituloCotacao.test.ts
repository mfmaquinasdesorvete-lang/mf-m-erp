import { describe, expect, it } from "vitest";
import { tituloCotacao } from "@/components/Cotacoes";

describe("título da cotação pelos itens", () => {
  const d = new Date("2026-10-15T12:00:00");
  it("dois itens: nomes curtos e o mês", () => {
    expect(tituloCotacao(["Pá Batedora + Vedação - compatível com máquinas My Frost", "Sanfona - Borracha de Vedação da Pá Agitadora"], d))
      .toBe("Pá Batedora + Vedação e Sanfona · out/2026");
  });
  it("muitos itens e nenhum", () => {
    expect(tituloCotacao(["Motor", "Redutor", "Flange", "Correia"], d)).toBe("Motor, Redutor e mais 2 · out/2026");
    expect(tituloCotacao([], d)).toBe("");
  });
});
