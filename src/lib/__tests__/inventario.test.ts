import { describe, expect, it } from "vitest";
import { acuracidade, curvaABC, giroEstoque, situacaoDupla, sorteioDoDia, type ItemInventario } from "../inventario";

const it_ = (id: string, custo: number, saldo: number, vendido12m: number, ultimaContagem: string | null = null): ItemInventario => ({ id, custo, saldo, vendido12m, ultimaContagem });

describe("curva ABC e sorteio do dia", () => {
  const itens = [it_("motor", 1000, 5, 40), it_("pa", 50, 20, 30), it_("parafuso", 0.5, 500, 200), it_("velho", 80, 3, 0, "2026-10-10"), it_("zerado", 10, 0, 0)];
  it("o que mais gira é A", () => {
    const c = curvaABC(itens);
    expect(c.get("motor")).toBe("A");
    expect(c.get("parafuso")).toBe("C");
  });
  it("sorteia os atrasados, A primeiro, e é o mesmo no mesmo dia", () => {
    const s = sorteioDoDia(itens, "2026-10-20", 3);
    expect(s.map((x) => x.id)).toEqual(sorteioDoDia(itens, "2026-10-20", 3).map((x) => x.id));
    expect(s[0].id).toBe("motor");
    expect(s.map((x) => x.id)).not.toContain("velho"); // contado há 10 dias: ainda no prazo
    expect(s.map((x) => x.id)).not.toContain("zerado"); // sem saldo nem venda
  });
});

describe("dupla contagem", () => {
  it("só bate com as duas iguais", () => {
    expect(situacaoDupla(null, null)).toBe("falta1");
    expect(situacaoDupla(3, null)).toBe("falta2");
    expect(situacaoDupla(3, 3)).toBe("bate");
    expect(situacaoDupla(3, 4)).toBe("recontar");
  });
});

describe("acuracidade e giro", () => {
  it("acuracidade pelos itens contados sem ajuste", () => {
    const a = acuracidade([
      { status: "concluida", contados: 40, ajustes: 2, concluida_em: "2026-10-15" },
      { status: "concluida", contados: 10, ajustes: 0, concluida_em: "2026-10-18" },
      { status: "aberta", contados: null },
      { status: "concluida", contados: 50, ajustes: 50, concluida_em: "2026-01-01" },
    ], "2026-07-22");
    expect(a).toEqual({ contagens: 2, contados: 50, certos: 48, pct: 96 });
  });
  it("giro e valor parado", () => {
    const g = giroEstoque([it_("a", 100, 10, 40), it_("b", 50, 4, 0)]);
    expect(g.valorEstoque).toBe(1200);
    expect(g.giro).toBe(3.3);
    expect(g.parados).toBe(1);
    expect(g.valorParado).toBe(200);
    expect(g.diasDeEstoque).toBe(110);
  });
});
