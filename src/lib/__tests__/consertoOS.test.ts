import { describe, expect, it } from "vitest";
import { clienteEmiteNota, notasDoConserto, type NotaMF } from "../consertoOS";

const CHAVE = "42261011222333000181550010000004371497470059";
const nota = (cfop: string, extra: Partial<NotaMF> = {}): NotaMF => ({
  id: cfop, numero: "1", chave: CHAVE, status: "autorizada", tipo_operacao: "saida", created_at: "2026-10-22T15:00:00Z", valor_total: 500,
  payload: { items: [{ cfop }] }, itens: [{ produto_id: "maq" }], ...extra,
});
const comIE = { tipo_pessoa: "PJ", contribuinte_icms: 1, inscricao_estadual: "261939068", uf: "SC" };
const semIE = { tipo_pessoa: "PF", contribuinte_icms: 9, inscricao_estadual: null, uf: "SC" };

describe("notasDoConserto", () => {
  it("cliente com IE e sem nota: pedir a remessa dele", () => {
    const r = notasDoConserto({ dataEntrada: "2026-10-16", cliente: comIE, produtoId: "maq", emitidas: [], recebidas: [] });
    expect(r.passo).toBe("pedir_remessa_cliente");
  });
  it("cliente sem IE e sem nota: a MF emite a entrada 1915", () => {
    expect(notasDoConserto({ dataEntrada: "2026-10-16", cliente: semIE, emitidas: [], recebidas: [] }).passo).toBe("emitir_entrada");
  });
  it("a volta emitida como venda (5101) da mesma máquina aparece como erro", () => {
    const r = notasDoConserto({ dataEntrada: "2026-10-16", cliente: comIE, produtoId: "maq", emitidas: [nota("5101")], recebidas: [] });
    expect(r.comoVenda).toHaveLength(1);
    expect(r.passo).toBe("pedir_remessa_cliente");
  });
  it("com a remessa do cliente: emitir o retorno citando a chave", () => {
    const r = notasDoConserto({ dataEntrada: "2026-10-16", cliente: comIE, emitidas: [],
      recebidas: [{ id: "r", chave: CHAVE, data_emissao: "2026-10-15", valor_total: 9000, itens: [{ cfop: "5915" }] }] });
    expect(r.passo).toBe("emitir_retorno");
    expect(r.entradas[0]).toMatchObject({ chave: CHAVE, valor: 9000 });
  });
  it("entrada da MF 1915 e retorno 5916 emitidos: pronto", () => {
    const r = notasDoConserto({ dataEntrada: "2026-10-16", cliente: semIE, recebidas: [],
      emitidas: [nota("1915", { id: "e", tipo_operacao: "entrada" }), nota("5916", { id: "s" })] });
    expect(r.passo).toBe("pronto");
    expect(r.entradas).toHaveLength(1);
  });
  it("nota de antes da entrada (mais de 15 dias) não conta", () => {
    const r = notasDoConserto({ dataEntrada: "2026-10-16", cliente: comIE, produtoId: "maq", emitidas: [nota("5101", { created_at: "2025-10-08T10:00:00Z" })], recebidas: [] });
    expect(r.comoVenda).toHaveLength(0);
  });
  it("quem emite a nota", () => {
    expect(clienteEmiteNota(comIE)).toBe(true);
    expect(clienteEmiteNota({ ...comIE, inscricao_estadual: "" })).toBe(false);
    expect(clienteEmiteNota(semIE)).toBe(false);
  });
});
