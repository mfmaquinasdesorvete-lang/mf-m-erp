import { describe, expect, it } from "vitest";
import { colunasDoQuadro } from "../../components/vendas/KanbanVendas";

const v = (id: string, status: string, created_at: string, valor_total: number) => ({ id, status, created_at, valor_total });

describe("quadro das vendas", () => {
  it("uma coluna por passo, as mais novas primeiro, com o total e o que ficou de fora", () => {
    const vendas = [
      v("a", "orcamento", "2026-10-01", 100), v("b", "orcamento", "2026-10-05", 50.5),
      v("c", "faturado", "2026-10-02", 300), v("d", "entregue", "2026-09-01", 10), v("e", "entregue", "2026-09-03", 20),
      v("f", "entregue", "2026-09-02", 30), v("g", "cancelado", "2026-10-03", 999),
    ];
    const cols = colunasDoQuadro(vendas, 2);
    expect(cols.map((c) => c.id)).toEqual(["orcamento", "aprovado", "faturado", "entregue", "cancelado"]);
    const [orc, apr, fat, ent, can] = cols;
    expect(orc.lista.map((x) => x.id)).toEqual(["b", "a"]);
    expect(orc).toMatchObject({ n: 2, total: 150.5, fora: 0 });
    expect(apr).toMatchObject({ n: 0, total: 0, fora: 0 });
    expect(fat.lista.map((x) => x.id)).toEqual(["c"]);
    // entregues: 3 vendas, o quadro mostra as 2 mais novas e o resto fica na lista
    expect(ent.lista.map((x) => x.id)).toEqual(["e", "f"]);
    expect(ent).toMatchObject({ n: 3, total: 60, fora: 1 });
    expect(can).toMatchObject({ n: 1, total: 999, passo: null });
  });
});
