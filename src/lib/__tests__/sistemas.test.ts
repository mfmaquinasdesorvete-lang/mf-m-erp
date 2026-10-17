import { describe, expect, it } from "vitest";
import { ECL, interpretarEcl, SISTEMAS } from "../sistemas";

describe("sistemas", () => {
  it("cada módulo tem situação e as telas começam por /", () => {
    for (const s of SISTEMAS) for (const m of s.modulos) {
      expect(["tem", "parcial", "falta"]).toContain(m.situacao);
      for (const t of m.telas) expect(t.to.startsWith("/")).toBe(true);
      if (m.situacao !== "falta") expect(m.telas.length).toBeGreaterThan(0);
    }
    expect(SISTEMAS.find((s) => s.id === "analytics-os")?.modulos.map((m) => m.nome))
      .toEqual(["KPIs", "Dashboards", "BI", "Previsões", "Alertas", "IA analítica", "Benchmarking", "Tendências"]);
    // a vitrine só mostra o que o ERP já faz
    expect(SISTEMAS.find((s) => s.id === "capability-showcase")?.modulos.every((m) => m.situacao === "tem")).toBe(true);
  });

  it("lê os comandos do ECL com ou sem alvo, em maiúscula ou minúscula", () => {
    const a = interpretarEcl("AUDIT financeiro");
    expect(a.ok && a.alvo).toBe("financeiro");
    expect(a.ok && a.destinos[0].to).toBe("/auditoria");
    const b = interpretarEcl("improve cadastro de peças");
    expect(b.ok && b.alvo).toBe("produtos");
    const c = interpretarEcl("audit");
    expect(c.ok && c.destinos.length).toBe(ECL[0].alvos.flatMap((x) => x.destinos).length);
    const pa = interpretarEcl("AUDIT parcelamentos");
    expect(pa.ok && pa.destinos[0].to).toBe("/parcelamentos");
    const v = interpretarEcl("VISUALIZE rodada");
    expect(v.ok && v.destinos[0].to).toBe("/sobre?aba=rodada");
  });

  it("explica o que deu errado", () => {
    expect(interpretarEcl("").ok).toBe(false);
    const x = interpretarEcl("DELETE tudo");
    expect(!x.ok && x.motivo).toMatch(/não existe/);
    const y = interpretarEcl("AUDIT churrasco");
    expect(!y.ok && y.motivo).toMatch(/funciona com/);
  });
});
