import { describe, expect, it } from "vitest";
import { casarPagamentos, codigoDeBarras, lerPagamento } from "../../../supabase/functions/_shared/inter-pagamentos";

// boleto inventado (linha digitável de 47 dígitos e o código de barras correspondente)
const LINHA = "23790.12345 60000.123456 78901.234567 8 12340000012345";
const BARRAS = "23798123400000123450123460000123457890123456";

describe("boletos pagos no Inter × contas a pagar", () => {
  it("converte a linha digitável no código de barras", () => {
    expect(codigoDeBarras(LINHA)).toBe(BARRAS);
    expect(codigoDeBarras(BARRAS)).toBe(BARRAS);
    expect(codigoDeBarras("123")).toBe("");
  });

  it("lê o item do Inter e a situação", () => {
    const p = lerPagamento({ codigoTransacao: "t1", codigoBarra: BARRAS, valorPago: "123.45", valorNominal: 123.45, dataVencimentoTitulo: "2026-10-10",
      dataPagamento: "2026-10-09", statusPagamento: "PAGO", nomeBeneficiario: "Unifique", cpfCnpjBeneficiario: "11.222.333/0001-81" });
    expect(p).toMatchObject({ codigo: "t1", barras: BARRAS, valor: 123.45, situacao: "pago", pago_em: "2026-10-09", documento: "11222333000181" });
    expect(lerPagamento({ statusPagamento: "AGENDADO" }).situacao).toBe("agendado");
  });

  it("casa pelo código de barras e, sem ele, pelo valor e vencimento; ambíguo não casa", () => {
    const contas = [
      { id: "a", descricao: "Unifique", valor: 123.45, vencimento: "2026-10-10", linha_digitavel: LINHA, documento_fornecedor: null },
      { id: "b", descricao: "Aluguel", valor: 400, vencimento: "2026-10-10", linha_digitavel: null, documento_fornecedor: null },
      { id: "c", descricao: "X", valor: 50, vencimento: "2026-10-01", linha_digitavel: null, documento_fornecedor: null },
      { id: "d", descricao: "Y", valor: 50, vencimento: "2026-10-02", linha_digitavel: null, documento_fornecedor: null },
    ];
    const pag = (o: Record<string, unknown>) => lerPagamento({ statusPagamento: "PAGO", ...o });
    const r = casarPagamentos([
      pag({ codigoBarra: BARRAS, valorPago: 125 }),
      pag({ valorPago: 400, dataVencimentoTitulo: "2026-10-12" }),
      pag({ valorPago: 50, dataVencimentoTitulo: "2026-10-01" }),
      pag({ valorPago: 999, dataVencimentoTitulo: "2026-10-01" }),
    ], contas);
    expect(r.map((x) => [x.conta?.id ?? null, x.por])).toEqual([["a", "codigo"], ["b", "valor"], [null, null], [null, null]]);
    expect(r[2].ambiguo).toBe(true);
  });
});
