import { describe, expect, it } from "vitest";
import { agruparHistorico, dataHoraBR, DESTAQUES, diaHoraBrasilia, numeroVersao, versoesDoHistorico } from "../atualizacoes";
import { SOBRE_AREAS, SOBRE_TELAS } from "../modulos";
import menu from "../menu.ts?raw";

const linha = (hash: string, iso: string, texto: string) => `${hash}\x1f${iso}\x1f${texto}\x1e\n`;

describe("versões dia a dia", () => {
  it("dia e hora de Brasília", () => {
    expect(diaHoraBrasilia("2026-10-17T01:30:00Z")).toEqual({ dia: "2026-10-16", hora: "22:30" });
    expect(diaHoraBrasilia("2026-10-16T16:55:12-03:00")).toEqual({ dia: "2026-10-16", hora: "16:55" });
    expect(dataHoraBR("2026-10-16T19:55:12Z")).toBe("16/10/2026 16:55");
  });

  it("agrupa as mudanças por dia (Brasília), em ordem, e ignora linhas quebradas", () => {
    const saida = linha("c3", "2026-10-16T19:55:00Z", "Vendas: soma no rodapé")
      + linha("b2", "2026-10-09T02:30:00Z", "Financeiro: DRE") // 23h30 do dia 8 em Brasília
      + linha("a1", "2026-10-08T18:04:00Z", "ERP Line: código completo")
      + "lixo sem separador\x1e"
      + linha("d4", "2026-10-16T20:10:00Z", "Texto com \x1f no meio");
    const h = agruparHistorico(saida);
    expect(h.map((d) => d.dia)).toEqual(["2026-10-08", "2026-10-16"]);
    expect(h[0].mudancas.map((m) => m.hash)).toEqual(["a1", "b2"]);
    expect(h[0].mudancas[1]).toEqual({ hash: "b2", hora: "23:30", texto: "Financeiro: DRE" });
    expect(h[1].mudancas[1].texto).toBe("Texto com no meio");
    expect(numeroVersao(h)).toBe("1.2.2");
    expect(numeroVersao([])).toBe("");
  });

  it("versões da mais nova para a mais antiga, com os destaques do dia", () => {
    const h = agruparHistorico(linha("a1", "2026-10-08T18:04:00Z", "x") + linha("b2", "2026-10-09T13:00:00Z", "y"));
    const v = versoesDoHistorico(h);
    expect(v.map((x) => [x.numero, x.dia])).toEqual([["1.2", "2026-10-09"], ["1.1", "2026-10-08"]]);
    expect(v[1].titulo).toBe(DESTAQUES["2026-10-08"].titulo);
    // sem histórico (montagem sem git): só os destaques
    const so = versoesDoHistorico([]);
    expect(so.length).toBe(Object.keys(DESTAQUES).length);
    expect(so[so.length - 1]).toMatchObject({ numero: "1.1", dia: "2026-10-08", mudancas: [] });
  });
});

describe("página Módulos", () => {
  it("toda tela e área do menu tem o texto do que faz", () => {
    const rotas = [...menu.matchAll(/\{ to: "([^"]+)", tela:/g)].map((m) => m[1]);
    const areas = [...menu.matchAll(/id: "([a-z]+)", titulo:/g)].map((m) => m[1]);
    expect(rotas.length).toBeGreaterThan(40);
    expect(rotas.filter((r) => !SOBRE_TELAS[r])).toEqual([]);
    expect(areas.filter((a) => !SOBRE_AREAS[a])).toEqual([]);
  });
});
