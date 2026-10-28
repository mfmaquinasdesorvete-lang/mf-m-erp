import { describe, expect, it } from "vitest";
import { casarItensComOc } from "../../../supabase/functions/_shared/nfe-itens-oc";

const oc = (produto_id: string, quantidade: number, extra: { recebida?: number; codigo?: string } = {}) =>
  ({ produto_id, quantidade, quantidade_recebida: extra.recebida ?? 0, codigo_fornecedor: extra.codigo ?? null });

describe("itens da nota casados com a OC ligada (28/10)", () => {
  it("um item na nota e um na OC com a mesma quantidade", () => {
    const r = casarItensComOc([{ codigo: "PRD306917", quantidade: 4 }], [oc("inversor", 4)]);
    expect([...r]).toEqual([[0, "inversor"]]);
  });

  it("dois itens com quantidades diferentes casam pela quantidade", () => {
    const r = casarItensComOc([{ codigo: "4343", quantidade: 6 }, { codigo: "MKSI.23680", quantidade: 1 }], [oc("redutor", 1), oc("flange", 6)]);
    expect(r.get(0)).toBe("flange");
    expect(r.get(1)).toBe("redutor");
  });

  it("código do fornecedor guardado na OC vale antes da quantidade", () => {
    const r = casarItensComOc([{ codigo: "a1", quantidade: 2 }, { codigo: "B2", quantidade: 2 }], [oc("p1", 2, { codigo: "b2" }), oc("p2", 2, { codigo: "A1" })]);
    expect(r.get(0)).toBe("p2");
    expect(r.get(1)).toBe("p1");
  });

  it("na dúvida não casa: mesma quantidade em dois itens", () => {
    expect(casarItensComOc([{ codigo: "x", quantidade: 5 }, { codigo: "y", quantidade: 5 }], [oc("p1", 5), oc("p2", 5)]).size).toBe(0);
  });

  it("quantidade diferente (parcial ou caixa × unidade) fica para a tela", () => {
    expect(casarItensComOc([{ codigo: "x", quantidade: 1 }], [oc("p1", 50)]).size).toBe(0);
  });

  it("usa o que falta receber e ignora item já recebido", () => {
    expect(casarItensComOc([{ codigo: "x", quantidade: 4 }], [oc("p1", 10, { recebida: 6 })]).get(0)).toBe("p1");
    expect(casarItensComOc([{ codigo: "x", quantidade: 4 }], [oc("p1", 4, { recebida: 4 })]).size).toBe(0);
  });

  it("produto que outro item da nota já pegou não casa de novo; item null é pulado", () => {
    const r = casarItensComOc([null, { codigo: "y", quantidade: 3 }], [oc("p1", 3), oc("p2", 7)], ["p1"]);
    expect(r.size).toBe(0);
  });
});
