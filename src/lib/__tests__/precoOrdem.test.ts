import { describe, expect, it } from "vitest";
import { precoOrdemComprado } from "../precoOrdem";

describe("preço da ordem × preço comprado", () => {
  it("casa pelo produto e mostra a diferença", () => {
    const l = precoOrdemComprado(
      [{ produto_id: "p1", descricao: "Rolamento 6202", quantidade: 10, custo_unitario: 10 }],
      [{ produto_id: "p1", descricao: "ROLAMENTO 6202 ZZ", quantidade: 10, valor_unitario: 11 }],
    );
    expect(l).toEqual([{ descricao: "Rolamento 6202", qtd_ordem: 10, preco_ordem: 10, qtd_nota: 10, preco_nota: 11, dif_pct: 10 }]);
  });

  it("sem produto, casa pela descrição (sem acento e pontuação) e respeita o fator", () => {
    const l = precoOrdemComprado(
      [{ produto_id: null, descricao: "Chapa inox 304 - disco", quantidade: 15, custo_unitario: 108 }],
      [{ produto_id: null, descricao: "CHAPA INOX 304 DISCO", quantidade: 1, valor_unitario: 1620, fator: 15 }],
    );
    expect(l[0]).toMatchObject({ qtd_nota: 15, preco_nota: 108, dif_pct: 0 });
  });

  it("o que só está na ordem ou só na nota aparece sem par", () => {
    const l = precoOrdemComprado(
      [{ produto_id: "p1", descricao: "Peça A", quantidade: 1, custo_unitario: 5 }],
      [{ produto_id: "p2", descricao: "Peça B", quantidade: 2, valor_unitario: 7 }],
    );
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ descricao: "Peça A", preco_nota: null });
    expect(l[1]).toMatchObject({ descricao: "Peça B", preco_ordem: null, preco_nota: 7 });
  });
});
