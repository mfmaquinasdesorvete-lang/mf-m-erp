import { describe, expect, it } from "vitest";
import { calcularCanal, precoPara, type Canal } from "../simuladorCanais";
import { tarifaFixa } from "../../../supabase/functions/_shared/ml-novos";

const loja: Canal = { id: "pix", nome: "Loja · Pix", percentuais: [{ nome: "Imposto", pct: 10, fonte: "teste" }] };
const ml: Canal = {
  id: "classico", nome: "Mercado Livre Clássico",
  percentuais: [{ nome: "Imposto", pct: 10, fonte: "teste" }, { nome: "Tarifa", pct: 12, fonte: "ML" }],
  fixa: { valor: tarifaFixa, fonte: "ML" }, frete: { valor: 25, desde: 79, fonte: "ML" },
};

describe("simulador de canais", () => {
  it("lucro e margem com cada desconto e a conta", () => {
    const r = calcularCanal(loja, 100, 50, "cadastro", 20);
    expect(r.linhas.map((l) => [l.nome, l.valor])).toEqual([["Imposto", 10], ["Custo do produto", 50]]);
    expect(r.lucro).toBe(40);
    expect(r.margemPct).toBe(40);
    // verba de anúncio: o que passa dos 20% de lucro desejado
    expect(r.anuncio).toEqual({ verba: 20, acosPct: 20, roas: 5 });
  });
  it("Mercado Livre: tarifa fixa abaixo de 79 e frete grátis a partir de 79", () => {
    const baixo = calcularCanal(ml, 50, 20, "cadastro", 0);
    expect(baixo.linhas.find((l) => l.nome.startsWith("Tarifa fixa"))?.valor).toBe(6.75);
    expect(baixo.linhas.some((l) => l.nome.startsWith("Frete"))).toBe(false);
    const alto = calcularCanal(ml, 200, 80, "cadastro", 0);
    expect(alto.linhas.find((l) => l.nome.startsWith("Frete"))?.valor).toBe(25);
    expect(alto.lucro).toBe(r(200 - 20 - 24 - 25 - 80));
  });
  it("preço mínimo zera o lucro e o preço com lucro deixa o lucro pedido", () => {
    const min = precoPara(ml, 80, 0)!;
    expect(calcularCanal(ml, min, 80, "c", 0).lucro).toBeGreaterThanOrEqual(0);
    expect(calcularCanal(ml, min - 0.05, 80, "c", 0).lucro).toBeLessThan(0.01);
    const com = precoPara(ml, 80, 15)!;
    expect(calcularCanal(ml, com, 80, "c", 0).margemPct!).toBeGreaterThanOrEqual(14.9);
    expect(precoPara(loja, 0, 10)).toBeNull();
    expect(precoPara(loja, 50, 95)).toBeNull();
  });
});
const r = (v: number) => Math.round(v * 100) / 100;
