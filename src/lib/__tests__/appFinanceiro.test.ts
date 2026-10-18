import { describe, expect, it } from "vitest";
import { abrirNoApp, proximosDias, saldosPorUnidade } from "../appFinanceiro";

describe("app do financeiro", () => {
  it("separa vencidas e as da semana, ignorando pagas e canceladas", () => {
    const r = proximosDias([
      { id: "1", valor: 100, vencimento: "2026-10-10", status: "aberto" },
      { id: "2", valor: 50, vencimento: "2026-10-18", status: "aberto" },
      { id: "3", valor: 30, vencimento: "2026-10-24", status: "aberto" },
      { id: "4", valor: 999, vencimento: "2026-10-20", status: "pago" },
      { id: "5", valor: 999, vencimento: "2026-10-20", status: "cancelado" },
      { id: "6", valor: 70, vencimento: "2026-11-30", status: "aberto" },
    ], "2026-10-18");
    expect(r).toEqual({ vencidas: 1, valorVencidas: 100, semana: 2, valorSemana: 80, hoje: 1 });
  });
  it("soma saldos por unidade", () => {
    const r = saldosPorUnidade([{ unidade_id: "a", saldo: 10.1 }, { unidade_id: "a", saldo: 5 }, { unidade_id: "b", saldo: null }]);
    expect(r.total).toBe(15.1);
    expect(r.por.get("a")).toBe(15.1);
  });
  it("abre no app só no celular, respeitando a escolha", () => {
    expect(abrirNoApp(null, 400, true)).toBe(true);
    expect(abrirNoApp(null, 400, false)).toBe(false);
    expect(abrirNoApp("0", 400, true)).toBe(false);
    expect(abrirNoApp("1", 400, false)).toBe(true);
    expect(abrirNoApp("1", 1200, true)).toBe(false);
  });
});
