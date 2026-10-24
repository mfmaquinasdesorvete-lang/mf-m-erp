import { describe, expect, it } from "vitest";
import { controlePorPessoa, type ItemControle } from "@/lib/controlePessoal";

const i = (id: string, pessoa: string, valor: number, encerrado = false, data: string | null = null): ItemControle =>
  ({ id, pessoa, descricao: "x", valor, data, origem: null, encerrado });

describe("controlePorPessoa", () => {
  it("soma só os abertos, por pessoa, a maior primeiro", () => {
    const r = controlePorPessoa([i("1", "Ana", 100.1, false, "2026-01-02"), i("2", "Ana ", 0.2, false, "2026-03-01"), i("3", "Ana", 50, true), i("4", "Bia", 500)]);
    expect(r.map((g) => [g.pessoa, g.total, g.itens.length, g.encerrados.length])).toEqual([["Bia", 500, 1, 0], ["Ana", 100.3, 2, 1]]);
    expect(r[1].itens[0].id).toBe("2");
  });
});
