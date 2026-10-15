import { describe, expect, it } from "vitest";
import { descontoItem, percentualItem, percentualLinha, percentualPedido, textoComissaoLinha, type LinhaProduto } from "../comissao";

const fixa: LinhaProduto = { id: "l1", nome: "Máquinas Franquia", comissao_tipo: "fixa", comissao_percentual: 2, comissao_faixas: [], ativo: true };
const desc: LinhaProduto = { id: "l2", nome: "Peças", comissao_tipo: "desconto", comissao_percentual: 0, ativo: true,
  comissao_faixas: [{ desconto_ate: 10, percentual: 2 }, { desconto_ate: 0, percentual: 5 }, { desconto_ate: 5, percentual: 3 }] };
const herda: LinhaProduto = { ...fixa, id: "l3", comissao_tipo: "herda" };

describe("percentualLinha", () => {
  it("fixa, herda e inativa", () => {
    expect(percentualLinha(fixa)).toBe(2);
    expect(percentualLinha(herda)).toBeNull();
    expect(percentualLinha({ ...fixa, ativo: false })).toBeNull();
  });
  it("faixas de desconto (fora de ordem) e acima da última vale a última", () => {
    expect(percentualLinha(desc, 0)).toBe(5);
    expect(percentualLinha(desc, 4)).toBe(3);
    expect(percentualLinha(desc, 5)).toBe(3);
    expect(percentualLinha(desc, 8)).toBe(2);
    expect(percentualLinha(desc, 30)).toBe(2);
  });
});

describe("percentualItem com linha", () => {
  const regras = [
    { id: "r1", categoria: "Máquinas", vendedor_id: null, percentual: 4, ativo: true },
    { id: "r2", categoria: "Máquinas", vendedor_id: "v2", percentual: 6, ativo: true },
  ];
  it("ordem: vendedor+categoria > linha > categoria > vendedor", () => {
    expect(percentualItem(regras, "v2", "Máquinas", 10, fixa)).toEqual({ pct: 6, origem: "vendedor_categoria" });
    expect(percentualItem(regras, "v1", "Máquinas", 10, fixa)).toEqual({ pct: 2, origem: "linha" });
    expect(percentualItem(regras, "v1", "Máquinas", 10, herda)).toEqual({ pct: 4, origem: "categoria" });
    expect(percentualItem([], "v1", "Máquinas", 10, herda)).toEqual({ pct: 10, origem: "vendedor" });
  });
});

describe("percentualPedido com desconto por item", () => {
  it("cada item usa a faixa do seu desconto", () => {
    const itens = [
      { produto_id: "a", quantidade: 1, valor_unitario: 100 }, // lista 100: 0% de desconto -> 5%
      { produto_id: "b", quantidade: 1, valor_unitario: 92 }, // lista 100: 8% de desconto -> 2%
    ];
    const r = percentualPedido([], { id: "v1", percentual: 10 }, itens, () => null, null, { linhaDe: () => desc, precoListaDe: () => 100 });
    expect(r!.pct).toBeCloseTo((100 * 5 + 92 * 2) / 192, 6);
    expect(r!.faixas.map((f) => f.categorias)).toEqual([["Peças"], ["Peças"]]);
  });
  it("desconto do pedido entra rateado", () => {
    expect(descontoItem(100, 100, 0.96)).toBeCloseTo(4, 6);
    const r = percentualPedido([], { id: "v1", percentual: 10 }, [{ produto_id: "a", quantidade: 1, valor_unitario: 100 }], () => null, null,
      { linhaDe: () => desc, precoListaDe: () => 100, descontoPedido: 6 });
    expect(r!.pct).toBe(2);
  });
  it("% digitado no pedido vale acima de tudo", () => {
    expect(percentualPedido([], { id: "v1", percentual: 10 }, [], () => null, 1.5)!.pct).toBe(1.5);
  });
});

describe("textoComissaoLinha", () => {
  it("resume o comissionamento", () => {
    expect(textoComissaoLinha(fixa)).toBe("2% fixo");
    expect(textoComissaoLinha(desc)).toBe("desc. até 0% → 5% · desc. até 5% → 3% · desc. até 10% → 2%");
  });
});
