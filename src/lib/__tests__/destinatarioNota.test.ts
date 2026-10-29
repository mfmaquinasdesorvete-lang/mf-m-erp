// Correção do destinatário pela própria nota recusada e a volta para o cadastro do cliente. Dados inventados.
import { describe, expect, it } from "vitest";
import { destinatarioParaCliente, indicadorDaIe, receitaParaDestinatario } from "../destinatarioNota";

describe("destinatário da nota recusada", () => {
  const original = { nome_destinatario: "Loja Exemplo", cnpj_destinatario: "11222333000181", indicador_inscricao_estadual_destinatario: 9, inscricao_estadual_destinatario: null, cep_destinatario: "57520000", uf_destinatario: "AL" };
  const dest = { nome_destinatario: "Loja Exemplo", indicador_inscricao_estadual_destinatario: "9", inscricao_estadual_destinatario: "", cep_destinatario: "57520000", uf_destinatario: "AL" };

  it("só o que mudou vai para o cadastro", () => {
    expect(destinatarioParaCliente(dest, original)).toEqual({});
    expect(destinatarioParaCliente({ ...dest, cep_destinatario: "57.520-001", uf_destinatario: "al" }, original)).toEqual({ cep: "57520001", uf: "AL" });
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
});
