import { describe, expect, it } from "vitest";
import { montarFatos, normalizarTitulos, type ContaAnalise } from "../../../supabase/functions/_shared/ia-titulos";

const conta = (x: Partial<ContaAnalise>): ContaAnalise => ({
  id: "a", descricao: "Energia", valor: 500, vencimento: "2026-10-30", categoria: "Energia", fornecedor_id: "f1",
  documento: null, linha_digitavel: null, nfe_recebida_id: null, recorrente_id: null, status: "aberto", ...x,
});

describe("IA dos títulos a pagar", () => {
  it("junta histórico do fornecedor, dias para vencer e repetidas no mesmo mês", () => {
    const c = conta({ linha_digitavel: "123" });
    const f = montarFatos("C1", c, {
      hoje: "2026-10-24", fornecedor: "Celesc", bloqueio: null, anexo: false, nota: null,
      historico: [{ valor: 200, data: "2026-08-10" }, { valor: 300, data: "2026-09-10" }],
      outras: [c, conta({ id: "b", vencimento: "2026-10-28" }), conta({ id: "c", vencimento: "2026-12-30" }), conta({ id: "d", status: "cancelado" })],
    });
    expect(f.dias_para_vencer).toBe(6);
    expect(f.com_documento).toBe(true);
    expect(f.media_paga).toBe(250);
    expect(f.maior_paga).toBe(300);
    expect(f.ultima_paga_em).toBe("2026-09-10");
    expect(f.repetidas).toEqual([{ valor: 500, vencimento: "2026-10-28", status: "aberto" }]);
  });
  it("sem histórico fica sem média", () => {
    const f = montarFatos("C1", conta({}), { hoje: "2026-11-02", fornecedor: "Novo", bloqueio: "Golpe", anexo: false, nota: null, historico: [], outras: [] });
    expect(f.media_paga).toBeNull();
    expect(f.dias_para_vencer).toBe(-3);
    expect(f.com_documento).toBe(false);
    expect(f.fornecedor_bloqueado).toBe("Golpe");
  });
  it("só aceita os códigos enviados, sem repetir e com sinal válido", () => {
    expect(normalizarTitulos({ pareceres: [
      { codigo: "c1", sinal: "ok", motivo: " Mesmo valor de sempre " },
      { codigo: "C1", sinal: "conferir", motivo: "repetido" },
      { codigo: "C9", sinal: "ok", motivo: "x" },
      { codigo: "C2", sinal: "talvez", motivo: "x" },
    ] }, new Set(["C1", "C2"]))).toEqual([{ codigo: "C1", sinal: "ok", motivo: "Mesmo valor de sempre" }]);
  });
});
