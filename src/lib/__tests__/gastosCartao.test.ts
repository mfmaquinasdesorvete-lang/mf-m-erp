import { describe, expect, it } from "vitest";
import { agruparGastosCartao, ehGastoCartao } from "../gastosCartao";

const c = (id: string, descricao: string, valor: number, dia: string, extra = {}) =>
  ({ id, descricao, valor, valor_pago: valor, vencimento: dia, data_pagamento: dia, status: "pago", ...extra });

describe("gastos de cartão no A pagar", () => {
  it("reconhece a compra do cartão e deixa Pix e boleto de fora", () => {
    expect(ehGastoCartao(c("1", "POSTO SANTA ROSA · mfmaquinas", 200, "2026-10-18"))).toBe(true);
    expect(ehGastoCartao(c("2", "Pix FACEBOOK SERVICOS · Enviado", 100, "2026-10-21"))).toBe(false);
    expect(ehGastoCartao(c("3", "Boleto · Expresso São Miguel", 123, "2026-10-01"))).toBe(false);
    expect(ehGastoCartao(c("4", "Unifique", 317, "2026-10-08", { status: "aberto", data_pagamento: null }))).toBe(false);
    expect(ehGastoCartao(c("5", "Loja", 10, "2026-10-08", { forma_pagamento: "cartao_credito" }))).toBe(true);
  });

  it("junta por dia, soma e mantém o resto", () => {
    const r = agruparGastosCartao([
      c("a", "POSTO X · mfmaquinas", 100, "2026-10-20"),
      c("b", "Unifique", 317, "2026-10-08", { status: "aberto", data_pagamento: null }),
      c("c", "TINTAS · mfmaquinas", 58.1, "2026-10-20"),
      c("d", "ESPETO · mfmaquinas", 35, "2026-10-19"),
    ]);
    expect(r.map((x) => [x.descricao, x.valor])).toEqual([["Gastos cartão 20/10", 158.1], ["Unifique", 317], ["Gastos cartão 19/10", 35]]);
  });
});
