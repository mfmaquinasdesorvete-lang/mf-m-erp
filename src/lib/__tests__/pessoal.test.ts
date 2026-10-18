import { describe, expect, it } from "vitest";
import {
  categoriaDe, daEmpresa, faixaAnterior, faixaDoPeriodo, proximos, recebidosDaEmpresa, resumoMes, resumoPeriodo, saldoConta, serieMensal, serieSaldo, ultimoLancamento,
  type ContaPessoal, type LancPessoal,
} from "../pessoal";

const conta: ContaPessoal = { id: "c1", nome: "Conta", tipo: "corrente", banco: null, cor: "sky", saldo_inicial: 1000, saldo_inicial_em: "2026-10-01", limite: null, ativa: true, ordem: 0 };
const l = (x: Partial<LancPessoal>): LancPessoal => ({ id: Math.random().toString(), conta_id: "c1", data: "2026-10-05", descricao: "", valor: -10, categoria: "Outros", situacao: "realizado", anulado: false, ...x });

describe("painel pessoal", () => {
  it("adivinha a categoria pelo texto do extrato", () => {
    expect(categoriaDe("PIX ENVIADO SUPERMERCADO EXEMPLO")).toBe("Mercado");
    expect(categoriaDe("DROGARIA EXEMPLO 123")).toBe("Saúde");
    expect(categoriaDe("NETFLIX.COM")).toBe("Assinaturas");
    expect(categoriaDe("Pró-labore outubro")).toBe("Salário e pró-labore");
    expect(categoriaDe("PAGAMENTO FATURA CARTAO")).toBe("Cartão (fatura)");
    expect(categoriaDe("algo sem regra")).toBe("Outros");
  });

  it("saldo: inicial mais o realizado desde a data do saldo inicial (sem previstos nem anulados)", () => {
    const lancs = [l({ valor: -100 }), l({ valor: 50, data: "2026-09-30" }), l({ valor: -30, situacao: "previsto" }), l({ valor: -40, anulado: true }), l({ valor: 200, data: "2026-10-10" })];
    expect(saldoConta(conta, lancs)).toBe(1100);
    expect(saldoConta(conta, lancs, "2026-10-06")).toBe(900);
  });

  it("resumo do mês sem transferências entre as próprias contas e fatura do cartão", () => {
    const r = resumoMes([l({ valor: 5000, categoria: "Salário e pró-labore" }), l({ valor: -300, categoria: "Mercado" }), l({ valor: -100, categoria: "Mercado" }),
      l({ valor: -80, categoria: "Saúde" }), l({ valor: -1000, categoria: "Transferências" }), l({ valor: -900, categoria: "Cartão (fatura)" }), l({ valor: -50, data: "2026-09-01" })], "2026-10");
    expect(r.entrou).toBe(5000);
    expect(r.saiu).toBe(480);
    expect(r.categorias[0]).toEqual({ nome: "Mercado", valor: 400 });
  });

  it("próximos: só previstos de hoje em diante, em ordem", () => {
    const p = proximos([l({ situacao: "previsto", data: "2026-10-20" }), l({ situacao: "previsto", data: "2026-10-18" }), l({ situacao: "previsto", data: "2026-10-01" })], "2026-10-17");
    expect(p.map((x) => x.data)).toEqual(["2026-10-18", "2026-10-20"]);
  });

  it("períodos: mês, 3 e 12 meses terminando no mês escolhido, ano, datas livres e o anterior do mesmo tamanho", () => {
    expect(faixaDoPeriodo("mes", "2026-02", [], "2026-10-18")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    expect(faixaDoPeriodo("3m", "2026-07", [], "2026-10-18")).toEqual({ de: "2026-05-01", ate: "2026-07-31" });
    expect(faixaDoPeriodo("12m", "2026-07", [], "2026-10-18")).toEqual({ de: "2025-08-01", ate: "2026-07-31" });
    expect(faixaDoPeriodo("ano", "2026-07", [], "2026-10-18")).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
    expect(faixaDoPeriodo("pers", "2026-07", [], "2026-10-18", { de: "2026-03-10", ate: "2026-03-01" })).toEqual({ de: "2026-03-01", ate: "2026-03-10" });
    expect(faixaDoPeriodo("tudo", "2026-07", [l({ data: "2025-01-05" }), l({ data: "2026-03-02" })], "2026-10-18")).toEqual({ de: "2025-01-05", ate: "2026-10-18" });
    expect(faixaAnterior("3m", "2026-07", { de: "2026-05-01", ate: "2026-07-31" })).toEqual({ de: "2026-02-01", ate: "2026-04-30" });
    expect(faixaAnterior("ano", "2026-07", { de: "2026-01-01", ate: "2026-12-31" })).toEqual({ de: "2025-01-01", ate: "2025-12-31" });
    expect(faixaAnterior("pers", "2026-07", { de: "2026-03-01", ate: "2026-03-10" })).toEqual({ de: "2026-02-19", ate: "2026-02-28" });
  });

  it("resumo do período: resultado, média por dia até hoje e os maiores gastos", () => {
    const lancs = [l({ valor: 3000, categoria: "Salário e pró-labore", data: "2026-10-02" }), l({ valor: -500, categoria: "Casa", data: "2026-10-03" }),
      l({ valor: -100, categoria: "Mercado", data: "2026-10-04" }), l({ valor: -900, categoria: "Cartão (fatura)", data: "2026-10-05" })];
    const r = resumoPeriodo(lancs, { de: "2026-10-01", ate: "2026-10-31" }, "2026-10-10");
    expect(r.resultado).toBe(2400);
    expect(r.mediaDia).toBe(60);
    expect(r.maiores.map((x) => x.valor)).toEqual([-500, -100]);
    const s = serieMensal(lancs, "2026-10", 3);
    expect(s.map((x) => x.mes)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(s[2]).toEqual({ mes: "2026-10", entrou: 3000, saiu: 600 });
  });

  it("saldo ao longo do período (sem cartão e sem passar de hoje) e último lançamento da conta", () => {
    const lancs = [l({ valor: -100, data: "2026-10-03" }), l({ valor: 50, data: "2026-10-05" })];
    const s = serieSaldo([conta], lancs, { de: "2026-10-01", ate: "2026-10-31" }, "2026-10-06");
    expect(s.length).toBe(6);
    expect(s[0]).toEqual({ dia: "2026-10-01", saldo: 1000 });
    expect(s[5]).toEqual({ dia: "2026-10-06", saldo: 950 });
    const longo = serieSaldo([conta], lancs, { de: "2025-10-01", ate: "2026-10-31" }, "2026-10-06");
    expect(longo[longo.length - 1]).toEqual({ dia: "2026-10-06", saldo: 950 });
    expect(ultimoLancamento(lancs, "c1")).toBe("2026-10-05");
  });

  it("Pix da própria empresa: pelo nome (sem LTDA) ou pelo CNPJ, só as entradas", () => {
    const e = { nomes: ["EMPRESA EXEMPLO LTDA"], documentos: ["11222333000181"] };
    expect(daEmpresa("PIX RECEBIDO EMPRESA EXEMPLO", e)).toBe(true);
    expect(daEmpresa("TED 11.222.333/0001-81 RECEBIDA", e)).toBe(true);
    expect(daEmpresa("PIX RECEBIDO OUTRA EMPRESA", e)).toBe(false);
    const lancs = [l({ valor: 2000, descricao: "PIX RECEBIDO EMPRESA EXEMPLO" }), l({ valor: -50, descricao: "PIX ENVIADO EMPRESA EXEMPLO" })];
    expect(recebidosDaEmpresa(lancs, e).length).toBe(1);
  });

  it("Pix por QR code com o nome cortado: as duas primeiras palavras da empresa bastam (se não forem genéricas)", () => {
    const e = { nomes: ["ALFA MAQUINAS DE TESTE LTDA", "COMERCIO DE BETA LTDA"], documentos: [] };
    expect(daEmpresa("PIX QRS ALFA MAQUINAS", e)).toBe(true);
    expect(daEmpresa("PIX QRS ALFA", e)).toBe(false);
    expect(daEmpresa("PIX QRS COMERCIO DE", e)).toBe(false);
  });

});
