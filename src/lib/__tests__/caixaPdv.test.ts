import { describe, expect, it } from "vitest";
import { conferencia, formaDaConta, resumoCaixa } from "../caixaPdv";

describe("caixa do PDV", () => {
  it("dinheiro = troco + vendas + reforços − sangrias − devoluções", () => {
    const r = resumoCaixa(100, [{ forma: "Dinheiro", valor: 50 }, { forma: "Pix", valor: 80 }], [
      { tipo: "reforco", valor: 20, forma: "dinheiro" }, { tipo: "sangria", valor: 70, forma: "dinheiro" }, { tipo: "devolucao", valor: 10, forma: "Dinheiro" },
    ]);
    expect(r.formas[0]).toEqual({ forma: "Dinheiro", valor: 90 });
    expect(r.formas.find((f) => f.forma === "Pix")?.valor).toBe(80);
    expect(r).toMatchObject({ sangrias: 70, reforcos: 20, devolucoes: 10, vendido: 130, total: 170 });
  });
  it("só o troco quando ainda não vendeu", () => {
    expect(resumoCaixa(100, [], []).formas).toEqual([{ forma: "Dinheiro", valor: 100 }]);
  });
  it("conferência mostra sobra e falta", () => {
    const c = conferencia([{ forma: "Dinheiro", valor: 90 }, { forma: "Pix", valor: 80 }], { Dinheiro: 85 });
    expect(c.linhas[0]).toMatchObject({ contado: 85, diferenca: -5 });
    expect(c.linhas[1]).toMatchObject({ contado: 80, diferenca: 0 });
    expect(c.diferenca).toBe(-5);
  });
  it("nome da forma pela conta da venda", () => {
    expect(formaDaConta({ forma_pagamento: "cartao", status: "pago", descricao: "Pedido #1 · Crédito 2x" })).toBe("Crédito");
    expect(formaDaConta({ forma_pagamento: "dinheiro", status: "pago", descricao: "Pedido #1" })).toBe("Dinheiro");
    expect(formaDaConta({ forma_pagamento: null, status: "aberto", descricao: "Link de pagamento" })).toBe("Link (a pagar)");
  });
});
