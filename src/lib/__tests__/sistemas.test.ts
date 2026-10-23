import { describe, expect, it } from "vitest";
import { CICLO_INOVACAO, DIMENSOES_ANALISE, ECL, interpretarEcl, SISTEMAS } from "../sistemas";

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

  it("todo comando tem entrega; MONITOR, ANALYZE e INNOVATE levam ao Monitor e às telas certas", () => {
    for (const c of ECL) expect(c.entrega.length).toBeGreaterThan(20);
    const m = interpretarEcl("monitor backup");
    expect(m.ok && m.destinos[0].to).toBe("/sobre?aba=monitor");
    const a = interpretarEcl("ANALYZE erp");
    expect(a.ok && a.comando.entrega).toMatch(/6 pontos/);
    expect(DIMENSOES_ANALISE.map((d) => d.nome)).toEqual(["Gargalos", "UX", "Desempenho", "Consistência", "Riscos", "Oportunidades"]);
    expect(CICLO_INOVACAO.map((d) => d.nome)).toEqual(["Pesquisa", "Tendências", "Testes", "MVP", "Validação", "Lançamento", "Melhoria"]);
    const i = interpretarEcl("INNOVATE ideias");
    expect(i.ok && i.destinos[0].to).toBe("/sobre?aba=ideias");
    expect(SISTEMAS.find((s) => s.id === "innovation-os")?.modulos.map((x) => x.nome)).toEqual(CICLO_INOVACAO.map((d) => d.nome));
    expect(SISTEMAS.find((s) => s.id === "ops-os")?.modulos.some((x) => x.nome === "Vigia com avisos" && x.situacao === "tem")).toBe(true);
  });

  it("explica o que deu errado", () => {
    expect(interpretarEcl("").ok).toBe(false);
    const x = interpretarEcl("DELETE tudo");
    expect(!x.ok && x.motivo).toMatch(/não existe/);
    const y = interpretarEcl("AUDIT churrasco");
    expect(!y.ok && y.motivo).toMatch(/funciona com/);
  });
});

describe("ECL: comandos novos", () => {
  it("TRACE maquina guarda o nº de série como foi digitado", () => {
    const r = interpretarEcl("TRACE maquina 050626366-01");
    expect(r.ok && r.alvo).toBe("maquina");
    expect(r.ok && r.argumento).toBe("050626366-01");
  });
  it("TRACE sem alvo procura o texto em tudo", () => {
    const r = interpretarEcl("trace Padaria Central");
    expect(r.ok && r.alvo).toBe(null);
    expect(r.ok && r.argumento).toBe("Padaria Central");
  });
  it("verbos novos e alvos novos", () => {
    for (const t of ["CHECK preventivas", "FORECAST caixa", "RECONCILE cartao", "COMPARE unidades", "PLAN producao", "CLEAN fornecedores", "REPORT socios",
      "AUDIT maquinas", "VISUALIZE licenciados", "ANALYZE compras", "MONITOR notas"]) {
      const r = interpretarEcl(t);
      expect(r.ok, t).toBe(true);
      expect(r.ok && r.alvo, t).toBe(t.split(" ")[1]);
    }
  });
  it("o alvo é a primeira palavra quando ela existe (MONITOR notas não vira outro alvo)", () => {
    const r = interpretarEcl("AUDIT estoque");
    expect(r.ok && r.alvo).toBe("estoque");
  });
});
