import { describe, expect, it } from "vitest";
import { linhasGasto, porMesGasto, raioXInfinitePay, totalPorGrupo, porTipoGasto, type ContaGasto, type LancGasto } from "../impostosTarifas";

const lanc = (id: string, data: string, valor: number, descricao: string, extra: Partial<LancGasto> = {}): LancGasto =>
  ({ id, conta_bancaria_id: "c1", data, valor, descricao, status: "pendente", identificador: id, ...extra });
const conta = (id: string, categoria: string, valor: number, descricao: string, extra: Partial<ContaGasto> = {}): ContaGasto =>
  ({ id, categoria, valor, descricao, status: "pago", vencimento: "2026-05-10", data_pagamento: "2026-05-10", ...extra });

describe("impostos, tarifas e funcionários", () => {
  const lancs = [
    lanc("l1", "2026-07-17", -350.78, "Pix SECRETARIA DE ESTADO DA FAZENDA · Enviado"),
    lanc("l2", "2026-02-10", -81.5, "Transferência enviada por boleto - PREFEITURA MUNICIPAL DE EXEMPLO"),
    lanc("l3", "2026-03-01", -0.5, "OLIST SERVICOS DIGITAIS LTDA · Tarifa Pix recebido - ref. 1"),
    lanc("l4", "2026-03-05", -4000, "FULANO DE TAL EXEMPLO · Transferência enviada pelo Pix"),
    lanc("l5", "2026-03-06", -200, "POSTO EXEMPLO · cartao"),
    lanc("l6", "2026-04-02", -900, "Pix ESCRITORIO EXEMPLO · Enviado", { conta_pagar_id: "p1", status: "conciliado" }),
    lanc("l7", "2026-04-02", -900, "Pix ESCRITORIO EXEMPLO · Enviado", { conta_bancaria_id: "c2", identificador: "l6" }), // mesmo extrato em outra conta
  ];
  const contas = [
    conta("p1", "impostos", 900, "Guia do contador"), // ligada ao extrato l6: não conta de novo
    conta("p2", "impostos", 1200, "DAS Simples Nacional"),
    conta("p3", "tarifas bancárias", 18.63, "Taxa do cartão Olist (Zoop) · pedido Tiny nº 1"),
    conta("p4", "impostos", 500, "DARF aberto", { status: "aberto", data_pagamento: null }),
  ];
  const funcionarios = [{ nome: "Fulano de Tal Exemplo" }];

  it("impostos: extrato pelo nome, conta ligada pela categoria e contas pagas sem extrato", () => {
    const l = linhasGasto("impostos", lancs, contas, funcionarios);
    expect(l.map((x) => [x.id, x.grupo, x.valor])).toEqual([
      ["l1", "Estadual", 350.78], ["p2", "Federal", 1200], ["l6", "Outros impostos", 900], ["l2", "Municipal", 81.5],
    ]);
  });
  it("tarifas: OLIST no extrato e a taxa do cartão lançada", () => {
    const l = linhasGasto("tarifas", lancs, contas, funcionarios);
    expect(l.map((x) => [x.id, x.grupo])).toEqual([["p3", "OLIST"], ["l3", "OLIST"]]);
  });
  it("funcionários: pelo nome do cadastro", () => {
    const l = linhasGasto("funcionarios", lancs, contas, funcionarios);
    expect(l.map((x) => [x.id, x.grupo, x.valor])).toEqual([["l4", "Fulano de Tal Exemplo", 4000]]);
    expect(linhasGasto("funcionarios", lancs, contas, [])).toEqual([]);
  });
  it("totais por grupo e por mês", () => {
    const l = linhasGasto("impostos", lancs, contas, funcionarios);
    expect(totalPorGrupo(l).get("Estadual")).toEqual({ n: 1, total: 350.78, ultimo: "2026-07-17" });
    expect(porMesGasto(l)[0]).toEqual(["2026-07", { n: 1, total: 350.78 }]);
  });
});

