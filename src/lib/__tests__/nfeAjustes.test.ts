import { describe, expect, it } from "vitest";
import { aplicarAjustes, conferirMotivo, faturamentoDoPedido } from "../../../supabase/functions/_shared/nfe-ajustes";

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

describe("conferirMotivo", () => {
  it("nota igual ou maior que o pedido não pede motivo", () => {
    expect(conferirMotivo(1000, 1000)).toBeNull();
    expect(conferirMotivo(1100, 1000)).toBeNull();
  });
  it("nota menor que o pedido sem motivo aceito é recusada", () => {
    expect(() => conferirMotivo(400, 4000)).toThrow(/menor que o pedido/);
    expect(() => conferirMotivo(400, 4000, "cliente pediu")).toThrow(/menor que o pedido/);
  });
  it("nota menor com motivo aceito devolve o texto para registrar", () => {
    expect(conferirMotivo(400, 4000, "entrega_parcial")).toMatch(/Entrega parcial/);
  });
});

describe("faturamentoDoPedido (entrega parcial)", () => {
  it("soma só as NF-e autorizadas de produção e calcula o restante", () => {
    const f = faturamentoDoPedido(6091, [
      { status: "autorizada", ambiente: "producao", valor_total: 580 },
      { status: "autorizada", ambiente: "homologacao", valor_total: 6091 },
      { status: "cancelada", ambiente: "producao", valor_total: 6091 },
    ]);
    expect(f).toEqual({ jaEmitido: 580, restante: 5511, emAndamento: false });
  });
  it("nota na SEFAZ trava uma nova", () => {
    expect(faturamentoDoPedido(100, [{ status: "processando", valor_total: 100 }]).emAndamento).toBe(true);
  });
  it("sem nota: restante é o pedido todo", () => {
    expect(faturamentoDoPedido(150, [])).toEqual({ jaEmitido: 0, restante: 150, emAndamento: false });
  });
});
