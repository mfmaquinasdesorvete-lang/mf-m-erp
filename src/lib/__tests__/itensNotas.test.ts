import { describe, expect, it } from "vitest";
import { palavrasItem, situacaoItem, sugerirPorNome, unidadeDeEmbalagem, unidadeDoErp } from "../itensNotas";

describe("situacaoItem", () => {
  it("ligado vence sem estoque e sugestão", () => {
    expect(situacaoItem({ produto_id: "p", sem_estoque: "consumo", sugestao_id: "s" })).toBe("ligado");
    expect(situacaoItem({ produto_id: null, sem_estoque: "consumo", sugestao_id: "s" })).toBe("sem_estoque");
    expect(situacaoItem({ produto_id: null, sem_estoque: null, sugestao_id: "s" })).toBe("sugestao");
    expect(situacaoItem({ produto_id: null, sem_estoque: null, sugestao_id: null })).toBe("pendente");
  });
});

describe("palavrasItem", () => {
  it("tira acento e palavras genéricas, mantém códigos", () => {
    expect(palavrasItem("ROLAMENTO 6204-2RS P/ MÁQUINA")).toEqual(["rolamento", "6204-2rs"]);
    expect(palavrasItem("Válvula solenoide 3/8 com bobina")).toEqual(["valvula", "solenoide", "3/8", "bobina"]);
  });
});

describe("sugerirPorNome", () => {
  const produtos = [
    { id: "a", descricao: "Rolamento 6204 2RS" },
    { id: "b", descricao: "Válvula solenoide EVR6 3/8" },
    { id: "c", descricao: "Motor do batedor 1/2 CV" },
    { id: "d", descricao: "Rolamento 6205" },
  ];
  it("acha pelo código com número", () => {
    const r = sugerirPorNome("EVR6 032F8072 - VALVULA SOLENOIDE EVR6 3/8R S/BOBINA", produtos);
    expect(r[0].produto.id).toBe("b");
  });
  it("medida igual (220V, 1/2 CV) não basta", () => {
    const r = sugerirPorNome("MOTOR BATEDOR 1/2CV 220V", [{ id: "r", descricao: "Relé sobretensão voltímetro 63A 220V monofásico" }, ...produtos]);
    expect(r.map((x) => x.produto.id)).not.toContain("r");
  });
  it("não sugere com uma palavra comum só", () => {
    expect(sugerirPorNome("ROLAMENTO RADIAL", produtos).map((x) => x.produto.id)).toEqual([]);
  });
  it("ordena pela nota", () => {
    const r = sugerirPorNome("Rolamento 6204", produtos);
    expect(r[0].produto.id).toBe("a");
    expect(r.some((x) => x.produto.id === "c")).toBe(false);
  });
});

describe("unidades", () => {
  it("converte a unidade da nota", () => {
    expect(unidadeDoErp("UNID")).toBe("UN");
    expect(unidadeDoErp("pç")).toBe("PC");
    expect(unidadeDoErp("LT")).toBe("L");
    expect(unidadeDoErp("XYZ")).toBe("UN");
    expect(unidadeDeEmbalagem("CX")).toBe(true);
    expect(unidadeDeEmbalagem("KG")).toBe(false);
  });
});
