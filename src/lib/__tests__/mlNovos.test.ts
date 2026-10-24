import { describe, expect, it } from "vitest";
import { atributosDoProduto, liquido, medidasFrete, precoParaReceber, tarifaFixa, terminarEm90, tituloML } from "../../../supabase/functions/_shared/ml-novos";

// tudo inventado: produtos e valores de exemplo
describe("preço do anúncio novo no Mercado Livre", () => {
  it("termina em ,90 subindo", () => {
    expect(terminarEm90(52.3)).toBe(52.9);
    expect(terminarEm90(52.9)).toBe(52.9);
    expect(terminarEm90(52.95)).toBe(53.9);
  });

  it("tarifa fixa por faixa e nada a partir de 79", () => {
    expect(tarifaFixa(10)).toBe(5);
    expect(tarifaFixa(20)).toBe(6.25);
    expect(tarifaFixa(40)).toBe(6.5);
    expect(tarifaFixa(60)).toBe(6.75);
    expect(tarifaFixa(79)).toBe(0);
  });

  it("abaixo de 79: cobre a tarifa % e a fixa e deixa o valor da loja", () => {
    const p = precoParaReceber(30, 12, 20);
    expect(p).toBeLessThan(79);
    expect(liquido(p, 12, 20)).toBeGreaterThanOrEqual(30);
    expect(liquido(terminarEm90(p - 1), 12, 20)).toBeLessThan(30);
  });

  it("acima de 79: o frete grátis entra na conta", () => {
    const p = precoParaReceber(500, 12, 40);
    expect(liquido(p, 12, 40)).toBeGreaterThanOrEqual(500);
    expect(liquido(p - 1, 12, 40)).toBeLessThan(500);
  });

  it("perto de 79: não fica num preço que paga frete sem precisar", () => {
    const p = precoParaReceber(60, 12, 30);
    expect(liquido(p, 12, 30)).toBeGreaterThanOrEqual(60);
  });
});

describe("cadastro do anúncio novo", () => {
  it("título até 60 letras sem cortar palavra", () => {
    const t = tituloML("Sanfona de Borracha para Pá Agitadora Compatível com Máquinas de Sorvete Expresso");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith("Compatível com")).toBe(false);
  });

  it("preenche marca, SKU, código e diz o que falta", () => {
    const cat = [
      { id: "BRAND", name: "Marca", tags: { required: true } },
      { id: "MODEL", name: "Modelo", tags: { required: true } },
      { id: "VOLTAGE", name: "Voltagem", tags: { required: true } },
      { id: "SELLER_SKU", name: "SKU" },
      { id: "GTIN", name: "Código universal", tags: { required: true } },
      { id: "EMPTY_GTIN_REASON", name: "Motivo", values: [{ id: "1", name: "O produto não tem código cadastrado" }] },
    ];
    const r = atributosDoProduto({ sku: "PC-1", descricao: "Peça", marca: "Marca X", codigo_barras: null }, cat);
    expect(r.atributos.map((a) => a.id)).toEqual(["BRAND", "MODEL", "SELLER_SKU", "EMPTY_GTIN_REASON"]);
    expect(r.faltando).toEqual(["Voltagem"]);
  });

  it("medidas do frete: sem medida usa uma caixa média e avisa", () => {
    expect(medidasFrete({ sku: null, descricao: "x", altura_cm: 10, largura_cm: 20, profundidade_cm: 5, peso_kg: 0.3 })).toEqual({ texto: "10x20x5,300", estimado: false });
    expect(medidasFrete({ sku: null, descricao: "x" }).estimado).toBe(true);
  });
});

describe("sem a marca My Frost nos canais", () => {
  it("troca 'máquinas My Frost' e tira o nome solto", async () => {
    const { semMyFrost } = await import("../../../supabase/functions/_shared/ml-novos");
    expect(semMyFrost("Sensor de Nível Boia - Compatível com Máquinas My Frost")).toBe("Sensor de Nível Boia - Compatível com Máquinas de sorvete expresso");
    expect(semMyFrost("Batedor Milk Shake Profissional My Frost - Parede / Acoplado")).toBe("Batedor Milk Shake Profissional - Parede / Acoplado");
    expect(semMyFrost("Kit exclusivo para máquinas MyFrost.")).toBe("Kit exclusivo para máquinas de sorvete expresso.");
    expect(semMyFrost("Peça (My Frost)")).toBe("Peça");
    expect(semMyFrost("Eixo da Mecânica")).toBe("Eixo da Mecânica");
  });
});
