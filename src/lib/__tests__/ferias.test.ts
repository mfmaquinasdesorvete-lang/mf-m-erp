import { describe, expect, it } from "vitest";
import { feriasPendente, periodosFerias, periodosRecentes } from "../ferias";

describe("férias", () => {
  it("monta os períodos desde a admissão, com o limite de 12 meses depois", () => {
    const p = periodosFerias("2024-03-10", "2026-10-24");
    expect(p.map((x) => [x.inicio, x.fim, x.limite, x.situacao])).toEqual([
      ["2026-03-10", "2027-03-09", "2028-03-09", "em_aquisicao"],
      ["2025-03-10", "2026-03-09", "2027-03-09", "a_tirar"],
      ["2024-03-10", "2025-03-09", "2026-03-09", "vencida"],
    ]);
  });
  it("desconta os dias tirados e o abono, e avisa quando vence logo", () => {
    const p = periodosFerias("2024-11-01", "2026-10-24", [{ aquisitivo_inicio: "2024-11-01", inicio: "2026-01-05", dias: 20, abono_dias: 10 }]);
    expect(p.find((x) => x.inicio === "2024-11-01")).toMatchObject({ usados: 30, saldo: 0, situacao: "tirada" });
    const q = periodosFerias("2024-12-01", "2026-10-24", [{ aquisitivo_inicio: "2024-12-01", inicio: "2026-01-05", dias: 10 }]);
    expect(q.find((x) => x.inicio === "2024-12-01")).toMatchObject({ saldo: 20, situacao: "vence_logo", limite: "2026-11-30" });
  });
  it("para na saída e sem admissão não tem período", () => {
    expect(periodosFerias("2023-01-02", "2026-10-24", [], "2023-06-30")).toHaveLength(1);
    expect(periodosFerias(null, "2026-10-24")).toEqual([]);
  });
  it("pendência: a vencida vem antes da que vence logo", () => {
    expect(feriasPendente(periodosFerias("2024-03-10", "2026-10-24"))?.situacao).toBe("vencida");
    expect(feriasPendente(periodosFerias("2026-01-01", "2026-10-24"))).toBeNull();
  });
  it("recentes: em aquisição e os 2 últimos completos; os antigos sem registro ficam de fora", () => {
    const p = periodosFerias("2020-08-03", "2026-10-24");
    const r = periodosRecentes(p);
    expect(r.mostrar.map((x) => x.inicio)).toEqual(["2026-08-03", "2025-08-03", "2024-08-03"]);
    expect(r.antigos).toBe(4);
    expect(feriasPendente(r.mostrar)?.inicio).toBe("2024-08-03");
  });
});
