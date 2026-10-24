import { describe, expect, it } from "vitest";
import { diasUteisAte, lerOpcoesMl, pacoteMl } from "../../../supabase/functions/_shared/ml-frete";

describe("frete pelo Mercado Envios", () => {
  it("junta os volumes num pacote (alturas somadas, peso em gramas)", () => {
    expect(pacoteMl([
      { quantidade: 2, peso_kg: 0.1, largura_cm: 20, altura_cm: 5, comprimento_cm: 15 },
      { quantidade: 1, peso_kg: 0.35, largura_cm: 12, altura_cm: 4.2, comprimento_cm: 30 },
    ])).toBe("15x20x30,550");
    expect(pacoteMl([])).toBeNull();
  });

  it("conta os dias úteis até a entrega", () => {
    // sexta 23/10 → quinta 29/10: seg, ter, qua, qui
    expect(diasUteisAte("2026-10-29T00:00:00-03:00", new Date("2026-10-23T15:00:00Z"))).toBe(4);
  });

  it("lê as opções com o valor cheio e deixa de fora a retirada em agência", () => {
    const r = lerOpcoesMl({ options: [
      { name: "Expresso", list_cost: 14.4, cost: 0, shipping_method_id: 182, shipping_option_type: "address", estimated_delivery_time: { date: "2026-10-29T00:00:00-03:00" } },
      { name: "Retirar na agência", list_cost: 9, shipping_method_id: 9, shipping_option_type: "agency" },
    ] }, new Date("2026-10-23T15:00:00Z"));
    expect(r).toEqual([{ servico: "Expresso", valor: 14.4, prazo: 4, metodo: "182" }]);
    expect(lerOpcoesMl(null)).toEqual([]);
  });
});
