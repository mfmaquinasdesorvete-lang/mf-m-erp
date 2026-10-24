import { describe, expect, it } from "vitest";
import { resumoCrown, soDaCrown } from "../crown";

const p = (id: string, vinculo: string, epoca_crown: boolean, situacao = "desligado") => ({ id, vinculo, situacao, ativo: situacao !== "desligado", epoca_crown });

describe("época Crown", () => {
  it("separa com e sem carteira e soma o que cada um recebeu, em centavos", () => {
    const r = resumoCrown([p("a", "clt", true), p("b", "autonomo", true), p("c", "clt", false)], [
      { funcionario_id: "a", competencia: "2023-02-01", tipo: "salario", valor: 1000.1 },
      { funcionario_id: "a", competencia: "2023-01-01", tipo: "por_fora", valor: 200.2 },
      { funcionario_id: "b", competencia: "2023-10-01", tipo: "por_fora", valor: 500 },
      { funcionario_id: "c", competencia: "2023-10-01", tipo: "salario", valor: 999 },
    ]);
    expect([r.pessoas, r.comCarteira, r.semCarteira, r.total]).toEqual([2, 1, 1, 1700.3]);
    const a = r.linhas.find((l) => l.f.id === "a")!;
    expect([a.total, a.porTipo, a.primeiro, a.ultimo]).toEqual([1200.3, { salario: 1000.1, por_fora: 200.2 }, "2023-01", "2023-02"]);
  });
  it("só sai da equipe atual quem passou pela Crown e já foi desligado", () => {
    expect(soDaCrown(p("a", "clt", true))).toBe(true);
    expect(soDaCrown(p("r", "autonomo", true, "ativo"))).toBe(false);
    expect(soDaCrown(p("c", "clt", false))).toBe(false);
  });
  it("autônomo hoje que teve folha na Crown conta como com carteira", () => {
    const r = resumoCrown([p("r", "autonomo", true, "ativo"), p("l", "autonomo", true)], [
      { funcionario_id: "r", competencia: "2023-01-01", tipo: "salario", valor: 2000 },
      { funcionario_id: "l", competencia: "2023-10-01", tipo: "por_fora", valor: 1900 },
      { funcionario_id: "l", competencia: "2023-11-01", tipo: "decimo", valor: 200 },
    ]);
    expect([r.comCarteira, r.semCarteira]).toEqual([1, 1]);
  });
});
