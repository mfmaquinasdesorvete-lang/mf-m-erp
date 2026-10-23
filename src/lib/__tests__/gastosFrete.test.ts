import { describe, expect, it } from "vitest";
import { gastosPorMes, gastosPorTransportadora } from "../gastosFrete";

const contas = [
  { id: "1", data: "2026-01-10", valor: 100, status: "pago", fornecedor: "Rodonaves", descricao: "Frete" },
  { id: "2", data: "2026-01-20", valor: "50.5", status: "aberto", fornecedor: "Braspress", descricao: "Fatura de frete" },
  { id: "3", data: "2026-01-21", valor: 999, status: "cancelado", fornecedor: "Braspress", descricao: "Frete" },
];
const ctes = [
  { id: "a", emissao: "2026-01-05", valor: 30, mf_paga: true, fatura_id: null, transportadora: "Rodonaves" },
  { id: "b", emissao: "2026-01-06", valor: 40, mf_paga: true, fatura_id: "f1", transportadora: "Rodonaves" },
  { id: "c", emissao: "2026-02-01", valor: 20, mf_paga: false, fatura_id: null, transportadora: "Jadlog" },
];
const extrato = [
  { id: "x", data: "2026-01-15", valor: -70, descricao: "PIX ENVIADO RODONAVES TRANSP", conta_pagar_id: null },
  { id: "y", data: "2026-01-16", valor: -100, descricao: "PIX RODONAVES", conta_pagar_id: "1" },
  { id: "z", data: "2026-01-17", valor: -80, descricao: "PIX PADARIA", conta_pagar_id: null },
];

describe("gastos com frete", () => {
  it("junta as fontes por mês sem contar duas vezes", () => {
    const [jan, fev] = gastosPorMes(2026, contas, ctes, extrato);
    expect(jan).toEqual({ mes: "2026-01", contas: 150.5, contas_pagas: 100, ctes_sem_conta: 30, qtd_ctes: 2, banco_sem_conta: 70, total: 250.5 });
    expect(fev).toMatchObject({ qtd_ctes: 1, ctes_sem_conta: 0, total: 0 });
  });

  it("por transportadora, da que mais gastou", () => {
    expect(gastosPorTransportadora(contas, ctes).map((t) => [t.nome, t.total, t.qtd_ctes])).toEqual([["Rodonaves", 130, 2], ["Braspress", 50.5, 0], ["Jadlog", 0, 1]]);
  });
});
