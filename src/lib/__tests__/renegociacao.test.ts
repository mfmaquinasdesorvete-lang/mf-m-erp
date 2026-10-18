import { describe, expect, it } from "vitest";
import { andamento, linhaDoTempo, nomeArquivoLimpo, parcelasDoAcordo, somarMeses, tipoPeloArquivo, type EventoNegociacao } from "../renegociacao";

const brl = (v: number) => `R$ ${v.toFixed(2)}`;

describe("renegociação de contas a pagar", () => {
  it("parcelas mensais como o banco: a última leva os centavos e o dia que não existe vira o último do mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
    const p = parcelasDoAcordo(1000, 3, "2026-11-10");
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(parcelasDoAcordo(0, 3, "2026-11-10")).toEqual([]);
  });

  it("andamento: parcelas pagas, valor pago, quanto falta e a próxima", () => {
    const contas = [
      { id: "o", descricao: "Original", valor: 500, vencimento: "2026-09-01", status: "cancelado", negociacao_papel: "original" },
      { id: "a1", descricao: "Parcela 1/3", valor: 100, vencimento: "2026-10-01", status: "pago", valor_pago: 100, data_pagamento: "2026-10-02", negociacao_papel: "acordo" },
      { id: "a3", descricao: "Parcela 3/3", valor: 100, vencimento: "2026-12-01", status: "aberto", negociacao_papel: "acordo" },
      { id: "a2", descricao: "Parcela 2/3", valor: 100, vencimento: "2026-11-01", status: "aberto", negociacao_papel: "acordo" },
    ];
    const a = andamento(contas);
    expect(a).toMatchObject({ total: 3, pagas: 1, valorPago: 100, falta: 200, pct: 33, quitada: false });
    expect(a.proxima?.id).toBe("a2");
    const linha = linhaDoTempo([{ id: "e1", negociacao_id: "n", tipo: "nota", quando: "2026-09-20", texto: "Liguei", arquivo_caminho: null, arquivo_nome: null, arquivo_tipo: null, criado_nome: null, created_at: "2026-09-20T10:00:00Z" } as EventoNegociacao], contas, brl);
    expect(linha.map((i) => i.tipo)).toEqual(["pagamento", "nota"]);
    expect(linha[0].texto).toContain("Parcela 1/3");
  });

  it("arquivo: nome sem acento e tipo pelo arquivo", () => {
    expect(nomeArquivoLimpo("Áudio da negociação.ogg")).toBe("Audio_da_negociacao.ogg");
    expect(tipoPeloArquivo("audio/ogg")).toBe("audio");
    expect(tipoPeloArquivo("image/png")).toBe("print");
    expect(tipoPeloArquivo("application/pdf")).toBe("arquivo");
  });
});
