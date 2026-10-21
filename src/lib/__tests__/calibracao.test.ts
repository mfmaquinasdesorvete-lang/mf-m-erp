import { describe, expect, it } from "vitest";
import { diasParaCalibrar, ordenarInstrumentos, proximaCalibracao, rotuloFrequencia, situacaoCalibracao } from "../calibracao";

describe("calibração dos instrumentos (REG-005)", () => {
  it("próxima = última + frequência, com fim de mês", () => {
    expect(proximaCalibracao("2025-03-14", 24)).toBe("2027-03-14");
    expect(proximaCalibracao("2025-08-11", 12)).toBe("2026-08-11");
    expect(proximaCalibracao("2024-08-31", 6)).toBe("2025-02-28");
    expect(proximaCalibracao("2025-11-30", 3)).toBe("2026-02-28");
  });
  it("situação pela data de hoje", () => {
    expect(situacaoCalibracao({ proxima_em: "2025-07-01" }, "2026-10-21")).toBe("vencida");
    expect(situacaoCalibracao({ proxima_em: "2026-11-20" }, "2026-10-21")).toBe("perto");
    expect(situacaoCalibracao({ proxima_em: "2027-03-14" }, "2026-10-21")).toBe("ok");
    expect(situacaoCalibracao({ proxima_em: null }, "2026-10-21")).toBe("sem_data");
    expect(diasParaCalibrar({ proxima_em: "2026-10-31" }, "2026-10-21")).toBe(10);
  });
  it("ordena vencidas primeiro e rotula a frequência", () => {
    const l = ordenarInstrumentos([{ codigo: "B", proxima_em: "2027-01-01" }, { codigo: "A", proxima_em: null }, { codigo: "C", proxima_em: "2025-07-01" }]);
    expect(l.map((x) => x.codigo)).toEqual(["C", "B", "A"]);
    expect(rotuloFrequencia(24)).toBe("Bianual");
    expect(rotuloFrequencia(18)).toBe("A cada 18 meses");
  });
});
