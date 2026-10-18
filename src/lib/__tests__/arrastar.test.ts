import { describe, expect, it } from "vitest";
import { moverNaLista, pelaOrdem } from "../arrastar";

describe("moverNaLista", () => {
  const l = ["a", "b", "c", "d"];
  it("põe antes do alvo, descendo", () => expect(moverNaLista(l, 0, 2)).toEqual(["b", "a", "c", "d"]));
  it("põe depois do alvo, descendo", () => expect(moverNaLista(l, 0, 2, true)).toEqual(["b", "c", "a", "d"]));
  it("põe antes do alvo, subindo", () => expect(moverNaLista(l, 3, 1)).toEqual(["a", "d", "b", "c"]));
  it("põe depois do alvo, subindo", () => expect(moverNaLista(l, 3, 1, true)).toEqual(["a", "b", "d", "c"]));
  it("vai para o fim", () => expect(moverNaLista(l, 1, 3, true)).toEqual(["a", "c", "d", "b"]));
  it("vai para o começo", () => expect(moverNaLista(l, 2, 0)).toEqual(["c", "a", "b", "d"]));
  it("solto nele mesmo ou fora da lista: nada muda", () => {
    expect(moverNaLista(l, 1, 1)).toBe(l);
    expect(moverNaLista(l, 5, 1)).toBe(l);
    expect(moverNaLista(l, 1, -1)).toBe(l);
  });
  it("não mexe na lista original", () => { moverNaLista(l, 0, 3, true); expect(l).toEqual(["a", "b", "c", "d"]); });
});

describe("pelaOrdem", () => {
  it("ordena pela ordem e deixa os sem ordem no fim, na ordem em que vieram", () => {
    const r = pelaOrdem([{ id: 1, ordem: null }, { id: 2, ordem: 1 }, { id: 3 }, { id: 4, ordem: 0 }, { id: 5, ordem: 1 }]);
    expect(r.map((x) => x.id)).toEqual([4, 2, 5, 1, 3]);
  });
});
