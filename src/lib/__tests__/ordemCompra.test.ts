import { describe, expect, it } from "vitest";
import { parcelasPorPrazos, prazosDaCondicao, prazosDaForma, sobraParcelas, somarDiasIso, totaisOc } from "../ordemCompra";

describe("totaisOc", () => {
  it("soma produtos, IPI, ICMS ST, frete e outras e tira o desconto (como no banco)", () => {
    const t = totaisOc([{ quantidade: 2, custo_unitario: 100, ipi_aliquota: 10, icms_st_valor: 5 }], { frete: 50, outras_despesas: 10, desconto: 20 });
    expect(t).toEqual({ produtos: 200, ipi: 20, st: 5, frete: 50, outras: 10, desconto: 20, total: 265 });
  });
  it("OC antiga, sem os campos novos: só produtos + frete", () => {
    expect(totaisOc([{ quantidade: 3, custo_unitario: 10.5 }], { frete: 7 }).total).toBe(38.5);
  });
  it("desconto maior que tudo não deixa negativo", () => {
    expect(totaisOc([{ quantidade: 1, custo_unitario: 10 }], { desconto: 50 }).total).toBe(0);
  });
});

describe("parcelas", () => {
  it("divide e a última acerta os centavos", () => {
    const p = parcelasPorPrazos(100, [30, 60, 90], "2026-10-18");
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-11-17", "2026-12-17", "2027-01-16"]);
    expect(sobraParcelas(p, 100)).toBe(0);
  });
  it("prazos escritos na condição", () => {
    expect(prazosDaCondicao("30/60/90")).toEqual([30, 60, 90]);
    expect(prazosDaCondicao("28 dias boleto")).toEqual([28]);
    expect(prazosDaCondicao("à vista")).toEqual([0]);
    expect(prazosDaCondicao("3x")).toEqual([30, 60, 90]);
    expect(prazosDaCondicao("combinar")).toEqual([]);
  });
  it("prazos da forma de pagamento do cadastro", () => {
    expect(prazosDaForma({ parcelas: 3, intervalo_dias: 30, primeiro_em_dias: 28 })).toEqual([28, 58, 88]);
    expect(prazosDaForma(null)).toEqual([]);
  });
  it("soma dias atravessando o ano", () => expect(somarDiasIso("2026-12-20", 15)).toBe("2027-01-04"));
});
