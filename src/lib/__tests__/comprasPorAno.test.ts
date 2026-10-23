import { describe, expect, it } from "vitest";
import { comprasPorAno, type CompraCliente } from "../fichaCliente";

const c = (data: string, valor: number): CompraCliente => ({ data, valor, origem: "pedido", ref: data, itens: [] });

describe("comprasPorAno", () => {
  it("soma por ano, do mais antigo ao mais novo", () => {
    expect(comprasPorAno([c("2025-03-01", 100), c("2024-01-10", 50), c("2025-11-02", 20.5)]))
      .toEqual([{ ano: "2024", rotulo: "2024", valor: 50, n: 1 }, { ano: "2025", rotulo: "2025", valor: 120.5, n: 2 }]);
  });

  it("junta os anos mais antigos num pedaço só", () => {
    const r = comprasPorAno([c("2019-01-01", 10), c("2020-01-01", 20), c("2021-01-01", 30), c("2022-01-01", 40)], 2);
    expect(r).toEqual([
      { ano: "antes", rotulo: "Até 2020", valor: 30, n: 2 },
      { ano: "2021", rotulo: "2021", valor: 30, n: 1 },
      { ano: "2022", rotulo: "2022", valor: 40, n: 1 },
    ]);
  });

  it("sem compras, sem pedaços", () => expect(comprasPorAno([])).toEqual([]));
});
