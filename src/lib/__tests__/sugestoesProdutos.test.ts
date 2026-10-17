import { describe, expect, it } from "vitest";
import { aplicavel, mostrarValor, pedeContador, valorAtual } from "../sugestoesProdutos";

describe("sugestões de produtos", () => {
  it("mostra NCM com pontos, custo em reais e tipo por extenso", () => {
    expect(mostrarValor("ncm", "84189900")).toBe("8418.99.00");
    expect(mostrarValor("ncm", "8418")).toBe("8418");
    expect(mostrarValor("preco_custo", "27.13")).toMatch(/27,13/);
    expect(mostrarValor("preco_custo", 0)).toBe("—");
    expect(mostrarValor("tipo", "servico")).toBe("Serviço");
    expect(mostrarValor("marca", null)).toBe("—");
  });

  it("lê o valor atual do produto (custo zero conta como vazio)", () => {
    expect(valorAtual("preco_custo", { preco_custo: 0 })).toBeNull();
    expect(valorAtual("preco_custo", { preco_custo: 12.5 })).toBe(12.5);
    expect(valorAtual("ncm", { ncm: "84186910" })).toBe("84186910");
    expect(valorAtual("marca", undefined)).toBeNull();
  });

  it("só aplica sugestão pendente com valor; NCM sem confiança alta pede o contador", () => {
    expect(aplicavel({ valor: "84189900", situacao: "pendente" })).toBe(true);
    expect(aplicavel({ valor: null, situacao: "pendente" })).toBe(false);
    expect(aplicavel({ valor: "x", situacao: "aplicada" })).toBe(false);
    expect(pedeContador({ campo: "ncm", confianca: "media" })).toBe(true);
    expect(pedeContador({ campo: "ncm", confianca: "alta" })).toBe(false);
    expect(pedeContador({ campo: "marca", confianca: "baixa" })).toBe(false);
  });
});