describe("porTipoGasto", () => {
  it("conta quantas vezes cada tarifa foi paga e mostra o valor quando é sempre o mesmo", () => {
    const r = porTipoGasto([
      { descricao: "OLIST SERVICOS DIGITAIS LTDA · Tarifa PIX recebido", valor: 0.5 },
      { descricao: "OLIST SERVICOS DIGITAIS LTDA · Tarifa PIX recebido", valor: 0.5 },
      { descricao: "OLIST SERVICOS DIGITAIS LTDA · Tarifa boleto emitido", valor: 1.99 },
      { descricao: "OLIST SERVICOS DIGITAIS LTDA · Tarifa boleto emitido", valor: 0.5 },
      { descricao: "IOF", valor: 3 },
    ]);
    const de = (t: string) => r.find((x) => x.tipo === t);
    expect(de("Tarifa PIX recebido")).toEqual({ tipo: "Tarifa PIX recebido", n: 2, total: 1, unitario: 0.5 });
    expect(de("Tarifa boleto emitido")).toMatchObject({ n: 2, unitario: null });
    expect(r[2]).toMatchObject({ tipo: "IOF", n: 1 });
  });
});

describe("tarifas da OLIST e taxa da InfinitePay", () => {
  it("junta as tarifas da OLIST mesmo com o código Ref. diferente em cada uma", () => {
    const r = porTipoGasto([
      { descricao: "OLIST SERVICOS DIGITAIS LTDA · Tarifa PIX recebido - Ref. 0141f1db-0eef-40d4-b04f-0aa31436ddd9", valor: 0.5 },
      { descricao: "OLIST SERVICOS DIGITAIS LTDA · Tarifa PIX recebido - Ref. 022b6ffb-d741-4a18-b095-1a575a13ed93", valor: 0.5 },
    ]);
    expect(r).toEqual([{ tipo: "Tarifa PIX recebido", n: 2, total: 1, unitario: 0.5 }]);
  });
  it("a venda menos o depósito da InfinitePay entra como tarifa", () => {
    const l = lanc("d1", "2026-09-11", 1433.07, "Vendas · Depósito InfinitePay", { conta_receber_id: "cr1", status: "conciliado" });
    const linhas = linhasGasto("tarifas", [l], [], [], [{ id: "cr1", valor: 1526, descricao: "Venda no cartão InfinitePay SC · crédito 2x" }]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ grupo: "InfinitePay", valor: 92.93 });
    expect(porTipoGasto(linhas)[0].tipo).toBe("Taxa da venda no cartão descontada no depósito");
  });
});

describe("tarifas: antecipação e raio-X da InfinitePay", () => {
  it("antecipação de recebíveis lançada em contas a pagar entra nas tarifas", () => {
    const l = linhasGasto("tarifas", [], [conta("a1", "antecipação de recebíveis", 35.43, "Antecipação do parcelado Olist · pedido Tiny nº 1 (4x)")]);
    expect(l.map((x) => [x.id, x.grupo, x.valor])).toEqual([["a1", "OLIST", 35.43]]);
  });

  it("mede a taxa real (venda − depósito) e separa os depósitos sem a venda ligada", () => {
    const lancs = [
      lanc("d1", "2026-05-02", 900, "Depósito InfinitePay", { conta_receber_id: "r1" }),
      lanc("d2", "2026-05-03", 1800, "Depósito InfinitePay", { conta_receber_id: "r2" }),
      lanc("d3", "2026-05-04", 500, "Depósito InfinitePay"),
      lanc("d4", "2026-05-04", 500, "Depósito InfinitePay", { conta_bancaria_id: "c2", identificador: "d3" }), // repetido
      lanc("x1", "2026-05-05", 300, "Pix recebido · Cliente"),
    ];
    const r = raioXInfinitePay(lancs, [{ id: "r1", valor: 1000 }, { id: "r2", valor: 2000 }]);
    expect(r).toEqual({ n: 2, venda: 3000, deposito: 2700, taxa: 300, pct: 10, semVenda: { n: 1, valor: 500 } });
    expect(raioXInfinitePay([], []).pct).toBeNull();
  });
});
