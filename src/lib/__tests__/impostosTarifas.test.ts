import { describe, expect, it } from "vitest";
import { linhasGasto, porMesGasto, totalPorGrupo, type ContaGasto, type LancGasto } from "../impostosTarifas";

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
