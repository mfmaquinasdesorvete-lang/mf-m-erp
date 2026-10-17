import { describe, expect, it } from "vitest";
import { RODADA_ATUAL } from "../rodada";

describe("rodada", () => {
  it("cada pergunta diz o que segura e cada suposição diz como conferir", () => {
    for (const f of RODADA_ATUAL.faltas) expect(f.bloqueia.length).toBeGreaterThan(3);
    for (const s of RODADA_ATUAL.suposicoes) {
      expect(["alto", "medio", "baixo"]).toContain(s.risco);
      expect(s.conferir.length).toBeGreaterThan(3);
    }
    for (const r of RODADA_ATUAL.riscos) expect(r.prevencao.length).toBeGreaterThan(3);
  });

  it("não traz valores em reais (os números da empresa vêm do banco)", () => {
    expect(JSON.stringify(RODADA_ATUAL)).not.toMatch(/R\$\s*\d/);
  });
});
