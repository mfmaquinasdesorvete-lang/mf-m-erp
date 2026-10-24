import { describe, expect, it } from "vitest";
import { nomeComVariacao, opcoesPai, variacoesPorPai } from "../variacoes";

const pai = { id: "p", descricao: "Kit de Borrachas O-Rings", agrupador: true };
const lista = [pai,
  { id: "a", descricao: "Kit de Borrachas O-Rings - 7 Sabores", produto_pai_id: "p", variacao: "7 Sabores" },
  { id: "b", descricao: "Kit de Borrachas O-Rings - 3 Sabores", produto_pai_id: "p", variacao: "3 Sabores" },
  { id: "c", descricao: "Kit antigo", produto_pai_id: "p", variacao: "5 Sabores", ativo: false }];

describe("variações", () => {
  it("agrupa as variações ativas do pai, em ordem", () => {
    expect(variacoesPorPai(lista).get("p")?.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("monta o nome completo sem repetir a variação", () => {
    expect(nomeComVariacao(pai, { descricao: "Kit de Borrachas O-Rings - 3 Sabores", variacao: "3 Sabores" })).toBe("Kit de Borrachas O-Rings - 3 Sabores");
    expect(nomeComVariacao(pai, { descricao: "Kit O-Rings", variacao: "A 200" })).toBe("Kit de Borrachas O-Rings - A 200");
  });
  it("só produto pai ativo vira opção", () => {
    expect(opcoesPai(lista)).toEqual([{ value: "p", label: "Kit de Borrachas O-Rings" }]);
  });
});
