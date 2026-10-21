import { describe, expect, it } from "vitest";
import { setorDaOP, setorDoProduto } from "../setorProducao";

describe("setor da OP", () => {
  it("palpite pelo produto", () => {
    expect(setorDoProduto({ tipo: "maquina", descricao: "Máquina HG371" })).toBe("maquinas");
    expect(setorDoProduto({ tipo: "peca", descricao: "Eixo da pá batedora inox" })).toBe("tornearia");
    expect(setorDoProduto({ tipo: "peca", descricao: "Pá batedora MF-300" })).toBe("tornearia");
    expect(setorDoProduto({ tipo: "insumo", descricao: "Bucha de bronze" })).toBe("tornearia");
    expect(setorDoProduto({ tipo: "insumo", descricao: "Conjunto redutor montado" })).toBe("mecanica");
    expect(setorDoProduto(null)).toBe("mecanica");
  });
  it("o setor gravado vale mais que o palpite", () => {
    expect(setorDaOP({ setor: "mecanica", produto: { tipo: "peca", descricao: "Eixo" } })).toBe("mecanica");
    expect(setorDaOP({ setor: null, produto: { tipo: "peca", descricao: "Eixo" } })).toBe("tornearia");
    expect(setorDaOP({ setor: "outro", produto: { tipo: "maquina" } })).toBe("maquinas");
  });
});
