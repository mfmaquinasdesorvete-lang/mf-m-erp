import { describe, expect, it } from "vitest";
import { extratoParaDre, type LancExtratoDre } from "../dreExtrato";
import { dre } from "../dre";

const bancos = [{ id: "b1", ativo: true, unidade_id: "sc" }, { id: "b2", ativo: true, unidade_id: "sp" }, { id: "b3", ativo: false, unidade_id: "sc" }];
let n = 0;
const l = (conta: string, data: string, valor: number, descricao: string, extra: Partial<LancExtratoDre> = {}): LancExtratoDre =>
  ({ id: `l${++n}`, conta_bancaria_id: conta, data, valor, descricao, identificador: `id${n}`, status: "pendente", ...extra });

describe("extratos dos bancos no DRE", () => {
  it("conta já ligada a uma linha não apaga outra linha de mesmo valor na mesma semana", () => {
    const r = extratoParaDre([
      l("b1", "2026-10-02", 150, "Pix recebido de Cliente A", { status: "conciliado", conta_receber_id: "cr1" }),
      l("b1", "2026-10-04", 150, "Pix recebido de Cliente B"),
    ], bancos, [{ id: "cr1", tipo: "receber", valor: 150, status: "pago", data_pagamento: "2026-10-02" }]);
    expect(r.lancamentos.map((x) => x.valor)).toEqual([150]);
    expect(r.fora.ja_em_conta).toBe(1);
  });

  it("Pix e cartão recebidos viram receita; funcionário, imposto, tarifa e combustível vão para a linha certa", () => {
    const { lancamentos } = extratoParaDre([
      l("b1", "2026-10-02", 1500, "Pix recebido de Sorveteria Exemplo"),
      l("b1", "2026-10-03", 820.5, "Depósito de vendas no cartão"),
      l("b1", "2026-10-04", -1200, "Pix enviado - Fulano de Tal Souza"),
      l("b1", "2026-10-05", -300, "Pagamento DARF Receita Federal"),
      l("b1", "2026-10-06", -5.9, "Tarifa Pix"),
      l("b1", "2026-10-07", -250, "Posto Exemplo Combustíveis"),
    ], bancos, [], { funcionarios: [{ nome: "Fulano de Tal Souza" }] });
    const por = Object.fromEntries(lancamentos.map((x) => [x.categoria, x]));
    expect(por["Recebido no banco: Pix"]).toMatchObject({ tipo: "receber", grupo: "receita", valor: 1500, unidade_id: "sc" });
    expect(por["Recebido no banco: cartão e maquininha"]).toMatchObject({ grupo: "receita", valor: 820.5 });
    expect(por["Funcionários (Pix)"]).toMatchObject({ tipo: "pagar", grupo: "despesa_operacional", valor: 1200 });
    expect(por["Impostos e guias pagos"]).toMatchObject({ grupo: "deducao", valor: 300 });
    expect(por["Tarifas (cartão, OLIST, banco) e juros"]).toMatchObject({ grupo: "despesa_financeira" });
    expect(por["Combustível"]).toMatchObject({ grupo: "despesa_operacional", valor: 250 });
  });

  it("deixa de fora repetidos, transferências entre contas, conta inativa, linha ligada e a que bate com conta paga", () => {
    const repetida = l("b1", "2026-10-02", 100, "Pix recebido de Cliente A");
    const r = extratoParaDre([
      repetida, { ...repetida, id: "copia", conta_bancaria_id: "b2" },
      l("b1", "2026-10-03", -500, "Transferência enviada"), l("b2", "2026-10-03", 500, "Transferência recebida"),
      l("b1", "2026-10-04", -80, "Pix enviado", { status: "transferencia" }),
      l("b3", "2026-10-04", 999, "Pix recebido conta antiga"),
      l("b1", "2026-10-05", 4140, "Pix recebido Açaí Exemplo"),
      l("b1", "2026-10-06", -70, "Pagamento boleto", { conta_pagar_id: "c1" }),
    ], bancos, [{ tipo: "receber", valor: 4140, status: "pago", data_pagamento: "2026-10-07" }]);
    expect(r.lancamentos.map((x) => x.valor)).toEqual([100]);
    expect(r.fora).toEqual({ repetidas: 1, transferencias: 3, partes: 0, ja_em_conta: 2, conta_inativa: 1 });
  });

  it("sócios e empresas ligadas ficam fora do resultado; IPVA vai para despesas", () => {
    const r = extratoParaDre([
      l("b1", "2026-10-02", -2000, "Pix enviado - Empresa Ligada Exemplo Ltda"),
      l("b1", "2026-10-03", -400, "Detran IPVA 2026"),
    ], bancos, [], { partes: [{ id: "p1", nome: "Empresa Ligada Exemplo", tipo: "empresa", documentos: [], nomes_extrato: [] }], propria: { nomes: [], documentos: [] } });
    expect(r.fora.partes).toBe(1);
    expect(r.lancamentos).toHaveLength(1);
    expect(r.lancamentos[0]).toMatchObject({ grupo: "despesa_operacional", categoria: "Veículos (IPVA, licenciamento, multas)" });
  });

  it("no DRE a linha do extrato usa o grupo dela, sem depender do plano de contas", () => {
    const { lancamentos } = extratoParaDre([l("b1", "2026-10-02", 1000, "Pix recebido de Cliente B"), l("b1", "2026-10-03", -5.9, "Tarifa Pix")], bancos, []);
    const d = dre(lancamentos, [], ["2026-10"], "caixa");
    expect(d.linhas.find((x) => x.chave === "receita")!.valores).toEqual([1000]);
    expect(d.linhas.find((x) => x.chave === "financeiro")!.valores).toEqual([-5.9]);
    expect(d.linhas.find((x) => x.chave === "liquido")!.valores).toEqual([994.1]);
  });
});
