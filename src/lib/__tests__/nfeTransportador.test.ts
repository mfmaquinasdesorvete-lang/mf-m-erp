import { describe, expect, it } from "vitest";
import { transportadorNfe } from "../../../supabase/functions/_shared/nfe-transportador";

describe("transportadora do pedido na NF-e (28/10)", () => {
  const t = { nome: "Expresso Exemplo Ltda", cnpj: "12.345.678/0001-90", inscricao_estadual: "123.456.789", logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "Joinville", uf: "sc" };
  it("vai para a nota quando há frete", () => {
    expect(transportadorNfe(0, t)).toEqual({
      nome_transportador: "Expresso Exemplo Ltda", cnpj_transportador: "12345678000190", inscricao_estadual_transportador: "123456789",
      endereco_transportador: "Rua A, 10, Centro", municipio_transportador: "Joinville", uf_transportador: "SC",
    });
  });
  it("sem frete (9) ou sem transportadora não manda nada", () => {
    expect(transportadorNfe(9, t)).toEqual({});
    expect(transportadorNfe(0, null)).toEqual({});
  });
});
