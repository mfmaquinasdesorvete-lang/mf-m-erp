import { describe, expect, it } from "vitest";
import { AREAS_ESQUEMA, PROCESSOS, posicoes, processosVisiveis, quebrar, textoProcesso } from "../esquemas";
import { SOBRE_TELAS } from "../modulos";

describe("esquemas dos processos", () => {
  it("toda tela citada existe no ERP (ou é uma aba do Sobre)", () => {
    for (const p of PROCESSOS) for (const s of p.passos) {
      if (!s.tela) continue;
      expect(s.tela.split("?")[0] in SOBRE_TELAS || /^\/sobre\?aba=(ideias|handoff|atualizacoes|modulos|chats|pedidos)$/.test(s.tela), `${p.id}: ${s.tela}`).toBe(true);
    }
    expect(new Set(PROCESSOS.map((p) => p.id)).size).toBe(PROCESSOS.length);
  });

  it("cada área tem esquemas e cada esquema cabe no desenho", () => {
    for (const a of AREAS_ESQUEMA) expect(PROCESSOS.some((p) => p.area === a.id), a.nome).toBe(true);
    expect(PROCESSOS.length).toBeGreaterThanOrEqual(15);
    for (const p of PROCESSOS) {
      expect(p.passos.length, p.id).toBeGreaterThanOrEqual(4);
      for (const s of p.passos) {
        expect(quebrar(s.titulo, 17).length, `${p.id}: ${s.titulo}`).toBeLessThanOrEqual(2);
        expect((s.nota ?? "").length, `${p.id}: ${s.nota}`).toBeLessThanOrEqual(30);
      }
    }
  });

  it("esquemas restritos: os da retaguarda só para a conta master e os dos chats só para o administrador", () => {
    const ids = (admin: boolean, master: boolean) => processosVisiveis(admin, master).map((p) => p.id);
    expect(ids(false, false)).not.toContain("chats");
    expect(ids(false, false)).not.toContain("encontro-contas");
    expect(ids(true, false)).toContain("chats");
    expect(ids(true, false)).not.toContain("licenciado");
    expect(ids(true, true)).toHaveLength(PROCESSOS.length);
    for (const p of PROCESSOS.filter((x) => x.area === "retaguarda")) expect(p.restrito, p.id).toBe("master");
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
