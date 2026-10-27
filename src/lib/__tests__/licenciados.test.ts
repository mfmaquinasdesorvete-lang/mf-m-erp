import { describe, expect, it } from "vitest";
import {
  entradasCartao, entradasPessoais, faixaLic, lojaDoTexto, nomeNoExtrato, nomesComTermo, resumoLojas, serieMensalLojas, sugestoes,
  type Loja, type PagamentoLoja,
} from "../licenciados";
import type { ContaPessoal, LancPessoal } from "../pessoal";

const loja = (id: string, nome: string, nomes: string[] = [], extra: Partial<Loja> = {}): Loja => ({
  id, nome, cidade: null, uf: null, responsavel: null, documento: null, telefone: null, nomes_extrato: nomes, cliente_id: null,
  situacao: "ativa", inicio: null, valor_combinado: null, mensalidade: null, cor: null, observacoes: null, ordem: 0, ...extra,
});
const pag = (p: Partial<PagamentoLoja>): PagamentoLoja => ({
  id: Math.random().toString(36), loja_id: "l1", data: "2026-05-01", valor: 1000, taxa: 0, tipo: "licenca", forma: "pix", origem: "manual",
  origem_id: null, onde: null, descricao: null, observacao: null, descartado: false, anulado: false, ...p,
});
const conta = (id: string, tipo: ContaPessoal["tipo"] = "corrente"): ContaPessoal => ({
  id, nome: `Conta ${id}`, tipo, banco: null, cor: "sky", saldo_inicial: 0, saldo_inicial_em: "2025-01-01", limite: null, ativa: true, ordem: 0,
});
const lanc = (id: string, descricao: string, valor: number, extra: Partial<LancPessoal> = {}): LancPessoal => ({
  id, conta_id: "c1", data: "2026-05-08", descricao, valor, categoria: null, situacao: "realizado", anulado: false, ...extra,
});

describe("nome no extrato", () => {
  it("lê o nome cortado do Itaú, o do Nubank e o da InfinitePay", () => {
    expect(nomeNoExtrato("PIX TRANSF FULANO 08/09")).toBe("FULANO");
    expect(nomeNoExtrato("PIX TRANSF SORVETE08 05")).toBe("SORVETE");
    expect(nomeNoExtrato("PIX TRANSF M C A L06 10")).toBe("M C A L");
    expect(nomeNoExtrato("Transferência recebida pelo Pix - LOJA EXEMPLO LTDA - 11.222.333/0001-81 - BANCO X (0001) Agência: 1")).toBe("LOJA EXEMPLO LTDA");
    expect(nomeNoExtrato("Pix Loja Teste · Recebido")).toBe("Loja Teste");
    expect(nomeNoExtrato("Licenciamento My Frost Sorveterias — recebido pela InfinitePay SP")).toBe("");
  });
});

describe("loja pelo texto do extrato", () => {
  const lojas = [loja("l1", "Sorveteria Centro", ["FULANO"]), loja("l2", "Loja Praia", ["M C A L", "LOJA PRAIA LTDA"])];
  it("acha pela palavra inteira e prefere o termo mais longo", () => {
    expect(lojaDoTexto("PIX TRANSF FULANO 08/09", lojas)?.id).toBe("l1");
    expect(lojaDoTexto("PIX TRANSF M C A L06 10", lojas)?.id).toBe("l2");
    expect(lojaDoTexto("PIX TRANSF FULANOS 08/09", lojas)).toBeUndefined();
    expect(lojaDoTexto("Pix Sorveteria Centro · Recebido", lojas)?.id).toBe("l1");
  });
});

describe("entradas pessoais", () => {
  const empresas = { nomes: ["EMPRESA EXEMPLO LTDA", "Gelados Exemplo Industria e Comercio Ltda"], documentos: [] };
  it("só as altas, sem a empresa, sem o que passou entre contas, sem cartão e sem desbloqueio", () => {
    const lancs = [
      lanc("a", "PIX TRANSF FULANO 08/09", 10000), lanc("b", "PIX TRANSF EMPRESA EXEMPLO 01 06", 5000), lanc("c", "PIX TRANSF CICLANO 02/06", 800),
      lanc("d", "DESBLO PIX RECEBIDO 17/11", 5000), lanc("e", "PIX TRANSF BELTRANO 03/06", 4000), lanc("f", "PAGAMENTO RECEBIDO", 3000, { conta_id: "k" }),
      lanc("g", "PIX TRANSF OUTRO 04/06", 2000, { anulado: true }),
      lanc("h", "Pró-labore", 6000), lanc("j", "PIX TRANSF GELADOS15/08", 3000), lanc("i", "PIX TRANSF EXEMPLO 05/06", 3000, { categoria: "Salário e pró-labore" }),
    ];
    const r = entradasPessoais(lancs, [conta("c1"), conta("k", "cartao")], { empresas, entreContas: new Set(["e"]), minimo: 1000 });
    expect(r.map((x) => x.origem_id)).toEqual(["a"]);
    expect(r[0]).toMatchObject({ nome: "FULANO", forma: "pix", onde: "Conta c1", taxa: 0 });
  });
});

