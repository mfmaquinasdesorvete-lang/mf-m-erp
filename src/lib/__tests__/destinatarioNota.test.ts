// Correção do destinatário pela própria nota recusada e a volta para o cadastro do cliente. Dados inventados.
import { describe, expect, it } from "vitest";
import { destinatarioParaCliente, receitaParaDestinatario } from "../destinatarioNota";

describe("destinatário da nota recusada", () => {
  const original = { nome_destinatario: "Loja Exemplo", indicador_inscricao_estadual_destinatario: 9, inscricao_estadual_destinatario: null, cep_destinatario: "57520000", uf_destinatario: "AL" };
  const dest = { nome_destinatario: "Loja Exemplo", indicador_inscricao_estadual_destinatario: "9", inscricao_estadual_destinatario: "", cep_destinatario: "57520000", uf_destinatario: "AL" };

  it("só o que mudou vai para o cadastro", () => {
    expect(destinatarioParaCliente(dest, original)).toEqual({});
    expect(destinatarioParaCliente({ ...dest, indicador_inscricao_estadual_destinatario: "1", inscricao_estadual_destinatario: "248123456" }, original))
      .toEqual({ contribuinte_icms: 1, inscricao_estadual: "248123456" });
    expect(destinatarioParaCliente({ ...dest, cep_destinatario: "57.520-001", uf_destinatario: "al" }, original)).toEqual({ cep: "57520001", uf: "AL" });
  });

  it("IE preenchida sem mexer no indicador marca contribuinte; ISENTO marca isento", () => {
    expect(destinatarioParaCliente({ ...dest, inscricao_estadual_destinatario: "123" }, original)).toEqual({ inscricao_estadual: "123", contribuinte_icms: 1 });
    expect(destinatarioParaCliente({ ...dest, inscricao_estadual_destinatario: "ISENTO" }, original)).toEqual({ inscricao_estadual: "ISENTO", contribuinte_icms: 2 });
  });

  it("Receita → campos da nota", () => {
    expect(receitaParaDestinatario({ nome: "Loja Exemplo Ltda", logradouro: "Rua A", cep: "57.520-000", uf: "al", inscricao_estadual: "248123456", telefone: "" }))
      .toEqual({ nome_destinatario: "Loja Exemplo Ltda", logradouro_destinatario: "Rua A", cep_destinatario: "57520000", uf_destinatario: "AL", inscricao_estadual_destinatario: "248123456", indicador_inscricao_estadual_destinatario: "1" });
  });
});
