import { describe, expect, it } from "vitest";
import { ultimasCompras } from "../maquinas";

describe("ultimasCompras", () => {
  it("as 2 mais novas, sem repetir a mesma nota e sem o que não é compra", () => {
    const l = [
      { evento: "compra", data: "2026-01-10T10:00:00Z", detalhe: "NF 1 · A", valor_unitario: 10 },
      { evento: "alteracao", data: "2026-05-01T10:00:00Z", detalhe: null, valor_unitario: null },
      { evento: "compra", data: "2026-03-05T10:00:00Z", detalhe: "NF 2 · B", valor_unitario: 12 },
      { evento: "compra", data: "2026-03-05T10:00:00Z", detalhe: "NF 2 · B", valor_unitario: 12 },
      { evento: "compra", data: "2026-02-01T10:00:00Z", detalhe: "NF 3 · A", valor_unitario: 11 },
    ];
    expect(ultimasCompras(l)).toEqual([{ data: "2026-03-05", detalhe: "NF 2 · B", valor: 12 }, { data: "2026-02-01", detalhe: "NF 3 · A", valor: 11 }]);
  });
});
