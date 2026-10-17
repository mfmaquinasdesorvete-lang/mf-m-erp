import { describe, expect, it } from "vitest";
import { chaveDaLoja, ehMarcadorQuiosque, grupoDoItem, pagamentoDeQuiosque } from "../quiosques";

describe("quiosques", () => {
  it("separa os itens em MDF, tinta e ferragens", () => {
    expect(grupoDoItem("MDF BRANCO TX 2F 15MM")).toBe("mdf");
    expect(grupoDoItem("FITA BRANCO TX 22MM 50MT PROADE")).toBe("mdf");
    expect(grupoDoItem("Compensado naval 18mm")).toBe("mdf");
    expect(grupoDoItem("TINTA PU PRETO FOSCO 3,6L")).toBe("tinta");
    expect(grupoDoItem("FITA CREPE 48MM")).toBe("tinta");
    expect(grupoDoItem("ENDURECEDOR 066 0,834ML")).toBe("tinta");
    expect(grupoDoItem("SPRAY PRETO FOSCO")).toBe("tinta");
    expect(grupoDoItem("DOBRADIÇA CURVA AMORT CALÇO FIX")).toBe("ferragens");
    expect(grupoDoItem("COLA CONTATO 0730G CASCOLA")).toBe("ferragens");
    expect(grupoDoItem("SPOT LED VASTMOB CIRCULAR PRETO")).toBe("ferragens");
    expect(grupoDoItem(null)).toBe("ferragens");
  });

  it("reconhece o marcador com ou sem acento e no singular", () => {
    expect(ehMarcadorQuiosque("Quiosques")).toBe(true);
    expect(ehMarcadorQuiosque(" quiosque ")).toBe(true);
    expect(ehMarcadorQuiosque("Quiosques SP")).toBe(false);
  });

  it("acha a loja pelas duas primeiras palavras do nome", () => {
    expect(chaveDaLoja("MADEIRAGREEN COMERCIO ATACADISTA DE MADEIRAS E ARTEFATOS LTDA")).toBe("madeiragreen comercio");
    expect(chaveDaLoja("GMAD AMERICANA COMERCIO DE MADEIRAS LTDA")).toBe("gmad americana");
    expect(chaveDaLoja("SÓ TINTAS LTDA")).toBe("so tintas");
    expect(chaveDaLoja("J.F. COMPENSADOS LTDA")).toBe("compensados");
    expect(chaveDaLoja("ABC LTDA")).toBe("");
  });

  it("só conta saídas com o nome da loja ou de loja de tinta/MDF", () => {
    const chaves = [chaveDaLoja("MADEIRAGREEN COMERCIO ATACADISTA"), chaveDaLoja("GMAD AMERICANA COMERCIO"), chaveDaLoja("Cristian Valgas Ltda")];
    expect(pagamentoDeQuiosque("PIX MADEIRAGREEN COMERCIO ATACADISTA", -3116.02, chaves)).toBe(true);
    expect(pagamentoDeQuiosque("GMAD AMERICANA · MFMAQUINAS", -456.9, chaves)).toBe(true);
    expect(pagamentoDeQuiosque("GMAD CURITIBA · MFMAQUINAS", -10, chaves)).toBe(false);
    expect(pagamentoDeQuiosque("SO TINTAS · MFMAQUINAS", -905, chaves)).toBe(true);
    expect(pagamentoDeQuiosque("J.F. COMPENSADOS LTDA · MFMAQUINAS", -214.63, chaves)).toBe(true);
    expect(pagamentoDeQuiosque("SO TINTAS · estorno", -10, chaves)).toBe(false);
    expect(pagamentoDeQuiosque("PIX RECEBIDO MADEIRAGREEN", 50, chaves)).toBe(false);
    expect(pagamentoDeQuiosque("POSTO ESTRELA DO SUL", -250, chaves)).toBe(false);
    expect(pagamentoDeQuiosque("Pix CRISTIAN VALGAS · Enviado", -480, chaves)).toBe(true);
    expect(pagamentoDeQuiosque("Pix CRISTIAN SOUZA · Enviado", -480, chaves)).toBe(false);
    // palavra solta do nome não basta
    expect(pagamentoDeQuiosque("Pix Gelados Exemplo Industria", -2000, [chaveDaLoja("Tintas Exemplo Ltda")])).toBe(false);
    expect(pagamentoDeQuiosque("TINTAS EXEMPLO · cartao", -1313.7, [chaveDaLoja("Tintas Exemplo Ltda")])).toBe(true);
  });
});
