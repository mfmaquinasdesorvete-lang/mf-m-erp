import { describe, expect, it } from "vitest";
import { buscarClientes, combinaBusca, dddDe, notaCliente } from "../buscaCliente";

describe("combinaBusca (listas)", () => {
  const campos = ["Sorveteria Gelato Nobre Ltda", "23.456.789/0001-95", "(16) 98888-7777"];
  it("CNPJ com ou sem pontos, traço e barra", () => {
    expect(combinaBusca(campos, "23.456.789/0001-95")).toBe(true);
    expect(combinaBusca(campos, "23456789000195")).toBe(true);
    expect(combinaBusca(["x", "23456789000195"], "23.456.789/0001-95")).toBe(true);
    expect(combinaBusca(campos, "23.456.789")).toBe(true);
  });
  it("CNPJ que não está no cadastro não acha", () => {
    expect(combinaBusca(campos, "10.602.547/0005-44")).toBe(false);
  });
  it("telefone com ou sem máscara e nome sem acento", () => {
    expect(combinaBusca(campos, "98888-7777")).toBe(true);
    expect(combinaBusca(campos, "gelato nobre")).toBe(true);
  });
});

describe("buscarClientes (campo de cliente)", () => {
  const lista = [{ id: "1", nome: "Açaí & Cia", cpf_cnpj: "34567890000130" }, { id: "2", nome: "Outra", cpf_cnpj: "12.345.678/0001-90" }];
  it("acha pelo CNPJ formatado ou não", () => {
    expect(buscarClientes(lista, "34.567.890/0001-30").map((c) => c.id)).toEqual(["1"]);
    expect(buscarClientes(lista, "12345678000190").map((c) => c.id)).toEqual(["2"]);
  });
});

describe("telefone com +55 e DDD", () => {
  it("acha digitando com o código do país", () => {
    expect(combinaBusca(["Cliente Teste", "(48) 99999-1234"], "+55 48 99999-1234")).toBe(true);
    expect(combinaBusca(["Cliente Teste", "(48) 99999-1234"], "5548999991234")).toBe(true);
    expect(notaCliente({ id: "1", nome: "Cliente Teste", telefone_adicional: "48 3333-4444" }, "+55 48 3333-4444")).toBe(50);
  });
  it("DDD de qualquer jeito de gravar", () => {
    expect(dddDe("(48) 99999-1234")).toBe("48");
    expect(dddDe("+55 11 98888-7777")).toBe("11");
    expect(dddDe("048 3333-4444")).toBe("48");
    expect(dddDe("99999-1234")).toBe("");
    expect(dddDe(null)).toBe("");
  });
});
