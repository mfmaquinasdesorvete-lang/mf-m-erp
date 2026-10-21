import { describe, expect, it } from "vitest";
import { chaveNome, filtrar, ordenarPorUso, repetidasPorNome, type Marca } from "../transportadoras";
import type { Transportadora } from "../types";

const t = (id: string, nome: string, extra: Partial<Transportadora> = {}) => ({ id, nome, nome_fantasia: null, ativo: true, ...extra }) as Transportadora;
const m = (x: Transportadora, filiais: Transportadora[] = []): Marca => ({ marca: x, filiais });

describe("transportadoras: repetidas, uso e rastreio", () => {
  it("nome-chave sem Ltda, Matriz, cidade e com Sedex/Correio = Correios", () => {
    expect(chaveNome("Bertolini Transportes -Ltda")).toBe("bertolini");
    expect(chaveNome("Via Pajuçara– Matriz")).toBe("via pajucara");
    expect(chaveNome("Sedex")).toBe("correios");
    expect(chaveNome("Correio")).toBe("correios");
    expect(chaveNome("J&T Express")).toBe("j&t");
  });
  it("acha os repetidos pelo nome (cada grupo uma vez)", () => {
    const l = [m(t("1", "Sedex")), m(t("2", "Sedex")), m(t("3", "Correios", { nome_fantasia: "Correios" })), m(t("4", "Jadlog"))];
    const g = repetidasPorNome(l);
    expect(g).toHaveLength(1);
    expect(g[0].map((x) => x.id).sort()).toEqual(["1", "2", "3"]);
  });
  it("mais usadas primeiro, contando as filiais", () => {
    const usos = new Map([["f1", 5], ["2", 3]]);
    const l = ordenarPorUso([m(t("2", "B")), m(t("1", "A"), [t("f1", "A SP")]), m(t("3", "C"))], usos);
    expect(l.map((x) => x.marca.id)).toEqual(["1", "2", "3"]);
    expect(filtrar(l, "usadas", usos)).toHaveLength(2);
  });
  it("sem rastreio não conta plataforma", () => {
    const l = [m(t("1", "A", { rastreio_url: "https://a" })), m(t("2", "B")), m(t("3", "Olist", { tipo: "plataforma" }))];
    expect(filtrar(l, "sem_rastreio").map((x) => x.marca.id)).toEqual(["2"]);
  });
});
