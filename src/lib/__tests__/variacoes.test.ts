import { describe, expect, it } from "vitest";
import { erroVariacao, opcoesPai, variacoesPorPai } from "../variacoes";

const pai = { id: "p", descricao: "Kit de Borrachas O-Rings", agrupador: true };
const lista = [pai,
  { id: "a", descricao: "Kit de Borrachas O-Rings - 7 Sabores", produto_pai_id: "p", variacao: "7 Sabores" },
  { id: "b", descricao: "Kit de Borrachas O-Rings - 3 Sabores", produto_pai_id: "p", variacao: "3 Sabores" },
  { id: "c", descricao: "Kit antigo", produto_pai_id: "p", variacao: "5 Sabores", ativo: false }];

describe("variações", () => {
  it("agrupa as variações ativas do pai, em ordem", () => {
    expect(variacoesPorPai(lista).get("p")?.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("só produto pai ativo vira opção", () => {
    expect(opcoesPai(lista)).toEqual([{ value: "p", label: "Kit de Borrachas O-Rings" }]);
  });
});

describe("erroVariacao", () => {
  it("aceita variação de um pai e barra os erros", () => {
    expect(erroVariacao({ id: "b", produto_pai_id: "p" }, lista)).toBe("");
    expect(erroVariacao({ id: "p", produto_pai_id: "p" }, lista)).toMatch(/dele mesmo/);
    expect(erroVariacao({ id: "b", produto_pai_id: "a" }, lista)).toMatch(/Produto pai/);
    expect(erroVariacao({ id: "x", agrupador: true, produto_pai_id: "p" }, lista)).toMatch(/pai não pode/);
  });
});
