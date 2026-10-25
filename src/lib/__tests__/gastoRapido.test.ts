import { describe, expect, it } from "vitest";
import { categoriaDoGasto, chaveDoQrCode, dataDoTexto, interpretarGasto, valorDoTexto } from "../gastoRapido";

describe("gasto rápido falado ou digitado", () => {
  it("lê o valor com algarismos, com R$ e por extenso", () => {
    expect(valorDoTexto("gastei 80 reais de gasolina")).toBe(80);
    expect(valorDoTexto("almoço R$ 1.234,50")).toBe(1234.5);
    expect(valorDoTexto("pedágio 12,40")).toBe(12.4);
    expect(valorDoTexto("oitenta reais de gasolina")).toBe(80);
    expect(valorDoTexto("cento e vinte e cinco reais")).toBe(125);
    expect(valorDoTexto("dois mil e quinhentos")).toBe(2500);
    expect(valorDoTexto("comprei parafuso")).toBeNull();
  });

  it("entende hoje, ontem, anteontem e dia N", () => {
    expect(dataDoTexto("gasolina", "2026-10-20")).toBe("2026-10-20");
    expect(dataDoTexto("ontem no posto", "2026-10-20")).toBe("2026-10-19");
    expect(dataDoTexto("anteontem", "2026-10-01")).toBe("2026-09-29");
    expect(dataDoTexto("dia 12", "2026-10-20")).toBe("2026-10-12");
    expect(dataDoTexto("dia 28", "2026-10-03")).toBe("2026-09-28");
  });

  it("sugere a categoria pelas palavras", () => {
    expect(categoriaDoGasto("Abasteci no posto")).toBe("combustível");
    expect(categoriaDoGasto("pedágio da BR")).toBe("veículos e pedágio");
    expect(categoriaDoGasto("almoço com o técnico")).toBe("alimentação e copa");
    expect(categoriaDoGasto("Sedex da peça")).toBe("correios");
    expect(categoriaDoGasto("coisa qualquer")).toBeNull();
  });

  it("junta tudo numa sugestão", () => {
    expect(interpretarGasto("gastei 80 reais de gasolina ontem", "2026-10-20"))
      .toEqual({ valor: 80, data: "2026-10-19", categoria: "combustível", descricao: "Gastei 80 reais de gasolina ontem" });
  });

  it("tira a chave do QR Code do cupom", () => {
    const chave = "42261012345678000190650010000123451000123456";
    expect(chaveDoQrCode(`https://sat.sef.sc.gov.br/nfce/consulta?p=${chave}|2|1|1|ABC`)).toBe(chave);
    expect(chaveDoQrCode("texto sem chave")).toBeNull();
  });
});

describe("valorDoTexto com número longo", () => {
  it("telefone ou documento não vira valor", () => {
    expect(valorDoTexto("parte do aluguel 48991902050")).toBeNull();
    expect(valorDoTexto("aluguel 1.500,00")).toBe(1500);
  });
});
