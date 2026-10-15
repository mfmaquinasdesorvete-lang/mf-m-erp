import { describe, expect, it } from "vitest";
import { repetidosProvaveis } from "../repetidos";

describe("repetidosProvaveis", () => {
  it("mesma cidade com um cadastro sem CNPJ", () => {
    const l = [
      { id: "a", municipio: "Cachoeirinha", uf: "RS", cnpj: "11222333000181" },
      { id: "b", municipio: "cachoeirinha", uf: "rs", cnpj: null },
      { id: "c", municipio: "Osasco", uf: "SP", cnpj: "11222333000262" },
      { id: "d", municipio: "Osasco", uf: "SP", cnpj: "11222333000343" },
    ];
    expect(repetidosProvaveis(l).map((g) => g.map((x) => x.id))).toEqual([["a", "b"]]);
  });
  it("dois CNPJs diferentes na mesma cidade são filiais distintas", () => {
    expect(repetidosProvaveis([{ municipio: "Osasco", uf: "SP", cnpj: "1" }, { municipio: "Osasco", uf: "SP", cnpj: "2" }, { municipio: "Osasco", uf: "SP", cnpj: null }])).toEqual([]);
  });
});
