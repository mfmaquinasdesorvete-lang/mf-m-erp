import { describe, expect, it } from "vitest";
import { descricaoComparavel, indiceProdutos, montarComposicao, paraGravar, planejarKits, quantidadeTiny, type LinhaComposicao, type ProdutoKitTiny } from "../kitsTiny";

const linha = (pai: string, comp: string, qtd: number, compSku = "", compDesc = "", paiDesc = `Kit ${pai}`): LinhaComposicao =>
  ({ pai, paiSku: "", paiDesc, comp, compSku, compDesc, qtd });

const PRODUTOS: ProdutoKitTiny[] = [
  { id: "k-vedacao", descricao: "Kit Vedação Q050", kit: true, id_externo: "1001" },
  { id: "k-mecanica", descricao: "Kit Mecânica", kit: true, id_externo: "1002" },
  { id: "maq-q050", descricao: "Máquina de Sorvete Q050", kit: false, id_externo: "1003" },
  { id: "k-ja", descricao: "Kit Chave Extratora", kit: true, id_externo: "1005" },
  { id: "k-lote", descricao: "Kit Lote de Anéis", kit: true, id_externo: "1006" },
  { id: "anel", descricao: "Anel O-Ring 20mm", id_externo: "2001", sku: "OR-20" },
  { id: "junta", descricao: "Junta da Tampa", sku: "JT-01" },
  { id: "graxa", descricao: "Graxa Alimentícia", sku: "GRX" },
  // produto repetido unificado: o cadastro antigo (inativo) guardou o código do Tiny; o ativo tem "Tiny 2002" nos alternativos
  { id: "retentor-velho", descricao: "Retentor 35mm (antigo)", id_externo: "2002", ativo: false },
  { id: "retentor", descricao: "Retentor 35mm", codigos_alternativos: "RT35; Tiny 2002" },
  { id: "dup-a", descricao: "Parafuso M6", sku: "PAR-M6" },
  { id: "dup-b", descricao: "Parafuso M6", sku: "PAR-M6" },
];

describe("quantidadeTiny", () => {
  it("aceita vírgula e ponto decimal, milhar com ponto e lixo vira 0", () => {
    expect(quantidadeTiny("0,5")).toBe(0.5);
    expect(quantidadeTiny("0.5")).toBe(0.5);
    expect(quantidadeTiny("1.250,75")).toBe(1250.75);
    expect(quantidadeTiny(" 3 ")).toBe(3);
    expect(quantidadeTiny(2)).toBe(2);
    expect(quantidadeTiny("abc")).toBe(0);
    expect(quantidadeTiny(null)).toBe(0);
    expect(quantidadeTiny("")).toBe(0);
  });
});

describe("montarComposicao", () => {
  const cab = {
    "ID kit/fabricado": "1001", "SKU kit/fabricado": "KV-50", "Descrição kit/fabricado": "Kit Vedação Q050",
    "ID componente": "2001", "SKU componente": "OR-20", "Descrição componente": "Anel O-Ring 20mm", "Quantidade componente": "2,000",
  };

  it("lê as colunas do Tiny, limpa espaços e pula linha sem kit ou componente", () => {
    const r = montarComposicao([cab, { ...cab, "ID componente": "  " }, { ...cab, "ID kit/fabricado": "", "ID componente": "9" }, { ...cab, "ID componente": " 2002 ", "Quantidade componente": "0,5" }]);
    expect(r).toEqual([
      { pai: "1001", paiSku: "KV-50", paiDesc: "Kit Vedação Q050", comp: "2001", compSku: "OR-20", compDesc: "Anel O-Ring 20mm", qtd: 2 },
      { pai: "1001", paiSku: "KV-50", paiDesc: "Kit Vedação Q050", comp: "2002", compSku: "OR-20", compDesc: "Anel O-Ring 20mm", qtd: 0.5 },
    ]);
    expect(montarComposicao([])).toEqual([]);
  });

  it("recusa planilha que não é a de composição", () => {
    expect(() => montarComposicao([{ Código: "1", Descrição: "x" }])).toThrow(/faltam as colunas ID kit\/fabricado, ID componente, Quantidade componente/);
  });
});

describe("descricaoComparavel", () => {
  it("tira acento, 'compatível com máquinas…', My Frost e símbolos; TB = tubo", () => {
    expect(descricaoComparavel("Anel O-Ring 20mm TB - Compatível com máquinas My Frost Q050")).toBe("aneloring20mmtubo");
    expect(descricaoComparavel("ANEL O RING 20MM tubo")).toBe("aneloring20mmtubo");
    expect(descricaoComparavel("Graxa Alimentícia My Frost")).toBe(descricaoComparavel("graxa alimenticia"));
  });
});

