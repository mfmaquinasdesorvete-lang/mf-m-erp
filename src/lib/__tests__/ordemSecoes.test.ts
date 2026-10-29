import { describe, expect, it } from "vitest";
import { escreverOrdem, lerItemOrdem, ordenarSecoes } from "@/components/Secoes";

const s = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (l: { id: string }[]) => l.map((x) => x.id).join(",");

describe("ordem das seções", () => {
  it("sem ordem salva fica a padrão", () => {
    expect(ids(ordenarSecoes(s("a", "b", "c"), null))).toBe("a,b,c");
  });
  it("aplica a ordem salva", () => {
    expect(ids(ordenarSecoes(s("a", "b", "c"), ["c", "a", "b"]))).toBe("c,a,b");
  });
  it("seção nova entra logo depois da que vinha antes dela no padrão", () => {
    expect(ids(ordenarSecoes(s("a", "b", "n", "c"), ["c", "b", "a"]))).toBe("c,b,n,a");
    expect(ids(ordenarSecoes(s("n", "a", "b"), ["b", "a"]))).toBe("n,b,a");
  });
  it("ignora seção que não existe mais", () => {
    expect(ids(ordenarSecoes(s("a", "b"), ["x", "b", "a"]))).toBe("b,a");
  });
});

describe("largura das seções (29/10)", () => {
  const sec = (id: string, largo = false) => ({ id, largo });
  it("lê o item com e sem largura", () => {
    expect(lerItemOrdem("a")).toEqual({ id: "a" });
    expect(lerItemOrdem("a|largo")).toEqual({ id: "a", largo: true });
    expect(lerItemOrdem("a|meia")).toEqual({ id: "a", largo: false });
  });
  it("aplica a largura salva e mantém a do código quando não tem", () => {
    const r = ordenarSecoes([sec("a", true), sec("b"), sec("c")], ["b|largo", "a|meia", "c"]);
    expect(r.map((s) => `${s.id}:${s.largo}`).join()).toBe("b:true,a:false,c:false");
  });
  it("grava a largura só onde mudou do código", () => {
    expect(escreverOrdem(["b", "a", "c"], { a: false, b: true, c: false }, { a: true, b: false, c: false })).toEqual(["b|largo", "a|meia", "c"]);
  });
});
