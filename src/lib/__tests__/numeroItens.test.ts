import { describe, expect, it } from "vitest";
import { numeroBR, numeroParaCampo } from "../format";
import { numItem, totalItem, totalItens } from "@/components/ItensEditor";

describe("número digitado nas peças (ItensEditor)", () => {
  it("aceita vírgula decimal e milhar", () => {
    expect(numeroBR("12,50")).toBe(12.5);
    expect(numeroBR("1.250,90")).toBe(1250.9);
    expect(numeroBR("12,")).toBe(12);
    expect(numeroBR("")).toBeNull();
    expect(numeroBR("abc")).toBeNull();
  });

  it("mostra o número no campo com vírgula", () => {
    expect(numeroParaCampo(12.5)).toBe("12,5");
    expect(numeroParaCampo(1250)).toBe("1250");
    expect(numeroParaCampo(0.1 + 0.2, 2)).toBe("0,3");
    expect(numeroParaCampo(null)).toBe("");
  });

  it("total não vira NaN nem concatena texto", () => {
    const itens = [
      { produto_id: "a", descricao: "A", quantidade: "2" as unknown as number, valor_unitario: "12,50" as unknown as number },
      { produto_id: "b", descricao: "B", quantidade: 1, valor_unitario: 10.1 },
      { produto_id: "c", descricao: "C", quantidade: "" as unknown as number, valor_unitario: NaN },
    ];
    expect(numItem("abc")).toBe(0);
    expect(totalItem(itens[0])).toBe(25);
    expect(totalItens(itens)).toBe(35.1);
  });
});
