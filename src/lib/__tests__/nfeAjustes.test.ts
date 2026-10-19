import { describe, expect, it } from "vitest";
import { aplicarAjustes } from "../../../supabase/functions/_shared/nfe-ajustes";

const itens = [{ id: "a", descricao: "Peça A", quantidade: 2, valor_unitario: 10, valor_total: 20 }, { id: "b", descricao: "Peça B", quantidade: 1, valor_unitario: 5, valor_total: 5 }];

describe("conferir a NF-e antes de emitir", () => {
  it("sem ajustes, os itens do pedido vão como estão", () => {
    expect(aplicarAjustes(itens, null)).toBe(itens);
  });
  it("muda descrição, quantidade e valor e recalcula o total do item", () => {
    const r = aplicarAjustes(itens, { itens: [{ id: "a", descricao: "Peça A revisada", quantidade: 3, valor_unitario: 9.5 }] });
    expect(r[0]).toMatchObject({ descricao: "Peça A revisada", quantidade: 3, valor_unitario: 9.5, valor_total: 28.5 });
    expect(r[1]).toBe(itens[1]);
  });
  it("recusa item de outro pedido e quantidade zero", () => {
    expect(() => aplicarAjustes(itens, { itens: [{ id: "x", quantidade: 1 }] })).toThrow(/não é deste pedido/);
    expect(() => aplicarAjustes(itens, { itens: [{ id: "a", quantidade: 0 }] })).toThrow(/quantidade/);
  });
});
