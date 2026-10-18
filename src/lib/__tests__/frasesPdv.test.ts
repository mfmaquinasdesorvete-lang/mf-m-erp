import { describe, expect, it } from "vitest";
import { FRASES_PDV, outraFrase } from "../frasesPdv";

describe("frases do PDV", () => {
  it("todas têm texto e autor, sem repetir", () => {
    expect(FRASES_PDV.every((f) => f.texto.length > 5 && f.autor.length > 2)).toBe(true);
    expect(new Set(FRASES_PDV.map((f) => f.texto)).size).toBe(FRASES_PDV.length);
  });
  it("sorteia sempre uma frase diferente da atual", () => {
    for (const s of [0, 0.3, 0.999]) for (const atual of [0, 5, FRASES_PDV.length - 1]) {
      const n = outraFrase(atual, FRASES_PDV.length, () => s);
      expect(n).not.toBe(atual);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(FRASES_PDV.length);
    }
  });
});
