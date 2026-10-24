import { describe, expect, it } from "vitest";
import { contarGrupos, noGrupo } from "../grupoFuncionarios";

const p = (vinculo: string, situacao = "ativo", ativo = true) => ({ vinculo, situacao, ativo });

describe("cartões de Funcionários", () => {
  it("separa ativos, desligados, PJ, autônomos e afastados", () => {
    const lista = [p("clt"), p("pj"), p("autonomo"), p("clt", "afastado"), p("clt", "desligado"), p("pj", "desligado"), p("autonomo", "ativo", false)];
    expect(contarGrupos(lista)).toEqual({ equipe: 4, ex: 3, prestador: 1, sem_carteira: 1, inss: 1 });
  });
  it("desligado não conta como prestador nem sem carteira", () => {
    expect(noGrupo(p("pj", "desligado"), "prestador")).toBe(false);
    expect(noGrupo(p("autonomo", "desligado"), "sem_carteira")).toBe(false);
    expect(noGrupo(p("autonomo", "desligado"), "ex")).toBe(true);
  });
});
