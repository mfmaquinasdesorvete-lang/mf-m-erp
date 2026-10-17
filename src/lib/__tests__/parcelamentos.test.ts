import { describe, expect, it } from "vitest";
import { MENSAGEM_CONTADOR, aVencer, gerarParcelas, gerarVencimentos, resumoParcelamento, situacaoParcela, valoresParcelas, type Parcela } from "../parcelamentos";

const parc = (numero: number, vencimento: string, x: Partial<Parcela> = {}): Parcela => ({
  id: `p${numero}`, parcelamento_id: "a", numero, vencimento, valor: 100, situacao: "a_pagar", pago_em: null, valor_pago: null,
  pago_por: null, pago_por_nome: null, observacao: null, ...x,
});
const pago = (por: Parcela["pago_por"] = "mf", valor = 100): Partial<Parcela> => ({ situacao: "pago", pago_em: "2026-01-01", pago_por: por, valor_pago: valor });
const base = { situacao: "ativo" as const, max_atrasos: 3, rescinde_ultima: true, qtd_parcelas: 6 };

describe("parcelamentos de impostos", () => {
  it("Receita: depois da 1ª, último dia útil de cada mês (31/12 sem expediente bancário)", () => {
    expect(gerarVencimentos({ primeira: "2026-09-30", qtd: 4, regra: "ultimo_dia_util" })).toEqual(["2026-09-30", "2026-10-30", "2026-11-30", "2026-12-30"]);
  });

  it("dia fixo: mês curto usa o último dia e fim de semana ou feriado volta para o dia útil de antes", () => {
    expect(gerarVencimentos({ primeira: "2026-01-30", qtd: 2, regra: "dia", dia: 31 })).toEqual(["2026-01-30", "2026-02-27"]);
    // 15/11/2026 é domingo e feriado: vai para sexta, 13/11
    expect(gerarVencimentos({ primeira: "2026-10-15", qtd: 2, regra: "dia" })[1]).toBe("2026-11-13");
  });

  it("valor das parcelas: o informado ou o consolidado dividido, com os centavos na última", () => {
    expect(valoresParcelas(3, null, 100)).toEqual([33.33, 33.33, 33.34]);
    expect(valoresParcelas(2, 50, 1000)).toEqual([50, 50]);
    expect(valoresParcelas(2, null, null)).toEqual([null, null]);
    const g = gerarParcelas({ primeira_parcela: "2026-09-30", qtd_parcelas: 3, vencimento_regra: "ultimo_dia_util", dia_vencimento: null, valor_parcela: null, valor_consolidado: 300 });
    expect(g.map((x) => [x.numero, x.valor])).toEqual([[1, 100], [2, 100], [3, 100]]);
  });

  it("situação da parcela pela data de hoje", () => {
    expect(situacaoParcela(parc(1, "2026-10-16"), "2026-10-17")).toBe("atrasada");
    expect(situacaoParcela(parc(1, "2026-10-17"), "2026-10-17")).toBe("hoje");
    expect(situacaoParcela(parc(1, "2026-10-24"), "2026-10-17")).toBe("vence_logo");
    expect(situacaoParcela(parc(1, "2026-10-25"), "2026-10-17")).toBe("a_vencer");
    expect(situacaoParcela(parc(1, "2026-10-01", pago()), "2026-10-17")).toBe("paga");
    expect(situacaoParcela(parc(1, "2026-10-01", { situacao: "anulada" }), "2026-10-17")).toBe("anulada");
  });

  it("resumo: saldo, pago por terceiros (outra empresa, pessoal) e próxima", () => {
    const r = resumoParcelamento(base, [parc(1, "2026-07-31", pago("mf")), parc(2, "2026-08-31", pago("outra_empresa", 105)), parc(3, "2026-09-30", pago("pessoal", 110)),
      parc(4, "2026-10-30"), parc(5, "2026-11-30"), parc(6, "2026-12-30"), parc(7, "2027-01-29", { situacao: "anulada" })], "2026-10-17");
    expect([r.total, r.pagas, r.abertas, r.saldo, r.valorPago, r.pagoTerceiros]).toEqual([6, 3, 3, 300, 315, 215]);
    expect(r.proxima?.numero).toBe(4);
    expect(r.risco).toBe("ok");
    expect(r.fim).toBe("2026-12-30");
  });

  it("risco de cancelar: 2 atrasadas = alto; 3 = pode ser cancelado; 1 sem pagar com as outras pagas também", () => {
    const hoje = "2026-10-17";
    const doisAtrasos = [parc(1, "2026-08-31"), parc(2, "2026-09-30"), parc(3, "2026-10-30")];
    expect(resumoParcelamento(base, doisAtrasos, hoje).risco).toBe("alto");
    expect(resumoParcelamento(base, [parc(0, "2026-07-31"), ...doisAtrasos], hoje).risco).toBe("rescisao");
    expect(resumoParcelamento(base, [parc(1, "2026-08-31", pago()), parc(2, "2026-09-30")], hoje).risco).toBe("rescisao");
    // sem a regra da última (estadual), 1 atrasada é só atenção
    expect(resumoParcelamento({ ...base, rescinde_ultima: false }, [parc(1, "2026-08-31", pago()), parc(2, "2026-09-30")], hoje).risco).toBe("atencao");
    expect(resumoParcelamento({ ...base, situacao: "quitado" }, doisAtrasos, hoje).risco).toBe("encerrado");
  });

  it("a vencer até a data, em ordem, sem pagas", () => {
    expect(aVencer([parc(2, "2026-11-30"), parc(1, "2026-10-30"), parc(3, "2026-09-30", pago())], "2026-11-30").map((x) => x.numero)).toEqual([1, 2]);
  });

  it("a mensagem ao contador não pede senha nem certificado", () => {
    expect(MENSAGEM_CONTADOR).not.toMatch(/senha|certificado|login/i);
  });
});
