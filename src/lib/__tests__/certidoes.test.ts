import { describe, expect, it } from "vitest";
import { certidoesUrgentes, prazoDe, quadroCertidoes, validadeSugerida, type Certidao } from "../certidoes";

const HOJE = "2026-10-23";
const sc = { id: "sc", nome: "Matriz SC", uf: "SC" }, sp = { id: "sp", nome: "Filial SP", uf: "SP" };
const c = (extra: Partial<Certidao>): Certidao => ({ id: "x", unidade_id: null, tipo: "federal", situacao: "negativa", emitida_em: "2026-10-01", validade: "2027-03-30", ...extra });

describe("certidões", () => {
  it("prazo: falta, vencida, vence em até 15 dias e válida", () => {
    expect(prazoDe(undefined, HOJE)).toBe("falta");
    expect(prazoDe(c({ validade: "2026-10-22" }), HOJE)).toBe("vencida");
    expect(prazoDe(c({ validade: "2026-11-07" }), HOJE)).toBe("vence_logo");
    expect(prazoDe(c({ validade: "2026-11-08" }), HOJE)).toBe("valida");
  });
  it("validade sugerida só onde a lei fixa o prazo", () => {
    expect(validadeSugerida("federal", "2026-10-01")).toBe("2027-03-30");
    expect(validadeSugerida("fgts", "2026-10-01")).toBe("2026-10-31");
    expect(validadeSugerida("estadual", "2026-10-01")).toBe("");
  });
  it("quadro: federal e trabalhista do CNPJ, estadual/municipal/FGTS por unidade, com a mais nova", () => {
    const linhas = quadroCertidoes([
      c({ id: "a", validade: "2026-09-01", emitida_em: "2026-03-05" }), c({ id: "b" }),
      c({ id: "e", tipo: "estadual", unidade_id: "sp", validade: "2026-10-30", emitida_em: "2026-09-01" }),
      c({ id: "z", tipo: "estadual", unidade_id: "sc", validade: "2027-01-01", excluida_em: "2026-10-02T00:00:00Z" }),
    ], [sc, sp], HOJE);
    expect(linhas).toHaveLength(8);
    expect(linhas.find((l) => l.chave === "federal-cnpj")).toMatchObject({ prazo: "valida", atual: { id: "b" } });
    expect(linhas.find((l) => l.chave === "estadual-sp")?.prazo).toBe("vence_logo");
    expect(linhas.find((l) => l.chave === "estadual-sc")?.prazo).toBe("falta");
    expect(certidoesUrgentes(linhas).map((l) => l.chave)).toEqual(["estadual-sp"]);
  });
  it("positiva (com débitos) também é urgente", () => {
    const linhas = quadroCertidoes([c({ situacao: "positiva" })], [], HOJE);
    expect(certidoesUrgentes(linhas).map((l) => l.chave)).toEqual(["federal-cnpj"]);
  });
});
