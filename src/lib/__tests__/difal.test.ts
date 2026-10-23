import { describe, expect, it } from "vitest";
import { difalPorEstado, guiasOutrosEstados, type LinhaDifal } from "../difal";

const l = (uf: string, grupo: LinhaDifal["grupo"], emissao: string, valor: number, est: number): LinhaDifal =>
  ({ nota_id: `${uf}${emissao}${valor}`, numero: "1", emissao, unidade_id: null, uf, grupo, valor, difal_destacado: 0, difal_estimado: est });

describe("difalPorEstado", () => {
  const r = difalPorEstado([
    l("SP", "sem_ie", "2026-09-29", 300, 18), l("SP", "sem_ie", "2026-08-10", 200, 12), l("SP", "sem_ie", "2024-09-21", 80000, 14400),
    l("MG", "sem_ie", "2026-01-22", 356, 21.37), l("MG", "ie_baixada", "2026-01-22", 1760, 105.59), l("RJ", "isento", "2025-04-24", 16500, 1650),
  ], "2026-10-23");
  it("separa os últimos 12 meses do total e conta os meses com venda", () => {
    const sp = r.estados.find((e) => e.uf === "SP")!;
    expect([sp.notas12, sp.valor12, sp.estimado12, sp.meses12]).toEqual([2, 500, 30, 2]);
    expect([sp.notas, sp.estimado]).toEqual([3, 14430]);
  });
  it("isento e IE baixada ficam à parte do DIFAL certo", () => {
    const mg = r.estados.find((e) => e.uf === "MG")!;
    expect([mg.notas, mg.outrosNotas, mg.outrosEstimado]).toEqual([1, 1, 105.59]);
    expect(r.total.estimado).toBe(14451.37);
    expect(r.grupos.find((g) => g.grupo === "isento")).toMatchObject({ notas: 1, estimado: 1650 });
  });
  it("ordena pelo DIFAL dos 12 meses", () => expect(r.estados[0].uf).toBe("SP"));
});

describe("guiasOutrosEstados", () => {
  it("pega GNRE e secretarias de fora de SC, não o DARE de SC", () => {
    const g = guiasOutrosEstados([
      { descricao: "Governo Do Estado Do Amazonas", categoria: "impostos", valor: 77.19, status: "pago" },
      { descricao: "SECRETARIA DA FAZENDA DO ESTADO DO CEARA · Transferência", categoria: "impostos", valor: 14.87, status: "pago" },
      { descricao: "GNRE DIFAL BA", categoria: null, valor: 50, status: "pago" },
      { descricao: "DARE SANTA CATARINA · Pagamento efetuado", categoria: "impostos", valor: 900, status: "pago" },
      { descricao: "Secretaria De Estado Da Fazenda", categoria: "impostos", valor: 168, status: "aberto" },
    ]);
    expect(g).toEqual({ quantidade: 3, valor: 142.06 });
  });
});
