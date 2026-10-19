import { describe, expect, it } from "vitest";
import { resumoCobranca, type ContaCobranca } from "../cobranca";

describe("resumoCobranca", () => {
  const conta = (p: Partial<ContaCobranca>): ContaCobranca => ({ id: Math.random().toString(), cliente_id: "a", descricao: "x", valor: 100, vencimento: "2026-10-01", status: "aberto", ...p });
  it("separa atrasado por faixa, a vencer, recebido no mês e devedores", () => {
    const r = resumoCobranca([
      conta({ vencimento: "2026-10-10", valor: 100 }),                       // 9 dias
      conta({ vencimento: "2026-07-01", valor: 300, cliente_id: "b" }),      // 110 dias
      conta({ vencimento: "2026-10-22", valor: 50 }),                        // a vencer
      conta({ vencimento: "2026-10-05", status: "pago", valor_pago: 200, data_pagamento: "2026-10-06" }),
      conta({ vencimento: "2026-09-01", status: "cancelado", valor: 999 }),
    ], "2026-10-19");
    expect(r.atrasado).toBe(400);
    expect(r.aVencer).toBe(50);
    expect(r.recebidoMes).toBe(200);
    expect(r.faixas[0]).toMatchObject({ valor: 100, qtd: 1 });
    expect(r.faixas[4]).toMatchObject({ valor: 300, qtd: 1 });
    expect(r.devedores[0]).toMatchObject({ cliente_id: "b", valor: 300, dias: 110 });
    expect(r.meses[r.meses.length - 1]).toEqual({ mes: "2026-10", recebido: 200 });
    expect(r.inadimplencia).toBe(80); // 400 atrasado ÷ 500 vencido no ano (a cancelada não conta)
  });
});
