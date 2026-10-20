import { describe, expect, it } from "vitest";
import { cepFormatado, enderecoDaUnidade, enderecoDoCliente, linhaEndereco, pendenciasEnvio, totaisDeclaracao } from "../correios";

const unidade = { nome: "SC", razao_social: "Empresa Exemplo Ltda", cnpj: "11222333000181", logradouro: "Rua A", numero: "10", complemento: null,
  bairro: "Centro", municipio: "Cidade", uf: "sc", cep: "88000000", telefone: null, whatsapp: "48999990000" };
const cliente = { nome: " Cliente Exemplo ", cpf_cnpj: null, logradouro: "Av. B", numero: "200", complemento: "sala 3", bairro: "Jardim",
  municipio: "Outra", uf: "SP", cep: "01000-000", telefone: "1133330000", whatsapp: null };

describe("envio pelos Correios", () => {
  it("monta remetente pela unidade e destinatário pelo cliente", () => {
    const r = enderecoDaUnidade(unidade), d = enderecoDoCliente(cliente);
    expect(r).toMatchObject({ nome: "Empresa Exemplo Ltda", uf: "SC", telefone: "48999990000" });
    expect(d).toMatchObject({ nome: "Cliente Exemplo", telefone: "1133330000" });
    expect(linhaEndereco(d)).toBe("Av. B, 200 - sala 3 · Jardim");
    expect(cepFormatado("88000000")).toBe("88000-000");
  });

  it("aponta o que falta e soma os itens", () => {
    const r = enderecoDaUnidade(unidade), d = enderecoDoCliente({ ...cliente, cep: "123", logradouro: "" });
    expect(pendenciasEnvio({ remetente: r, destinatario: d, itens: [], notaFiscal: null })).toEqual(["CEP do destinatário", "endereço do destinatário", "ao menos um item com conteúdo e quantidade"]);
    expect(pendenciasEnvio({ remetente: r, destinatario: enderecoDoCliente(cliente), itens: [], notaFiscal: "1234" })).toEqual([]);
    expect(totaisDeclaracao([{ conteudo: "Pá batedora", quantidade: 2, valor: 150.5 }, { conteudo: "", quantidade: 9, valor: 9 }, { conteudo: "Vedação", quantidade: 1, valor: 20 }]))
      .toEqual({ quantidade: 3, valor: 321 });
  });
});
