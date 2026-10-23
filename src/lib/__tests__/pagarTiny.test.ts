import { describe, expect, it } from "vitest";
import { agruparPorTerceiro, competenciaDe, dataDaConta, modoDaCompetencia, rotuloOrigem, serieContas, somarMeses, termosOrigem, type OrigemConta } from "../pagarTiny";

const origem = (x: Partial<OrigemConta>): OrigemConta => ({ id: "c", origem: "outro", nf_numero: null, oc_numero: null, envio_numero: null, fatura_numero: null, emissao_efetiva: null, ...x });

describe("contas a pagar como no Tiny", () => {
  it("origem com o número do documento e entrando na busca", () => {
    expect(rotuloOrigem(origem({ origem: "nf", nf_numero: "1234" }))).toBe("NF 1234");
    expect(rotuloOrigem(origem({ origem: "oc", oc_numero: "56" }))).toBe("OC 56");
    expect(rotuloOrigem(origem({ origem: "nf", nf_numero: "910", oc_numero: "56" }))).toBe("NF 910 · OC 56");
    expect(rotuloOrigem(origem({ origem: "frete", envio_numero: "12" }))).toBe("Envio 12");
    expect(rotuloOrigem(origem({ origem: "cte", fatura_numero: "789" }))).toBe("Fatura 789");
    expect(rotuloOrigem(origem({ origem: "extrato" }))).toBe("Extrato");
    expect(rotuloOrigem(origem({ origem: "st", nf_numero: "77" }))).toBe("NFS-e 77");
    expect(rotuloOrigem(origem({ origem: "st" }))).toBe("ST");
    expect(rotuloOrigem(null)).toBeNull();
    expect(termosOrigem(origem({ origem: "nf", nf_numero: "1234" }))).toEqual(["NF 1234", "1234", "Nota de fornecedor"]);
  });

  it("data que vale no período: vencimento, emissão, pagamento e competência", () => {
    const c = { vencimento: "2026-10-20", data_pagamento: "2026-10-18", competencia: null, emissao: null, created_at: "2026-10-01T13:00:00Z" };
    expect(dataDaConta(c, "vencimento")).toBe("2026-10-20");
    expect(dataDaConta(c, "pagamento")).toBe("2026-10-18");
    expect(dataDaConta(c, "competencia")).toBe("2026-10-20");
    expect(dataDaConta({ ...c, competencia: "2026-09-01" }, "competencia")).toBe("2026-09-01");
    expect(dataDaConta(c, "emissao", origem({ emissao_efetiva: "2026-09-28" }))).toBe("2026-09-28");
    expect(dataDaConta({ ...c, emissao: "2026-09-30" }, "emissao", origem({ emissao_efetiva: "2026-09-28" }))).toBe("2026-09-30");
    expect(dataDaConta(c, "emissao")).toBe("2026-10-01");
  });

  it("competência: mês do vencimento, anterior, da emissão ou escolhido", () => {
    expect(competenciaDe("vencimento", "2026-10-20")).toBe("2026-10-01");
    expect(competenciaDe("anterior", "2026-01-10")).toBe("2025-12-01");
    expect(competenciaDe("emissao", "2026-10-20", "2026-09-15")).toBe("2026-09-01");
    expect(competenciaDe("emissao", "2026-10-20", null)).toBe("2026-10-01");
    expect(competenciaDe("outro", "2026-10-20", null, "2026-07")).toBe("2026-07-01");
    expect(modoDaCompetencia(null, "2026-10-20")).toBe("vencimento");
    expect(modoDaCompetencia("2026-09-01", "2026-10-20")).toBe("anterior");
    expect(modoDaCompetencia("2026-08-01", "2026-10-20", "2026-08-30")).toBe("emissao");
    expect(modoDaCompetencia("2026-03-01", "2026-10-20")).toBe("outro");
  });

  it("soma de meses respeita o fim do mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("parcelada divide o valor e os centavos que sobram vão na primeira", () => {
    const s = serieContas({ valor: 100, vencimento: "2026-11-10", descricao: "Compressor", documento: "NF 55" }, "parcelada", 3);
    expect(s.map((x) => x.valor)).toEqual([33.34, 33.33, 33.33]);
    expect(s.reduce((t, x) => t + x.valor, 0)).toBeCloseTo(100, 2);
    expect(s.map((x) => x.vencimento)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(s[1]).toMatchObject({ descricao: "Compressor (2/3)", documento: "NF 55 2/3", competencia: "2026-12-01" });
  });

  it("recorrências repetem o valor; única é uma conta só", () => {
    expect(serieContas({ valor: 50, vencimento: "2026-11-02", descricao: "Limpeza" }, "semanal", 3).map((x) => x.vencimento)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    const tri = serieContas({ valor: 300, vencimento: "2026-01-31", descricao: "Seguro" }, "trimestral", 2);
    expect(tri.map((x) => [x.valor, x.vencimento])).toEqual([[300, "2026-01-31"], [300, "2026-04-30"]]);
    expect(serieContas({ valor: 80, vencimento: "2026-11-05", descricao: "Única", documento: "" }, "unica", 9)).toEqual([
      { valor: 80, vencimento: "2026-11-05", descricao: "Única", documento: null, competencia: "2026-11-01" },
    ]);
    expect(serieContas({ valor: 10, vencimento: "2026-11-05", descricao: "x" }, "mensal", 500)).toHaveLength(60);
    // mês escolhido: a primeira no mês escolhido e as seguintes andando junto
    expect(serieContas({ valor: 10, vencimento: "2026-11-05", descricao: "x" }, "mensal", 2, "outro", "2026-10").map((x) => x.competencia)).toEqual(["2026-10-01", "2026-11-01"]);
  });

  it("agrupado por fornecedor, sem fornecedor no fim", () => {
    const g = agruparPorTerceiro([
      { terceiro: "Zeta", valor: 10 }, { terceiro: "", valor: 5 }, { terceiro: "Alfa", valor: 1.1 }, { terceiro: "Alfa", valor: 2.2 },
    ]);
    expect(g.map((x) => [x.terceiro, x.linhas.length, x.total])).toEqual([["Alfa", 2, 3.3], ["Zeta", 1, 10], ["Sem fornecedor", 1, 5]]);
  });
});
