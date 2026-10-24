import { describe, expect, it } from "vitest";
import { faltaAdmissao, faltaSaida, type PessoaAdmissao } from "../admissaoFuncionario";

const base: PessoaAdmissao = {
  vinculo: "clt", situacao: "ativo", ativo: true, cpf: "000", pis: "1", ctps: "2", cargo: "Montador", data_admissao: "2026-01-02",
  pix: "chave", conta: null, contato_emergencia: "Fulana", data_desligamento: null, motivo_desligamento: null,
};

describe("admissão e saída", () => {
  it("cadastro completo e pasta com contrato e ASO não falta nada", () => {
    expect(faltaAdmissao(base, { contrato: 1, exames: 1 })).toEqual([]);
  });
  it("registrado sem PIS, CTPS, conta e documentos", () => {
    expect(faltaAdmissao({ ...base, pis: "", ctps: null, pix: null }, {}))
      .toEqual(["PIS", "CTPS", "Pix ou conta", "contrato na pasta", "ASO na pasta"]);
  });
  it("PJ não precisa de PIS, CTPS nem ASO", () => {
    expect(faltaAdmissao({ ...base, vinculo: "pj", pis: null, ctps: null }, { contrato: 1 })).toEqual([]);
  });
  it("saída sem data, motivo nem documento", () => {
    expect(faltaSaida({ ...base, situacao: "desligado" }, {})).toEqual(["data de saída", "motivo", "documentos de saída na pasta"]);
    expect(faltaSaida({ ...base, situacao: "desligado", data_desligamento: "2025-01-01", motivo_desligamento: "Pedido" }, { outros: 2 })).toEqual([]);
  });
});
