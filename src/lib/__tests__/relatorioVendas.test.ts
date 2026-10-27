import { describe, expect, it } from "vitest";
import { resumoVendas, type VendaRel } from "../relatorioVendas";

const v = (p: Partial<VendaRel>): VendaRel => ({
  numero: 1, created_at: "2026-10-05T15:00:00Z", status: "faturado", cliente: "C", vendedor: "Ana", valor_total: 1000, frete: 100,
  itens: [{ produto_id: "a", quantidade: 2 }], ...p,
});

describe("relatório de vendas do período", () => {
  const custo = (id: string) => (id === "a" ? 200 : null);
  const mes = { de: "2026-10-01", ate: "2026-10-31" };

  it("soma só as vendas do período (sem orçamento e cancelada) e calcula o lucro", () => {
    const r = resumoVendas([
      v({ numero: 1 }),
      v({ numero: 2, created_at: "2026-10-06T12:00:00Z", valor_total: 500, frete: 0, itens: [{ produto_id: "b", quantidade: 1 }] }),
      v({ numero: 3, status: "orcamento" }),
      v({ numero: 4, status: "cancelado" }),
      v({ numero: 5, created_at: "2026-09-30T12:00:00Z" }),
    ], mes, custo);
    expect(r.qtd).toBe(2);
    expect(r.total).toBe(1500);
    expect(r.linhas[0].lucro).toBe(500); // 1000 − 100 de frete − 2 × 200
    expect(r.lucro).toBe(1000);
    expect(r.frete).toBe(100);
    expect(r.itensSemCusto).toBe(1);
    expect(r.ticket).toBe(750);
    expect(r.porDia).toEqual([{ dia: "2026-10-05", valor: 1000 }, { dia: "2026-10-06", valor: 500 }]);
  });

  it("usa o dia de Brasília", () => {
    const r = resumoVendas([v({ created_at: "2026-11-01T02:00:00Z" })], mes, custo);
    expect(r.linhas[0].dia).toBe("2026-10-31");
  });
});
