import { describe, expect, it } from "vitest";
import { palavrasItem, situacaoItem, sugerirPorNome, sugestaoCusto, unidadeDeEmbalagem, unidadeDoErp, type ItemNota } from "../itensNotas";

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

describe("sugestão de custo", () => {
  const item = (x: Partial<ItemNota>): ItemNota => ({ fornecedor_id: "f", fornecedor: "Frio", fornecedor_cnpj: null, codigo: "C1", descricao: "", ncm: null, ean: null, unidade: "PC", notas: 1, quantidade: 1, ultimo_valor: 100, ultima_data: "2026-01-01", primeira_data: null, produto_id: null, fator: 1, sem_estoque: null, sugestao_id: null, sugestao_motivo: null, ...x });
  it("código do fabricante igual e fator", () => {
    const s = sugestaoCusto({ id: "p", descricao: "Relé", codigo_fabricante: "ab12" }, [item({ codigo: "AB12", ultimo_valor: 120, fator: 12 })]);
    expect(s).toMatchObject({ nota: 1, custo: 10 });
  });
  it("pela descrição, sem item de outro produto", () => {
    const itens = [item({ codigo: "X", descricao: "VALV SOL DANF EVR 02 1/4S S/BOB", ultimo_valor: 171 }), item({ codigo: "Y", descricao: "VALV SOL DANF EVR 03 1/4S S/BOB", produto_id: "outro" })];
    const s = sugestaoCusto({ id: "p", descricao: "Valv SOL Danf EVR 03 1/4S S/BOB - Compatível com Máquinas My Frost" }, itens);
    expect(s?.item.codigo).toBe("X");
    expect(sugestaoCusto({ id: "p", descricao: "Câmera Wi-Fi" }, itens)).toBeNull();
  });
});
