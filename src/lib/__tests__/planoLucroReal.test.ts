import { describe, expect, it } from "vitest";
import { CATEGORIAS_SUGERIDAS, resumoLucroReal, tratamentoLucroReal } from "../planoLucroReal";

describe("plano de contas no Lucro Real", () => {
  it("categorias da MF: abate o IR/CSLL e crédito de PIS/COFINS", () => {
    expect(tratamentoLucroReal("fornecedores", "custo")).toMatchObject({ deducao: "sim", credito: "sim" });
    expect(tratamentoLucroReal("frete", "custo")).toMatchObject({ deducao: "sim", credito: "sim" });
    expect(tratamentoLucroReal("energia/água/internet", "despesa_operacional")).toMatchObject({ deducao: "sim", credito: "sim" });
    expect(tratamentoLucroReal("tarifas bancárias", "despesa_financeira")).toMatchObject({ deducao: "sim", credito: "nao" });
    expect(tratamentoLucroReal("antecipação de recebíveis", "despesa_financeira")).toMatchObject({ deducao: "sim", credito: "nao" });
    expect(tratamentoLucroReal("juros e multas", "despesa_financeira").deducao).toBe("parcial");
    expect(tratamentoLucroReal("veículos e pedágio", "despesa_operacional").deducao).toBe("parcial");
    expect(tratamentoLucroReal("material de consumo", "despesa_operacional").credito).toBe("talvez");
    expect(tratamentoLucroReal("folha", "despesa_operacional")).toMatchObject({ deducao: "sim", credito: "nao" });
  });

  it("fora do resultado, tributos sobre o lucro e o que não abate", () => {
    expect(tratamentoLucroReal("IRPJ", "tributos").deducao).toBe("fora");
    expect(tratamentoLucroReal("distribuição de lucros", "retirada").deducao).toBe("fora");
    expect(tratamentoLucroReal("adiantamento a funcionários", "transferencia").deducao).toBe("fora");
    expect(tratamentoLucroReal("brindes", "despesa_operacional").deducao).toBe("nao");
    expect(tratamentoLucroReal("multas fiscais e de trânsito", "outros").deducao).toBe("nao");
    expect(tratamentoLucroReal("piso da fábrica", "despesa_operacional").nota).not.toMatch(/sobre a venda/);  // "piso" não é PIS
  });

  it("receitas pela linha do DRE", () => {
    expect(tratamentoLucroReal("receitas financeiras", "receita_financeira").nota).toMatch(/0,65%/);
    expect(tratamentoLucroReal("assistência técnica", "receita").nota).toMatch(/ISS/);
    expect(tratamentoLucroReal("vendas", "receita").nota).toMatch(/9,25%/);
  });

  it("sugestões trazem só o que muda o imposto, e o resumo soma por tratamento", () => {
    expect(CATEGORIAS_SUGERIDAS.every((c) => tratamentoLucroReal(c.nome, c.grupo).nota.length > 0)).toBe(true);
    const cats = [
      { nome: "fornecedores", grupo: "custo", tipo: "despesa", ativo: true },
      { nome: "juros e multas", grupo: "despesa_financeira", tipo: "despesa", ativo: true },
      { nome: "brindes", grupo: "despesa_operacional", tipo: "despesa", ativo: true },
      { nome: "vendas", grupo: "receita", tipo: "receita", ativo: true },
    ];
    const uso = (n: string) => ({ fornecedores: 1000, "juros e multas": 50, brindes: 30, vendas: 5000 } as Record<string, number>)[n] ?? 0;
    expect(resumoLucroReal(cats, uso)).toEqual({ abate: 1000, parcial: 50, naoAbate: 30, credito: 1000, creditoTalvez: 0 });
  });
});
