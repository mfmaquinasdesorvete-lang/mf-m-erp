import { describe, expect, it } from "vitest";
import { PROCESSOS, posicoes, quebrar, textoProcesso } from "../esquemas";
import { SOBRE_TELAS } from "../modulos";

describe("esquemas dos processos", () => {
  it("toda tela citada existe no ERP (ou é uma aba do Sobre)", () => {
    for (const p of PROCESSOS) for (const s of p.passos) {
      if (!s.tela) continue;
      expect(s.tela in SOBRE_TELAS || /^\/sobre\?aba=(ideias|handoff|atualizacoes|modulos)$/.test(s.tela), `${p.id}: ${s.tela}`).toBe(true);
    }
    expect(new Set(PROCESSOS.map((p) => p.id)).size).toBe(PROCESSOS.length);
  });

  it("zigue-zague: a segunda linha volta da direita para a esquerda", () => {
    expect(posicoes(6, 4).map((p) => `${p.linha}.${p.coluna}`)).toEqual(["0.0", "0.1", "0.2", "0.3", "1.3", "1.2"]);
    expect(posicoes(3, 1).map((p) => `${p.linha}.${p.coluna}`)).toEqual(["0.0", "1.0", "2.0"]);
  });

  it("quebra o título sem cortar palavra e monta o texto numerado", () => {
    expect(quebrar("NF do fornecedor chega", 14)).toEqual(["NF do", "fornecedor", "chega"]);
    const t = textoProcesso(PROCESSOS[0], (r) => (r === "/pedidos" ? "Venda de Peças" : undefined));
    expect(t.split("\n")[0]).toBe("Venda do começo ao fim");
    expect(t).toContain("1. Orçamento — Vendas (pelo WhatsApp ou proposta) · no ERP: Venda de Peças");
    expect(t).toContain("2. Cliente aprova — Cliente (pelo link da proposta)");
  });
});
