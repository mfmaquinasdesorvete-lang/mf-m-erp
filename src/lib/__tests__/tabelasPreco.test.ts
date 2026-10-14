import { describe, expect, it } from "vitest";
import { ajusteTexto, arredondar, precoNaTabela, type PrecoFixo, type TabelaPreco } from "../tabelasPreco";

const tabela = (t: Partial<TabelaPreco> = {}): TabelaPreco => ({
  id: "T1", nome: "Revenda", canal: "revenda", ajuste_percentual: -10, arredondamento: "centavos", observacoes: null, ativo: true, ...t,
});
const fixos: PrecoFixo[] = [{ id: "F1", tabela_id: "T1", produto_id: "MAQ", preco: 15990 }];

describe("arredondar", () => {
  it("centavos, inteiro para cima e final ,90", () => {
    expect(arredondar(123.454, "centavos")).toBe(123.45);
    expect(arredondar(123.456, "centavos")).toBe(123.46);
    expect(arredondar(123.01, "inteiro")).toBe(124);
    expect(arredondar(124, "inteiro")).toBe(124);
    expect(arredondar(123.45, "final90")).toBe(123.9);
    expect(arredondar(123.95, "final90")).toBe(124.9);
    expect(arredondar(123.9, "final90")).toBe(123.9);
  });
});

describe("precoNaTabela", () => {
  it("sem tabela vale o preço de venda", () => {
    expect(precoNaTabela(null, { id: "P", preco_venda: "249.90" }, fixos)).toEqual({ preco: 249.9, fixo: false });
  });

  it("preço fixo digitado vence o ajuste, mesmo com a tabela inativa", () => {
    expect(precoNaTabela(tabela(), { id: "MAQ", preco_venda: 18900 }, fixos)).toEqual({ preco: 15990, fixo: true });
    expect(precoNaTabela(tabela({ ativo: false }), { id: "MAQ", preco_venda: 18900 }, fixos)).toEqual({ preco: 15990, fixo: true });
  });

  it("aplica o % e o arredondamento; tabela inativa volta ao preço de venda", () => {
    expect(precoNaTabela(tabela(), { id: "P", preco_venda: 249.9 }, fixos).preco).toBe(224.91);
    expect(precoNaTabela(tabela({ ajuste_percentual: 15, arredondamento: "final90" }), { id: "P", preco_venda: 249.9 }, []).preco).toBe(287.9);
    expect(precoNaTabela(tabela({ ativo: false }), { id: "P", preco_venda: 249.9 }, []).preco).toBe(249.9);
    expect(precoNaTabela(tabela(), { id: "P", preco_venda: "" }, []).preco).toBe(0);
  });

  // BUG (src/lib/tabelasPreco.ts:22): o arredondamento "centavos" faz Math.round(v * 100) / 100 sobre o valor em
  // ponto flutuante, enquanto o banco (preco_tabela) faz round(v, 2) em numeric exato. Produto de R$ 17,90 numa tabela
  // de +5%: 17,90 × 1,05 = 18,795 → banco R$ 18,80; a tela (pedido/PDV) calcula 18.794999… → R$ 18,79.
  it("meio centavo arredonda para cima como no banco (17,90 + 5% = 18,80)", () => {
    expect(precoNaTabela(tabela({ ajuste_percentual: 5 }), { id: "P", preco_venda: 17.9 }, []).preco).toBe(18.8);
  });

  it("texto do ajuste", () => {
    expect(ajusteTexto(0)).toBe("preço de venda");
    expect(ajusteTexto(12.5)).toBe("+12,5%");
    expect(ajusteTexto(-10)).toBe("−10%");
  });
});
