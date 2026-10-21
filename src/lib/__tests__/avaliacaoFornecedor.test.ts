import { describe, expect, it } from "vitest";
import { classe, notaFinal, notasSugeridas, proximaAvaliacao, situacaoAvaliacao } from "../avaliacaoFornecedor";

describe("avaliação de fornecedores", () => {
  it("nota final pelos pesos e classe", () => {
    expect(notaFinal({ prazo: 10, qualidade: 10, preco: 10, atendimento: 10 })).toBe(10);
    expect(notaFinal({ prazo: 6, qualidade: 8, preco: 7, atendimento: 9 })).toBe(7.3);
    expect(classe(8)).toBe("A");
    expect(classe(7.9)).toBe("B");
    expect(classe(5.9)).toBe("C");
  });
  it("próxima avaliação pela classe; crítico no máximo 6 meses", () => {
    expect(proximaAvaliacao("2026-10-21", "A")).toBe("2027-10-21");
    expect(proximaAvaliacao("2026-10-21", "A", true)).toBe("2027-04-21");
    expect(proximaAvaliacao("2026-08-31", "B")).toBe("2027-02-28");
    expect(proximaAvaliacao("2026-10-21", "C")).toBe("2027-01-21");
  });
  it("sugere as notas pelo que aconteceu", () => {
    const s = notasSugeridas({
      entregues: 4, no_prazo: 3, atraso_medio: 5, devolucoes: 1, defeitos: 0,
      ocorrencias: [{ tipo: "qualidade", gravidade: "media" }, { tipo: "atendimento", gravidade: "leve" }],
    });
    expect(s.prazo).toBe(7.5);
    expect(s.qualidade).toBe(6); // 10 − 2 (média) − 2 (devolução)
    expect(s.atendimento).toBe(8);
    expect(s.base.join(" ")).toContain("3 de 4 entregas no prazo");
  });
  it("sem dado, notas neutras", () => {
    const s = notasSugeridas({ entregues: 0, no_prazo: 0, atraso_medio: null, devolucoes: 0, defeitos: 0, ocorrencias: [] });
    expect([s.prazo, s.qualidade, s.preco, s.atendimento]).toEqual([8, 10, 8, 9]);
  });
  it("situação da reavaliação", () => {
    expect(situacaoAvaliacao(null, "2026-10-21")).toBe("sem");
    expect(situacaoAvaliacao("2026-10-01", "2026-10-21")).toBe("vencida");
    expect(situacaoAvaliacao("2026-11-10", "2026-10-21")).toBe("em_breve");
    expect(situacaoAvaliacao("2027-03-01", "2026-10-21")).toBe("em_dia");
  });
});
