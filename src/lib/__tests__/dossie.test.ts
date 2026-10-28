// Dossiê da empresa: situação de cada célula (tem, parcial, falta, nada), extrato só depois do primeiro mês da conta
// e as faixas de meses do resumo. Dados inventados.
import { describe, expect, it } from "vitest";
import { faixasDeMeses, mapaDossie, mesesEntre } from "../dossie";

describe("dossiê da empresa", () => {
  const linhas = [
    { mes: "2024-02", tipo: "nfe_emitidas", qtd: 3, completos: 3 },
    { mes: "2024-03", tipo: "nfe_emitidas", qtd: 4, completos: 2 },
    { mes: "2024-03", tipo: "extrato:c1", qtd: 10, completos: 10 },
    { mes: "2024-02", tipo: "cte", qtd: 0, completos: 0 },
  ];
  const m = mapaDossie(linhas, [{ id: "c1", nome: "Banco" }], "2024-01", "2024-04");
  const cel = (mes: string, tipo: string) => m.meses.find((x) => x.mes === mes)!.celulas[tipo].situacao;

  it("meses do mais novo para o mais antigo", () => {
    expect(mesesEntre("2023-11", "2024-02")).toEqual(["2024-02", "2024-01", "2023-12", "2023-11"]);
  });
  it("tem, parcial (sem XML) e falta", () => {
    expect(cel("2024-02", "nfe_emitidas")).toBe("tem");
    expect(cel("2024-03", "nfe_emitidas")).toBe("parcial");
    expect(cel("2024-01", "nfe_emitidas")).toBe("falta");
  });
  it("o que pode não ter havido no mês fica sem marca", () => {
    expect(cel("2024-02", "cte")).toBe("nada");
    expect(cel("2024-01", "nfse")).toBe("nada");
  });
  it("extrato: antes do primeiro mês da conta não é falta; depois, o buraco é", () => {
    expect(cel("2024-02", "extrato:c1")).toBe("nada");
    expect(cel("2024-03", "extrato:c1")).toBe("tem");
    expect(cel("2024-04", "extrato:c1")).toBe("falta");
    expect(m.colunas.find((c) => c.tipo === "extrato:c1")?.primeiro).toBe("2024-03");
  });
  it("resumo por coluna", () => {
    expect(m.resumo.nfe_emitidas).toEqual({ falta: ["2024-04", "2024-01"], parcial: ["2024-03"] });
  });
  it("faixas de meses", () => {
    expect(faixasDeMeses(["2022-07", "2022-06", "2022-08", "2023-01"])).toBe("06/2022 a 08/2022, 01/2023");
    expect(faixasDeMeses([])).toBe("");
  });
});
