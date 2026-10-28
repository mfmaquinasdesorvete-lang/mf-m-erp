// Onde o cliente pagou: resumo do pedido (conta da MF, fornecedor, sócia, falta) e a conferência do valor. Dados inventados.
import { describe, expect, it } from "vitest";
import { numeroDaChave, problemaPagamento, resumoPagamentos } from "../pagamentosCliente";

describe("onde o cliente pagou", () => {
  const parcelas = [
    { status: "pago", valor: 10000, valor_pago: 10000 },          // Pix antigo, sem registro de onde
    { status: "pago", valor: 25000, valor_pago: 25000 },          // pago ao fornecedor
    { status: "pago", valor: 15000, valor_pago: 15000 },          // conta da sócia
    { status: "aberto", valor: 20000 },
    { status: "cancelado", valor: 70000 },
  ];
  const registros = [
    { tipo: "fornecedor" as const, valor: 25000 },
    { tipo: "conta_socia" as const, valor: 10000 },
    { tipo: "conta_socia" as const, valor: 5000 },
    { tipo: "outro" as const, valor: 999, excluido_em: "2026-10-28T10:00:00Z" },
  ];
  const r = resumoPagamentos({ totalPedido: 70000, parcelas, registros, notas: [{ status: "autorizada", valor_total: 10000 }, { status: "autorizada", ambiente: "homologacao", valor_total: 70000 }] });

  it("soma por lugar, ignora o desfeito e o cancelado", () => {
    expect(r).toMatchObject({ fornecedor: 25000, contaSocia: 15000, outro: 0, contaMf: 0, recebidoSemLugar: 10000, emAberto: 20000 });
  });
  it("sem parcelas e quitado", () => {
    expect(resumoPagamentos({ totalPedido: 100, parcelas: [], registros: [], notas: [] })).toMatchObject({ semParcelas: true, quitado: false });
    expect(resumoPagamentos({ totalPedido: 100, parcelas: [{ status: "pago", valor: 100, valor_pago: 100 }], registros: [], notas: [] })).toMatchObject({ semParcelas: false, quitado: true });
    expect(r.quitado).toBe(false);
  });
  it("NF-e de produção menor que o pedido", () => {
    expect(r.nf).toBe(10000);
    expect(r.nfMenor).toBe(true);
    expect(resumoPagamentos({ totalPedido: 100, parcelas: [], registros: [], notas: [] }).nfMenor).toBe(false);
  });
  it("conferência do valor", () => {
    expect(problemaPagamento(null, 100, { tipo: "conta_mf" })).toMatch(/valor/);
    expect(problemaPagamento(150, 100, { tipo: "conta_mf" })).toMatch(/em aberto/);
    expect(problemaPagamento(50, 100, { tipo: "fornecedor" })).toMatch(/nota do fornecedor/);
    expect(problemaPagamento(50, 100, { tipo: "outro", data: "", hoje: "2026-10-28" })).toMatch(/data/);
    expect(problemaPagamento(50, 100, { tipo: "outro", data: "2026-10-29", hoje: "2026-10-28" })).toMatch(/data/);
    expect(problemaPagamento(50, 100, { tipo: "outro", parcelas: 0 })).toMatch(/Parcelas/);
    expect(problemaPagamento(50, 100, { tipo: "outro", parcelas: 2.5 })).toMatch(/Parcelas/);
    expect(problemaPagamento(50, 100, { tipo: "fornecedor", temFornecedor: true, saldoNota: 40 })).toMatch(/nota tem só/);
    expect(problemaPagamento(50, 100, { tipo: "fornecedor", temFornecedor: true, saldoNota: 60 })).toBeNull();
  });
  it("número da NF pela chave", () => {
    expect(numeroDaChave("43260992660406001433550050010496571000157422")).toBe("1049657");
    expect(numeroDaChave(null)).toBe("");
  });
});
