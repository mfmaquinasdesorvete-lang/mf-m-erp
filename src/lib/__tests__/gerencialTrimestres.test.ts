import { describe, expect, it } from "vitest";
import { trimestresDoAno, type Venda } from "../gerencial";

const v = (data: string, valor: number): Venda => ({ data, valor, origem: "pedido", ref: data, itens: [], cliente: "c", clienteNome: "C", clienteId: "c" });

describe("trimestresDoAno", () => {
  const vendas = [
    v("2026-01-10", 100), v("2026-03-31", 50), v("2026-05-02", 200), v("2026-10-05", 70), v("2026-10-30", 999),
    v("2025-02-01", 80), v("2025-06-30", 100), v("2025-10-10", 40), v("2025-10-25", 500), v("2025-12-01", 300),
  ];
  const t = trimestresDoAno(vendas, "2026-10-22");

  it("soma cada trimestre do ano até hoje", () => {
    expect(t.map((x) => x.atual)).toEqual([150, 200, 0, 70]);
  });

  it("compara com o mesmo trimestre do ano passado; o em curso só até o mesmo dia", () => {
    expect(t.map((x) => x.anterior)).toEqual([80, 100, 0, 40]);
    expect(t[0].variacao).toBe(87.5);
    expect(t[3].variacao).toBe(75);
  });

  it("trimestre que ainda não começou fica zerado", () => {
    expect(trimestresDoAno(vendas, "2026-05-10")[3]).toEqual({ trimestre: 4, atual: 0, anterior: 0, variacao: null });
  });
});
