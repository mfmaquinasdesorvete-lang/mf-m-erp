import { describe, expect, it } from "vitest";
import { docValido, normalizarCliente } from "../../../supabase/functions/_shared/ia-cliente";

describe("IA do cadastro de cliente", () => {
  it("CPF e CNPJ só com o dígito verificador certo", () => {
    expect(docValido("11.222.333/0001-81")).toBe(true);
    expect(docValido("11.222.333/0001-82")).toBe(false);
    expect(docValido("529.982.247-25")).toBe(true);
    expect(docValido("111.111.111-11")).toBe(false);
  });
  it("limpa os números, confere UF, e-mail e CEP e descobre PJ pelo CNPJ", () => {
    const { dados, avisos } = normalizarCliente({
      nome: "  Gelato Nobre  Ltda ", cpf_cnpj: "11.222.333/0001-81", whatsapp: "(48) 99999-1234", telefone: "1234",
      email: "Contato@Gelato.com.br", cep: "88010-000", uf: "sc", tipo_pessoa: null,
    });
    expect(dados.nome).toBe("Gelato Nobre Ltda");
    expect(dados.cpf_cnpj).toBe("11222333000181");
    expect(dados.tipo_pessoa).toBe("PJ");
    expect(dados.whatsapp).toBe("48999991234");
    expect(dados.telefone).toBeNull();
    expect(dados.email).toBe("contato@gelato.com.br");
    expect(dados.cep).toBe("88010000");
    expect(dados.uf).toBe("SC");
    expect(avisos).toEqual([]);
  });
  it("documento lido errado vira aviso e fica vazio", () => {
    const { dados, avisos } = normalizarCliente({ cpf_cnpj: "11.222.333/0001-99", uf: "XX", email: "sem-arroba" });
    expect(dados.cpf_cnpj).toBeNull();
    expect(dados.uf).toBeNull();
    expect(dados.email).toBeNull();
    expect(avisos[0]).toContain("não confere");
  });
});
