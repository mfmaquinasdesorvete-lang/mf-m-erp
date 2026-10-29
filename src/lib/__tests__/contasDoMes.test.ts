import { describe, expect, it } from "vitest";
import { contasDoMes, paraAvisar, proximoMes, textoPrazo, vencimentoDe, type ContaMensal, type PagoMensal } from "@/lib/contasDoMes";

const das: ContaMensal = { id: "d", nome: "DAS do MEI", dia_vencimento: 20, mes_anterior: true, valor: 80, conta_id: null, avisar_dias: 5, observacao: null, desde: "2026-07", ativa: true, ordem: 0 };
const pago = (mes: string): PagoMensal => ({ id: mes, mensal_id: "d", mes, pago_em: `${mes}-25`, valor: 80, comprovante: null, lancamento_id: null, anulado: false });

describe("contasDoMes", () => {
  it("vence no mês seguinte quando se refere ao mês anterior, no último dia se o mês for curto", () => {
    expect(vencimentoDe(das, "2026-09")).toBe("2026-10-20");
    expect(vencimentoDe({ dia_vencimento: 31, mes_anterior: false }, "2026-02")).toBe("2026-02-28");
  });
  it("mostra atrasado, vencendo e pago desde o primeiro mês acompanhado", () => {
    const itens = contasDoMes([das], [pago("2026-07")], "2026-10-17");
    expect(itens.map((i) => [i.mes, i.situacao])).toEqual([["2026-08", "atrasado"], ["2026-09", "vencendo"], ["2026-07", "pago"]]);
    expect(textoPrazo(itens[0])).toBe("atrasado há 27 dias");
    expect(textoPrazo(itens[1])).toBe("vence em 3 dias");
    expect(paraAvisar(itens)).toHaveLength(2);
  });
  it("conta desligada e pagamento anulado", () => {
    expect(contasDoMes([{ ...das, ativa: false }], [], "2026-10-17")).toEqual([]);
    const itens = contasDoMes([{ ...das, desde: "2026-09" }], [{ ...pago("2026-09"), anulado: true }], "2026-10-01");
    expect(itens[0].situacao).toBe("em_dia");
  });
});

describe("proximoMes", () => {
  it("sem nada pago e o primeiro mês ainda não venceu, o próximo é o mês desde", () => {
    const c = { ...das, desde: "2026-10" };
    const itens = contasDoMes([c], [], "2026-10-29");
    expect(itens).toEqual([]);
    expect(proximoMes(c, itens, "2026-10-29")).toEqual({ mes: "2026-10", vencimento: "2026-11-20" });
  });
  it("depois do último pago vem o mês seguinte", () => {
    const itens = contasDoMes([das], [pago("2026-07"), pago("2026-08"), pago("2026-09")], "2026-10-29");
    expect(proximoMes(das, itens, "2026-10-29")).toEqual({ mes: "2026-10", vencimento: "2026-11-20" });
  });
});