describe("vendas no cartão da InfinitePay", () => {
  it("só as sem pedido, pagas, nas contas InfinitePay, com a taxa pelo que caiu no extrato", () => {
    const contas = [{ id: "ip", nome: "InfinitePay SP", banco: "infinitepay" }, { id: "bb", nome: "Banco", banco: "outro" }];
    const base = { descricao: "Licenciamento", vencimento: "2026-06-08", forma_pagamento: "cartao", status: "pago", pedido_id: null };
    const receber = [
      { ...base, id: "r1", valor: 20000, valor_pago: 20000, data_pagamento: "2026-06-09", conta_bancaria_id: "ip" },
      { ...base, id: "r2", valor: 2397.4, valor_pago: 2397.4, data_pagamento: "2026-07-30", conta_bancaria_id: "ip", pedido_id: "pd" },
      { ...base, id: "r3", valor: 5000, valor_pago: 5000, data_pagamento: "2026-07-01", conta_bancaria_id: "bb" },
      { ...base, id: "r4", valor: 900, valor_pago: 900, data_pagamento: "2026-07-01", conta_bancaria_id: "ip" },
    ];
    const extrato = [{ id: "e1", conta_bancaria_id: "ip", valor: 17788, conta_receber_id: "r1" }];
    const r = entradasCartao(receber, extrato, contas, 1000);
    expect(r).toEqual([expect.objectContaining({ origem: "infinitepay", origem_id: "r1", valor: 20000, taxa: 2212, forma: "cartao", data: "2026-06-09", onde: "InfinitePay SP" })]);
  });
});

describe("sugestões", () => {
  const entradas = [
    { origem: "infinitepay" as const, origem_id: "r1", data: "2026-06-09", valor: 41000, taxa: 4534.6, forma: "cartao" as const, onde: "InfinitePay SP", descricao: "2 vendas", nome: "" },
    { origem: "pessoal" as const, origem_id: "a", data: "2026-05-08", valor: 10000, taxa: 0, forma: "pix" as const, onde: "Conta", descricao: "PIX TRANSF FULANO 08 05", nome: "FULANO" },
    { origem: "pessoal" as const, origem_id: "b", data: "2026-05-09", valor: 5000, taxa: 0, forma: "pix" as const, onde: "Conta", descricao: "DEVOLVIDO", nome: "" },
  ];
  it("desconta o que já foi ligado (entrada dividida entre lojas), tira o 'não é de loja' e sugere a loja", () => {
    const pagamentos = [
      pag({ origem: "infinitepay", origem_id: "r1", valor: 20000, taxa: 2212 }),
      pag({ origem: "pessoal", origem_id: "b", loja_id: null, descartado: true, valor: 5000 }),
      pag({ origem: "pessoal", origem_id: "a", valor: 10000, anulado: true }),
    ];
    const s = sugestoes(entradas, pagamentos, [loja("l1", "Sorveteria Centro", ["FULANO"])]);
    expect(s.map((x) => [x.origem_id, x.resta, x.taxaResta, x.loja?.id])).toEqual([["r1", 21000, 2322.6, undefined], ["a", 10000, 0, "l1"]]);
  });
});

describe("resumo das lojas e série mensal", () => {
  it("soma total, período, taxas, falta do combinado e dias sem pagar", () => {
    const lojas = [loja("l1", "Loja A", [], { valor_combinado: 30000 }), loja("l2", "Loja B")];
    const ps = [
      pag({ data: "2025-12-10", valor: 10000 }), pag({ data: "2026-05-01", valor: 15000, taxa: 1500 }), pag({ data: "2026-05-02", valor: 999, anulado: true }),
      pag({ loja_id: "l2", data: "2026-04-01", valor: 5000 }), pag({ loja_id: null, descartado: true, data: "2026-04-01", valor: 7000 }),
    ];
    const [a, b] = resumoLojas(lojas, ps, { de: "2026-01-01", ate: "2026-12-31" }, "2026-05-31");
    expect(a).toMatchObject({ total: 25000, noPeriodo: 15000, taxas: 1500, qtd: 2, falta: 5000, pct: 83, primeiro: "2025-12-10", ultimo: "2026-05-01", diasSemPagar: 30 });
    expect(b).toMatchObject({ total: 5000, falta: null, pct: null });
    const serie = serieMensalLojas(ps, "2026-05", 6);
    expect(serie.map((x) => x.mes)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
    expect(serie.map((x) => x.valor)).toEqual([10000, 0, 0, 0, 5000, 15000]);
  });
  it("períodos e termos guardados na loja", () => {
    expect(faixaLic("12m", "2026-10-18")).toEqual({ de: "2025-11-01", ate: "2026-10-18" });
    expect(faixaLic("anterior", "2026-10-18")).toEqual({ de: "2025-01-01", ate: "2025-12-31" });
    expect(faixaLic("semana", "2026-10-28")).toEqual({ de: "2026-10-26", ate: "2026-11-01" });
    expect(faixaLic("mes", "2026-10-28")).toEqual({ de: "2026-10-01", ate: "2026-10-28" });
    expect(nomesComTermo(["FULANO"], "fulano")).toEqual(["FULANO"]);
    expect(nomesComTermo(["FULANO"], "M C A L")).toEqual(["FULANO", "M C A L"]);
    expect(nomesComTermo([], "ab")).toEqual([]);
  });
});
