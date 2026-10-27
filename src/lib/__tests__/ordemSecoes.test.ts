import { describe, expect, it } from "vitest";
import { ordenarSecoes } from "@/components/Secoes";

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
