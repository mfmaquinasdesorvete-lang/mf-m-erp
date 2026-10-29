// Correção do destinatário pela própria nota recusada e a volta para o cadastro do cliente. Dados inventados.
import { describe, expect, it } from "vitest";
import { clienteComoDestinatario, editadosNaTela, destinatarioParaCliente, indicadorDaIe, receitaParaDestinatario } from "../destinatarioNota";

describe("destinatário da nota recusada", () => {
  const original = { nome_destinatario: "Loja Exemplo", cnpj_destinatario: "11222333000181", indicador_inscricao_estadual_destinatario: 9, inscricao_estadual_destinatario: null, cep_destinatario: "57520000", uf_destinatario: "AL" };
  const dest = { nome_destinatario: "Loja Exemplo", indicador_inscricao_estadual_destinatario: "9", inscricao_estadual_destinatario: "", cep_destinatario: "57520000", uf_destinatario: "AL" };

  it("só o que mudou vai para o cadastro", () => {
    expect(destinatarioParaCliente(dest, original)).toEqual({});
    expect(destinatarioParaCliente({ ...dest, cep_destinatario: "57.520-001", uf_destinatario: "al" }, original)).toEqual({ cep: "57520001" });
  });

  it("o cadastro fica com o mesmo indicador da nota (e PJ, com CNPJ)", () => {
    expect(destinatarioParaCliente({ ...dest, indicador_inscricao_estadual_destinatario: "1", inscricao_estadual_destinatario: "248123456" }, original))
      .toEqual({ contribuinte_icms: 1, inscricao_estadual: "248123456", tipo_pessoa: "PJ" });
    expect(destinatarioParaCliente({ ...dest, indicador_inscricao_estadual_destinatario: "2", inscricao_estadual_destinatario: "ISENTO" }, original))
      .toEqual({ contribuinte_icms: 2, inscricao_estadual: "ISENTO", tipo_pessoa: "PJ" });
    // nota com IE que passa a não contribuinte: a IE sai do cadastro
    expect(destinatarioParaCliente({ ...dest, indicador_inscricao_estadual_destinatario: "9", inscricao_estadual_destinatario: "" },
      { ...original, indicador_inscricao_estadual_destinatario: 1, inscricao_estadual_destinatario: "999" })).toEqual({ inscricao_estadual: null, contribuinte_icms: 9, tipo_pessoa: "PJ" });
  });

  it("indicador acompanha a IE digitada", () => {
    expect(indicadorDaIe("248123456", "9")).toBe("1");
    expect(indicadorDaIe("isento", "9")).toBe("2");
    expect(indicadorDaIe("", "9")).toBe("9");
  });

  it("Receita → campos da nota (complemento acompanha o endereço novo)", () => {
    expect(receitaParaDestinatario({ nome: "Loja Exemplo Ltda", logradouro: "Rua A", cep: "57.520-000", uf: "al", inscricao_estadual: "248123456" }))
      .toEqual({ nome_destinatario: "Loja Exemplo Ltda", logradouro_destinatario: "Rua A", cep_destinatario: "57520000", uf_destinatario: "AL", inscricao_estadual_destinatario: "248123456", indicador_inscricao_estadual_destinatario: "1", complemento_destinatario: "" });
  });

  it("compara com o cadastro sem se enganar com máscara", () => {
    const cad = clienteComoDestinatario({ tipo_pessoa: "PJ", contribuinte_icms: 2, cpf_cnpj: "11222333000181", nome: "Loja Exemplo", cep: "57.520-000", uf: "al", telefone: "(82) 9999-0000", email: "A@B.com", inscricao_estadual: null });
    const igual = { nome_destinatario: "Loja Exemplo", cep_destinatario: "57520000", uf_destinatario: "AL", telefone_destinatario: "8299990000", email_destinatario: "a@b.com", indicador_inscricao_estadual_destinatario: "2", inscricao_estadual_destinatario: "" };
    expect(destinatarioParaCliente(igual, cad)).toEqual({});
    expect(destinatarioParaCliente({ ...igual, indicador_inscricao_estadual_destinatario: "1", inscricao_estadual_destinatario: "248123456" }, cad))
      .toEqual({ inscricao_estadual: "248123456", contribuinte_icms: 1, tipo_pessoa: "PJ" });
  });

  it("mesma rua e CEP: o complemento fica", () => {
    const r = receitaParaDestinatario({ logradouro: "Rua A", cep: "57520000", complemento: "" }, { logradouro_destinatario: "RUA A", cep_destinatario: "57520-000", complemento_destinatario: "Galpão 3" });
    expect(r.complemento_destinatario).toBeUndefined();
  });

  it("só o que foi mexido na tela vai para o cadastro (o resto da nota pode ser mais velho)", () => {
    const nota = { logradouro_destinatario: "Rua Velha", indicador_inscricao_estadual_destinatario: 2, inscricao_estadual_destinatario: null, cnpj_destinatario: "11222333000181" };
    const tela = { logradouro_destinatario: "Rua Velha", indicador_inscricao_estadual_destinatario: "2", inscricao_estadual_destinatario: "" };
    expect(editadosNaTela(tela, nota)).toEqual({});
    const cad = clienteComoDestinatario({ tipo_pessoa: "PJ", contribuinte_icms: 2, cpf_cnpj: "11222333000181", logradouro: "Rua Nova", inscricao_estadual: "ISENTO" });
    expect(destinatarioParaCliente(editadosNaTela(tela, nota), cad)).toEqual({});
  });
});
