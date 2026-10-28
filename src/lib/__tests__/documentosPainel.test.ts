import { describe, expect, it } from "vitest";
import { ehContaDeImposto, pagasSemComprovante, prazosParaConfirmar, tipoDocEmpresa } from "../documentosPainel";

describe("documentos da empresa por tipo", () => {
  it("separa pelo nome do arquivo", () => {
    expect(tipoDocEmpresa("FILIAL- MF MAQUINAS.pfx")).toBe("certificado");
    expect(tipoDocEmpresa("extrato.01May26-29Aug26.ofx")).toBe("extrato");
    expect(tipoDocEmpresa("Comunicado-notas-fiscais.pdf")).toBe("comunicado");
    expect(tipoDocEmpresa("Aviso férias 2026.pdf")).toBe("comunicado");
    expect(tipoDocEmpresa("MF MATRIZ - 4° ALTERAÇÃO CONTRATUAL.pdf")).toBe("contrato");
    expect(tipoDocEmpresa("ABERTURA FILIAL - 3° ALTERAÇÃO CONTRATUAL.pdf")).toBe("contrato");
    expect(tipoDocEmpresa("MF MAQUINAS FUNC.pdf")).toBe("outro");
  });
});

const c = (id: string, status: string, vencimento: string, data_pagamento: string | null = null) => ({ id, descricao: id, valor: 10, vencimento, status, data_pagamento });

describe("contas na tela Documentos", () => {
  const contas = [
    c("a", "pago", "2026-10-01", "2026-10-02"), c("b", "pago", "2026-10-10", "2026-10-11"), c("c", "pago", "2026-07-01", "2026-07-01"),
    c("d", "aberto", "2026-09-18"), c("e", "aberto", "2026-10-30"), c("f", "aberto", "2026-08-01"), c("g", "cancelado", "2026-08-01"),
  ];
  it("pagas sem comprovante: só as recentes e sem anexo, a mais nova primeiro", () => {
    expect(pagasSemComprovante(contas, new Set(["a"]), "2026-10-23").map((x) => x.id)).toEqual(["b"]);
  });
  it("prazo passado: vencidas em aberto, a mais antiga primeiro", () => {
    expect(prazosParaConfirmar(contas, "2026-10-23").map((x) => x.id)).toEqual(["f", "d"]);
  });
});

describe("ehContaDeImposto", () => {
  it("pela categoria de impostos", () => {
    expect(ehContaDeImposto({ categoria: "impostos", descricao: "MUNICIPIO DE SAO JOSE" })).toBe(true);
    expect(ehContaDeImposto({ categoria: "Parcelamento PGFN", descricao: null })).toBe(true);
  });
  it("pela descrição da guia, sem categoria", () => {
    expect(ehContaDeImposto({ categoria: null, descricao: "DARE SANTA CATARINA · Pagamento efetuado" })).toBe(true);
    expect(ehContaDeImposto({ categoria: null, descricao: "DAS do Simples 09/2026" })).toBe(true);
    expect(ehContaDeImposto({ categoria: null, descricao: "GNRE DIFAL BA" })).toBe(true);
  });
  it("fornecedores e outras despesas ficam de fora", () => {
    expect(ehContaDeImposto({ categoria: "fornecedores", descricao: "Boleto Expresso São Miguel" })).toBe(false);
    expect(ehContaDeImposto({ categoria: "energia/água/internet", descricao: "Internet e Telefone Unifique" })).toBe(false);
    expect(ehContaDeImposto({ categoria: null, descricao: "Pix Conectcar" })).toBe(false);
    expect(ehContaDeImposto({ categoria: null, descricao: "Boleto Angeza Assessoria de Cobranças" })).toBe(false);
  });
});
