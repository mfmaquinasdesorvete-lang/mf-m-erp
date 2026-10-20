import { describe, expect, it } from "vitest";
import { furoDoCaixa, grupoFuro, inadimplencia, pontualidade, prazoMedio } from "../caixa";

describe("prazo médio", () => {
  it("pondera pelo valor e ignora datas impossíveis", () => {
    const r = prazoMedio([
      { inicio: "2026-10-01", fim: "2026-10-11", valor: 1000 }, // 10 dias
      { inicio: "2026-10-01", fim: "2026-10-31", valor: 3000 }, // 30 dias
      { inicio: "2026-10-20", fim: "2026-10-01", valor: 9999 }, // importada depois: fora
      { inicio: null, fim: "2026-10-01", valor: 50 },
    ]);
    expect(r).toEqual({ dias: 25, contas: 2 });
    expect(prazoMedio([]).dias).toBeNull();
  });
});

describe("inadimplência", () => {
  it("atrasado sobre o que venceu no período", () => {
    const r = inadimplencia([
      { valor: 800, vencimento: "2026-10-05", status: "pago" },
      { valor: 200, vencimento: "2026-10-10", status: "aberto" },
      { valor: 500, vencimento: "2026-11-10", status: "aberto" }, // ainda não venceu
      { valor: 100, vencimento: "2026-10-10", status: "cancelado" },
    ], "2026-10-20", "2026-07-22");
    expect(r).toEqual({ total: 1000, atraso: 200, pct: 20 });
  });
});

describe("furo do caixa", () => {
  it("agrupa as saídas sem lançamento e mostra o que se repete", () => {
    expect(grupoFuro("PAGAMENTO DARF 2089")).toBe("Impostos");
    expect(grupoFuro("Tarifa Pix enviado")).toBe("Tarifas e juros");
    expect(grupoFuro("Pix enviado · Fulano")).toBe("Fornecedores e outros");
    const f = furoDoCaixa([
      { valor: -10, descricao: "Banco · Tarifa Pix enviado" }, { valor: -10, descricao: "Banco · Tarifa Pix enviado" },
      { valor: -500, descricao: "PAGAMENTO DAS" }, { valor: 300, descricao: "Pix recebido" },
      { valor: -999, descricao: "x", status: "ignorado" },
    ]);
    expect(f.saidas).toEqual({ n: 3, total: 520 });
    expect(f.entradas).toEqual({ n: 1, total: 300 });
    expect(f.grupos[0]).toMatchObject({ grupo: "Impostos", total: 500 });
    expect(f.repetidos).toEqual([{ tipo: "Tarifa Pix enviado", n: 2, total: 20 }]);
  });
});

describe("pontualidade", () => {
  it("conta as pagas até o vencimento", () => {
    expect(pontualidade([
      { status: "pago", vencimento: "2026-10-10", data_pagamento: "2026-10-10" },
      { status: "pago", vencimento: "2026-10-10", data_pagamento: "2026-10-12" },
      { status: "aberto", vencimento: "2026-10-10" },
    ])).toEqual({ pagas: 2, emDia: 1, pct: 50 });
  });
});
