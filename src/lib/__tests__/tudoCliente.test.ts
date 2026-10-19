import { describe, expect, it } from "vitest";
import { docDaBusca, extratoDoCliente, mascaraCasa, nucleoNome, termoExtrato } from "../tudoCliente";

const DOC = "11222333000181";
describe("tudo do cliente", () => {
  it("reconhece CNPJ e CPF completos na busca", () => {
    expect(docDaBusca("11.222.333/0001-81")).toBe(DOC);
    expect(docDaBusca("Exemplo")).toBeNull();
  });
  it("tira Ltda e pontuação do nome", () => {
    expect(nucleoNome("Exemplo Franquias Ltda.")).toBe("exemplo franquias");
    expect(termoExtrato("Exemplo Franquias Ltda")).toBe("exemplo franquias");
  });
  it("acha o boleto pelo documento mascarado ou pelo nome", () => {
    const d = "Transferência recebida por Boleto - Exemplo Franquias Ltda - ***223330001** - Ref. x";
    expect(mascaraCasa(d, DOC)).toBe(true);
    expect(extratoDoCliente(d, "Outro Nome", DOC)).toBe(true);
    expect(extratoDoCliente("Pix EXEMPLO FRANQUIAS LTDA · Recebido", "Exemplo Franquias Ltda", null)).toBe(true);
  });
  it("não confunde nome curto nem outro documento", () => {
    expect(extratoDoCliente("Pix Exemplo Silva", "Exemplo", null)).toBe(false);
    expect(mascaraCasa("Boleto - ***999990001** -", DOC)).toBe(false);
  });
});
