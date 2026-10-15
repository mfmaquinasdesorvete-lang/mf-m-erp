import { describe, expect, it } from "vitest";
import { ordenarCompras, type CompraAnterior } from "@/components/compras/UltimasCompras";

const c = (x: Partial<CompraAnterior>): CompraAnterior => ({
  tipo: "nota", numero: "1", ref_id: "r", data: "2026-01-01", descricao: "Item", quantidade: 1, unidade: "UN", valor_unitario: 1, fornecedor: null, produto_id: null, ...x,
});

describe("últimas compras: ordenar as colunas", () => {
  const lista = [
    c({ descricao: "Redutor", numero: "49129", data: "2026-06-02", valor_unitario: 447.83 }),
    c({ descricao: "Motor", numero: "222", data: "2026-04-27", valor_unitario: 1096.1, tipo: "pedido" }),
    c({ descricao: "Flange", numero: "45627", data: "2026-03-30", valor_unitario: 51.4 }),
  ];
  it("data mais nova primeiro", () => {
    expect(ordenarCompras(lista, "data", false).map((x) => x.descricao)).toEqual(["Redutor", "Motor", "Flange"]);
  });
  it("número pelo valor (não como texto)", () => {
    expect(ordenarCompras(lista, "numero", true).map((x) => x.numero)).toEqual(["222", "45627", "49129"]);
  });
  it("valor e descrição", () => {
    expect(ordenarCompras(lista, "valor_unitario", false)[0].descricao).toBe("Motor");
    expect(ordenarCompras(lista, "descricao", true).map((x) => x.descricao)).toEqual(["Flange", "Motor", "Redutor"]);
  });
});
