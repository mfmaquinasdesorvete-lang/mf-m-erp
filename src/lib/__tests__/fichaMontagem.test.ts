import { describe, expect, it } from "vitest";
import { folhasDaFicha, pecasDaFicha, seriesDaOp } from "../fichaMontagem";

describe("ficha de montagem da OP", () => {
  it("separa os nºs de série digitados", () => {
    expect(seriesDaOp("031023315, 031023316;031023315\n 031023317 ")).toEqual(["031023315", "031023316", "031023317"]);
    expect(seriesDaOp(null)).toEqual([]);
  });

  it("uma folha por máquina; sem série, folha em branco", () => {
    expect(folhasDaFicha("A1, A2", 3)).toEqual(["A1", "A2", null]);
    expect(folhasDaFicha("A1, A2, A3", 1)).toEqual(["A1", "A2", "A3"]);
    expect(folhasDaFicha("", 0)).toEqual([null]);
  });

  it("lista as peças da ficha técnica da máquina", () => {
    const fichas = [
      { produto_id: "m", componente_id: "b", quantidade: 2 },
      { produto_id: "m", componente_id: "a", quantidade: 1 },
      { produto_id: "m", componente_id: "z", quantidade: 0 },
      { produto_id: "outra", componente_id: "a", quantidade: 5 },
    ];
    const produtos = [{ id: "a", descricao: "Compressor", sku: "C1", unidade: "UN" }, { id: "b", descricao: "Bico", sku: null, unidade: "UN" }];
    expect(pecasDaFicha(fichas, produtos, "m")).toEqual([
      { descricao: "Bico", codigo: null, quantidade: 2, unidade: "UN" },
      { descricao: "Compressor", codigo: "C1", quantidade: 1, unidade: "UN" },
    ]);
  });
});
