import { describe, expect, it } from "vitest";
import { dataPagamentoConta, pedidoDoHistorico, recebidaParaItem } from "../../../supabase/functions/_shared/tiny";

// tiny.ts roda no Deno (lê o token com Deno.env); aqui só o tipo, para o tsc do site aceitar o import
declare global {
  var Deno: { env: { get(nome: string): string | undefined } };
}

// contas inventadas no formato da API v2 do Tiny
describe("Tiny: contas a receber já pagas", () => {
  it("número da venda pelo histórico", () => {
    expect(pedidoDoHistorico("Ref. ao pedido de venda nº 614")).toBe("614");
    expect(pedidoDoHistorico("Ref. ao Pedido de Venda Nº 0042, parcela 1/2")).toBe("42");
    expect(pedidoDoHistorico("Pedido #77 - sinal")).toBe("77");
    expect(pedidoDoHistorico("pedido 1203")).toBe("1203");
    expect(pedidoDoHistorico("Venda no balcão")).toBeNull();
    expect(pedidoDoHistorico(null)).toBeNull();
  });

  it("data do pagamento pelo campo que vier", () => {
    expect(dataPagamentoConta({ data_pagamento: "05/03/2026" })).toBe("2026-03-05");
    expect(dataPagamentoConta({ data_liquidacao: "2026-04-10" })).toBe("2026-04-10");
    expect(dataPagamentoConta({ dataBaixa: "11/04/2026" })).toBe("2026-04-11");
    expect(dataPagamentoConta({ data_pagamento: "", data_baixa: "12/04/2026" })).toBe("2026-04-12");
    expect(dataPagamentoConta({ data_vencimento: "01/04/2026" })).toBeNull();
    expect(dataPagamentoConta(null)).toBeNull();
  });

  it("conta paga inteira: o pago é o valor", () => {
    const r = recebidaParaItem({
      id: 9001, nome_cliente: "Sorveteria Exemplo", historico: "Ref. ao pedido de venda nº 614", numero_doc: "614/1",
      data_emissao: "01/03/2026", data_vencimento: "05/03/2026", valor: "1.250,50", saldo: "0", data_pagamento: "06/03/2026",
      cliente: { id: 555, nome: "Sorveteria Exemplo" },
    });
    expect(r).toMatchObject({
      id_externo: "9001", nome: "Sorveteria Exemplo", pedido: "614", vencimento: "2026-03-05", valor: 1250.5, pago: 1250.5,
      pagamento: "2026-03-06", cliente_externo: "555",
    });
  });

  it("paga em parte: o pago é o valor menos o saldo; valor pago informado vale mais", () => {
    expect(recebidaParaItem({ id: 1, valor: "1000.00", saldo: "300.00" }).pago).toBe(700);
    expect(recebidaParaItem({ id: 2, valor: "1000.00", saldo: "300.00", valor_pago: "650.00" }).pago).toBe(650);
    expect(recebidaParaItem({ id: 3, valor: "80" })).toMatchObject({ pago: 80, pagamento: null, pedido: null, cliente_externo: null });
  });
});