describe("indiceProdutos", () => {
  const idx = indiceProdutos(PRODUTOS);
  it("código do Tiny: o cadastro ativo (código alternativo) ganha do inativo (id_externo)", () => {
    expect(idx.codigo("2002")?.id).toBe("retentor");
    expect(idx.achar("2002", "", "")).toEqual({ p: PRODUTOS.find((p) => p.id === "retentor"), como: "codigo" });
  });
  it("SKU e descrição só quando dão um único produto ativo", () => {
    expect(idx.achar("x", " jt-01 ", "")?.p.id).toBe("junta");
    expect(idx.achar("x", "PAR-M6", "Parafuso M6")).toBeNull(); // dois cadastros com o mesmo SKU e descrição
    expect(idx.achar("x", "", "Graxa alimenticia - compatível com máquinas")?.como).toBe("descricao");
    expect(idx.achar("x", "", "Retentor 35mm (antigo)")).toBeNull(); // inativo não entra por descrição
  });
});

describe("planejarKits", () => {
  const linhas: LinhaComposicao[] = [
    // pronto: por código, SKU, descrição, código do repetido unificado e o mesmo anel em duas linhas (soma)
    linha("1001", "2001", 2, "", "Anel O-Ring 20mm"),
    linha("1001", "9001", 1, "JT-01", "Junta"),
    linha("1001", "9002", 0.25, "", "Graxa Alimentícia - Compatível com máquinas My Frost"),
    linha("1001", "2002", 1, "", "Retentor"),
    linha("1001", "2001", 0.5, "OR-20", "Anel O-Ring 20mm"),
    linha("1001", "9003", 0, "JT-01", "Junta (zerada)"),
    // falta item: componente que não está no ERP
    linha("1002", "7777", 3, "XX-99", "Peça que não existe"),
    linha("1002", "2001", 1),
    // fabricado (máquina), fora do ERP, kit que já tem componentes e kit que leva ele mesmo
    linha("1003", "2001", 4),
    linha("1004", "2001", 1, "", "", "Kit antigo"),
    linha("1005", "2001", 1),
    linha("1006", "1006", 10),
    linha("1006", "2001", 10),
  ];
  const planos = planejarKits(linhas, PRODUTOS, [{ kit_id: "k-ja" }]);
  const de = (tinyId: string) => planos.find((p) => p.tinyId === tinyId)!;

  it("classifica cada kit e ordena por situação", () => {
    expect(planos.map((p) => [p.tinyId, p.situacao])).toEqual([
      ["1001", "pronto"], ["1002", "faltam_itens"], ["1006", "proprio_item"], ["1005", "ja_tem"], ["1003", "fabricado"], ["1004", "fora_do_erp"],
    ]);
  });

  it("kit pronto: componentes achados, repetidos somados, linha zerada ignorada", () => {
    const k = de("1001");
    expect(k.faltando).toEqual([]);
    expect(k.itens).toEqual([
      { componente_id: "anel", descricao: "Anel O-Ring 20mm", quantidade: 2.5, como: "codigo" },
      { componente_id: "junta", descricao: "Junta da Tampa", quantidade: 1, como: "sku" },
      { componente_id: "graxa", descricao: "Graxa Alimentícia", quantidade: 0.25, como: "descricao" },
      { componente_id: "retentor", descricao: "Retentor 35mm", quantidade: 1, como: "codigo" },
    ]);
  });

  it("falta item: lista o que não achou e mantém o que achou", () => {
    const k = de("1002");
    expect(k.faltando).toEqual([{ descricao: "Peça que não existe", sku: "XX-99", quantidade: 3 }]);
    expect(k.itens.map((i) => i.componente_id)).toEqual(["anel"]);
  });

  it("kit que leva ele mesmo guarda a quantidade em 'proprio' e não entra como componente", () => {
    expect(de("1006").proprio).toBe(10);
    expect(de("1006").itens.map((i) => i.componente_id)).toEqual(["anel"]);
  });

  it("paraGravar leva só kits com produto e itens", () => {
    const gravar = paraGravar(planos.filter((p) => p.situacao === "pronto" || p.situacao === "fabricado" || p.situacao === "fora_do_erp"));
    expect(gravar).toEqual([{
      kit_id: "k-vedacao",
      itens: [{ componente_id: "anel", quantidade: 2.5 }, { componente_id: "junta", quantidade: 1 }, { componente_id: "graxa", quantidade: 0.25 }, { componente_id: "retentor", quantidade: 1 }],
    }]);
  });
});
