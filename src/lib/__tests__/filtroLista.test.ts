import { describe, expect, it } from "vitest";
import { diaLocal, noPeriodo, rotuloPeriodo, SEM_PERIODO, somar } from "../filtroLista";

describe("período das listas", () => {
  it("usa o dia de Brasília para data e hora", () => {
    expect(diaLocal("2026-09-28")).toBe("2026-09-28");
    expect(diaLocal("2026-09-29T01:30:00Z")).toBe("2026-09-28"); // 22h30 do dia 28 em Brasília
    expect(diaLocal("2026-09-29T12:00:00Z")).toBe("2026-09-29");
    expect(diaLocal(null)).toBe("");
  });
  it("filtra de/até, só de ou só até", () => {
    const p = { de: "2026-09-01", ate: "2026-09-30" };
    expect(noPeriodo("2026-09-01", p)).toBe(true);
    expect(noPeriodo("2026-09-30T23:00:00-03:00", p)).toBe(true);
    expect(noPeriodo("2026-10-01T01:00:00-03:00", p)).toBe(false);
    expect(noPeriodo("2026-08-31", { de: "2026-09-01", ate: "" })).toBe(false);
    expect(noPeriodo("2026-08-31", { de: "", ate: "2026-09-01" })).toBe(true);
    expect(noPeriodo(null, p)).toBe(false);
    expect(noPeriodo(null, SEM_PERIODO)).toBe(true);
  });
  it("rótulo do botão de período", () => {
    const hoje = "2026-10-16";
    expect(rotuloPeriodo(SEM_PERIODO, hoje)).toBe("Qualquer data");
    expect(rotuloPeriodo({ de: "2026-10-01", ate: "2026-10-16" }, hoje)).toBe("Este mês");
    expect(rotuloPeriodo({ de: "2026-09-01", ate: "2026-09-30" }, hoje)).toBe("Mês passado");
    expect(rotuloPeriodo({ de: "2026-08-03", ate: "2026-08-20" }, hoje)).toBe("03/08/2026 a 20/08/2026");
    expect(rotuloPeriodo({ de: "2026-08-03", ate: "" }, hoje)).toBe("Desde 03/08/2026");
    expect(rotuloPeriodo({ de: "", ate: "2026-08-20" }, hoje)).toBe("Até 20/08/2026");
  });
});

describe("soma da lista", () => {
  it("soma em centavos (sem erro de arredondamento) e aceita texto do banco", () => {
    expect(somar([{ v: 0.1 }, { v: 0.2 }], (x) => x.v)).toBe(0.3);
    expect(somar([{ v: "1923.41" }, { v: "64.76" }, { v: null }], (x) => x.v)).toBe(1988.17);
    expect(somar([], () => 1)).toBe(0);
  });
});

import { noPeriodoOuPendente, semanaAtual } from "../filtroLista";
describe("listas abrem na semana", () => {
  it("semana de segunda a domingo", () => {
    expect(semanaAtual("2026-10-20")).toEqual({ de: "2026-10-19", ate: "2026-10-25" }); // terça
    expect(semanaAtual("2026-10-19")).toEqual({ de: "2026-10-19", ate: "2026-10-25" }); // segunda
    expect(semanaAtual("2026-10-25")).toEqual({ de: "2026-10-19", ate: "2026-10-25" }); // domingo
    expect(semanaAtual("2026-11-01")).toEqual({ de: "2026-10-26", ate: "2026-11-01" }); // vira o mês
  });
  it("pendente de antes da semana continua na lista", () => {
    const p = { de: "2026-10-19", ate: "2026-10-25" };
    expect(noPeriodoOuPendente("2026-10-10", p, true)).toBe(true);
    expect(noPeriodoOuPendente("2026-10-10", p, false)).toBe(false);
    expect(noPeriodoOuPendente("2026-11-10", p, true)).toBe(false);
    expect(noPeriodoOuPendente("2026-10-21", p, false)).toBe(true);
  });
});
