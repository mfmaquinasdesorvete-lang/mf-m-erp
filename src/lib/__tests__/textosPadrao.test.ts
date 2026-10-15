import { describe, expect, it } from "vitest";
import { ehUsada, TEXTOS_PADRAO, textoPadrao } from "../textosPadrao";

describe("textos padrão dos documentos", () => {
  it("vazio usa o padrão do sistema e troca {dias}", () => {
    expect(textoPadrao({ textos: {} }, "os_condicoes_entrada", { dias: 60 })).toContain("até 60 dias");
    expect(textoPadrao(null, "oc_cotacao")).toBe(TEXTOS_PADRAO.oc_cotacao);
  });
  it("o texto salvo vale no lugar do padrão, com {empresa}", () => {
    expect(textoPadrao({ textos: { ficha_termo: "Aceito os termos da {empresa}." } }, "ficha_termo", { empresa: "MF" })).toBe("Aceito os termos da MF.");
    expect(textoPadrao({ textos: { pedido_condicoes: "  " } }, "pedido_condicoes")).toBe("");
  });
  it("reconhece máquina usada pelo nome", () => {
    expect(ehUsada("My Frost SB - Máquina de Sorvete Usada")).toBe(true);
    expect(ehUsada("Máquina seminova 3 sabores")).toBe(true);
    expect(ehUsada("Máquina semi-nova")).toBe(true);
    expect(ehUsada("Compressor recondicionado")).toBe(true);
    expect(ehUsada("My Frost Prime 7 Sabores")).toBe(false);
  });
});
