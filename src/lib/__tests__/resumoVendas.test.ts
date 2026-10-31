import { describe, expect, it } from "vitest";
import { somaDoPeriodo } from "../vendasLista";

const conta = (status: string, valor: number, valor_pago: number | null = null) =>
  ({ id: `${status}${valor}${valor_pago}`, status, valor, valor_pago, vencimento: "2026-10-10" });

describe("resumo das vendas do período (para o sócio)", () => {
  const r = somaDoPeriodo([
    { numero: 1, status: "entregue", valor_total: 1000, contas: [conta("pago", 1000, 960)] },            // tarifa de 40
    { numero: 2, status: "aprovado", valor_total: 500, contas: [conta("pago", 250), conta("aberto", 250)] },
    { numero: 3, status: "faturado", valor_total: 300, contas: [conta("cancelado", 300)] },                // nota a anular
    { numero: 4, status: "cancelado", valor_total: 900, contas: [conta("cancelado", 900)] },
    { numero: 5, status: "orcamento", valor_total: 700, contas: [] },
    { numero: 6, status: "faturado", valor_total: 200, contas: [] },                                       // sem conta
  ]);
  it("conta só as vendas valendo", () => {
    expect(r.pedidos).toBe(3);
    expect(r.vendido).toBe(1700);
    expect(r.foraDaSoma).toEqual([3]);
  });
  it("recebido pelo que entrou, a receber pelo que falta, diferença = tarifas", () => {
    expect(r.recebido).toBe(1210);
    expect(r.aReceber).toBe(250);
    expect(r.diferenca).toBe(40);
    expect(r.semConta).toEqual({ pedidos: 1, valor: 200 });
  });
});
