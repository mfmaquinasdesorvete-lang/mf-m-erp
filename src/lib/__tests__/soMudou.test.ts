import { describe, expect, it } from "vitest";
import { soMudou } from "../soMudou";

describe("soMudou", () => {
  it("leva só o que mudou, com o id", () => {
    expect(soMudou({ id: "1", nome: "Novo", marcadores: ["a"], email: null }, { id: "1", nome: "Velho", marcadores: ["a"] }))
      .toEqual({ id: "1", nome: "Novo" });
  });
  it("lista e objeto comparados pelo conteúdo", () => {
    expect(soMudou({ id: "1", tags: ["x", "y"] }, { id: "1", tags: ["x"] })).toEqual({ id: "1", tags: ["x", "y"] });
    expect(soMudou({ id: "1", cfg: { a: 1 } }, { id: "1", cfg: { a: 1 } })).toBeNull();
  });
  it("nada mudou: null", () => {
    expect(soMudou({ id: "1", nome: "A" }, { id: "1", nome: "A", outro: 2 })).toBeNull();
  });
});
