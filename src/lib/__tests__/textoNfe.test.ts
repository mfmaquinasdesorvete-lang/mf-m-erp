import { describe, expect, it } from "vitest";
import { preencherTextoNfe } from "../../../supabase/functions/_shared/textoNfe";

const modelo = "Pedido nº {pedido}. Vendedor: {vendedor}. Forma de pagamento: {forma_pagamento}. Garantia conforme proposta comercial. Dúvidas: WhatsApp {telefone}.";

describe("texto das informações complementares da NF-e", () => {
  it("troca as chaves pelos valores do pedido", () => {
    expect(preencherTextoNfe(modelo, { pedido: 576, vendedor: "Ana", forma_pagamento: "Pix", telefone: "(48) 99999-0000" }))
      .toBe("Pedido nº 576. Vendedor: Ana. Forma de pagamento: Pix. Garantia conforme proposta comercial. Dúvidas: WhatsApp (48) 99999-0000.");
  });

  it("tira a frase inteira quando a chave não tem valor, sem deixar {chave} na nota", () => {
    const t = preencherTextoNfe(modelo, { pedido: 576 });
    expect(t).toBe("Pedido nº 576. Garantia conforme proposta comercial.");
    expect(t).not.toMatch(/[{}]/);
  });

  it("texto sem chaves fica igual", () => {
    expect(preencherTextoNfe("Garantia de 12 meses.", {})).toBe("Garantia de 12 meses.");
    expect(preencherTextoNfe(null, {})).toBe("");
  });
});
