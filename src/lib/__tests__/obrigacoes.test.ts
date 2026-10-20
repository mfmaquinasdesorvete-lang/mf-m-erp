import { describe, expect, it } from "vitest";
import {
  ajustar, configDaUnidade, obrigacoesUrgentes, textoPrazo, diaUtil, feriados, nesimoDiaUtil, ocorrenciasNoPeriodo, pascoa, rotuloCompetencia, situacaoDe, ultimoDiaUtil,
  type UnidadeCal,
} from "../obrigacoes";

const SC: UnidadeCal = { id: "sc", nome: "Matriz SC", codigo: "SC", uf: "SC", matriz: true, assistencia: true };
const SP: UnidadeCal = { id: "sp", nome: "Filial SP", codigo: "SP", uf: "SP", matriz: false };
const venc = (lista: ReturnType<typeof ocorrenciasNoPeriodo>, chave: string, unidade?: string) =>
  lista.filter((o) => o.regra.chave === chave && (unidade === undefined || (o.unidade?.id ?? "empresa") === unidade)).map((o) => [o.competencia, o.vencimento]);

describe("dias úteis e feriados", () => {
  it("Páscoa e feriados móveis", () => {
    expect(pascoa(2025)).toBe("2025-04-20");
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
    const f = feriados(2026);
    expect(f.get("2026-02-16")).toBe("Carnaval");
    expect(f.get("2026-02-17")).toBe("Carnaval");
    expect(f.get("2026-04-03")).toBe("Sexta-feira Santa");
    expect(f.get("2026-06-04")).toBe("Corpus Christi");
    expect(f.get("2026-11-20")).toBe("Consciência Negra");
  });
  it("antecipa, prorroga, último e n-ésimo dia útil", () => {
    expect(diaUtil("2026-10-16")).toBe(true);
    expect(diaUtil("2026-10-17")).toBe(false); // sábado
    expect(diaUtil("2026-10-12")).toBe(false); // Nossa Senhora Aparecida
    expect(ajustar("2026-11-15", "antecipa")).toBe("2026-11-13");
    expect(ajustar("2026-11-15", "prorroga")).toBe("2026-11-16");
    expect(ultimoDiaUtil(2026, 10)).toBe("2026-10-30"); // 31/10 é sábado
    expect(ultimoDiaUtil(2026, 12)).toBe("2026-12-30"); // 31/12 sem expediente bancário
    expect(nesimoDiaUtil(2026, 11, 10)).toBe("2026-11-16"); // 2/11 Finados
  });
});

describe("calendário do Lucro Real", () => {
  const out2026 = ocorrenciasNoPeriodo("2026-10-01", "2026-10-31", [SC, SP], {});
  it("federais de setembro/2026 vencem em outubro, ajustadas para dia útil", () => {
    expect(venc(out2026, "esocial")).toEqual([["2026-09", "2026-10-15"]]);
    expect(venc(out2026, "inss_irrf_folha")).toEqual([["2026-09", "2026-10-20"]]);
    expect(venc(out2026, "pis_cofins")).toEqual([["2026-09", "2026-10-23"]]); // 25/10 é domingo
    expect(venc(out2026, "dctfweb")).toEqual([["2026-09", "2026-10-30"]]);
    expect(venc(out2026, "irpj_csll_estimativa")).toEqual([["2026-09", "2026-10-30"]]);
    expect(venc(out2026, "irpj_csll_trimestral")).toEqual([]); // padrão: anual com estimativa
    expect(venc(out2026, "efd_contribuicoes")).toEqual([["2026-08", "2026-10-15"]]); // 10º dia útil (12/10 feriado)
  });
  it("estaduais por unidade: SC com ICMS dia 10 e EFD dia 20; SP com EFD dia 20 e ICMS sem dia", () => {
    expect(venc(out2026, "icms", "sc")).toEqual([["2026-09", "2026-10-09"]]); // 10/10 é sábado
    expect(venc(out2026, "efd_icms_ipi", "sc")).toEqual([["2026-09", "2026-10-20"]]);
    expect(venc(out2026, "icms", "sp")).toEqual([["2026-09", null]]);
    expect(venc(out2026, "ipi", "sp")).toEqual([["2026-09", "2026-10-23"]]);
    expect(venc(out2026, "iss", "sc")).toEqual([["2026-09", null]]); // tem assistência, dia a definir
    expect(venc(out2026, "iss", "sp")).toEqual([]);
  });
  it("ajustes do contador: trimestral, sem folha, dia do ICMS de SP e sem IPI na filial", () => {
    const cfg = { irpj: "trimestral" as const, folha: false, unidades: { sp: { icms_dia: 20, ipi: false } } };
    const out = ocorrenciasNoPeriodo("2026-10-01", "2026-10-31", [SC, SP], cfg);
    expect(venc(out, "irpj_csll_estimativa")).toEqual([]);
    expect(venc(out, "irpj_csll_trimestral")).toEqual([["2026-T3", "2026-10-30"]]);
    expect(venc(out, "esocial")).toEqual([]);
    expect(venc(out, "fgts")).toEqual([]);
    expect(venc(out, "icms", "sp")).toEqual([["2026-09", "2026-10-20"]]);
    expect(venc(out, "ipi", "sp")).toEqual([]);
    expect(configDaUnidade(cfg, SC)).toMatchObject({ icms_dia: 10, efd_dia: 20, ipi: true, iss: true });
    // acompanhar a partir de novembro: o que vence em outubro fica de fora
    expect(ocorrenciasNoPeriodo("2026-10-01", "2026-11-30", [SC], { inicio: "2026-11" }).every((o) => (o.vencimento ?? o.mesReferencia) >= "2026-11")).toBe(true);
  });
  it("ICMS de SP pelo CPR do CNAE (Agenda Tributária Paulista de outubro/2026) e prazos a confirmar", () => {
    const comCpr = (cpr: string, extra = {}) => ocorrenciasNoPeriodo("2026-10-01", "2026-10-31", [SC, SP], { unidades: { sp: { icms_cpr: cpr, ...extra } } });
    expect(venc(comCpr("1031"), "icms", "sp")).toEqual([["2026-09", "2026-10-05"]]); // 3º dia útil
    expect(venc(comCpr("1200"), "icms", "sp")).toEqual([["2026-09", "2026-10-20"]]);
    expect(venc(comCpr("1250"), "icms", "sp")).toEqual([["2026-09", "2026-10-26"]]); // 25/10 é domingo
    const o = comCpr("1200", { icms_cpr_confirmado: false }).find((x) => x.regra.chave === "icms" && x.unidade?.id === "sp")!;
    expect(o.quando).toMatch(/CPR 1200.*a confirmar/);
    // o CPR só vale em SP: em SC continua o dia do ICMS
    const sc = ocorrenciasNoPeriodo("2026-10-01", "2026-10-31", [SC], { unidades: { sc: { icms_cpr: "1031", iss_dia: 10, iss_confirmado: false } } });
    expect(venc(sc, "icms", "sc")).toEqual([["2026-09", "2026-10-09"]]);
    expect(sc.find((x) => x.regra.chave === "iss")?.quando).toMatch(/dia 10.*a confirmar na prefeitura/);
  });
  it("anuais: ECD em junho, ECF em julho, ajuste em março, 13º em dezembro", () => {
    const ano = ocorrenciasNoPeriodo("2026-01-01", "2026-12-31", [SC], {});
    expect(venc(ano, "ecd")).toEqual([["2025", "2026-06-30"]]);
    expect(venc(ano, "ecf")).toEqual([["2025", "2026-07-31"]]);
    expect(venc(ano, "irpj_csll_ajuste")).toEqual([["2025", "2026-03-31"]]);
    expect(venc(ano, "informe_rendimentos")).toEqual([["2025", "2026-02-27"]]);
    expect(venc(ano, "inss_13")).toEqual([["2026", "2026-12-18"]]); // 20/12/2026 é domingo
    expect(ano.every((o, i) => i === 0 || (ano[i - 1].vencimento ?? "9") <= (o.vencimento ?? "9"))).toBe(true);
  });
  it("situação e rótulo da competência", () => {
    const [dctf] = out2026.filter((o) => o.regra.chave === "dctfweb");
    expect(situacaoDe(dctf, undefined, "2026-10-16")).toBe("futura");
    expect(situacaoDe(dctf, undefined, "2026-10-25")).toBe("proxima");
    expect(situacaoDe(dctf, undefined, "2026-10-30")).toBe("hoje");
    expect(situacaoDe(dctf, undefined, "2026-11-02")).toBe("atrasada");
    const reg = { chave: "dctfweb", competencia: "2026-09", unidade_id: null, feito_em: "2026-10-28", valor: null, recibo: "R1", observacao: null, registrado_nome: null };
    expect(situacaoDe(dctf, { ...reg, situacao: "feito" }, "2026-11-02")).toBe("feito");
    expect(situacaoDe(dctf, { ...reg, situacao: "pendente" }, "2026-11-02")).toBe("atrasada");
    expect(rotuloCompetencia("2026-09")).toBe("set/2026");
    expect(rotuloCompetencia("2026-T3")).toBe("3º tri/2026");
    expect(rotuloCompetencia("2025")).toBe("ano 2025");
  });
});

describe("aviso das obrigações urgentes", () => {
  const o = (vencimento: string | null, situacao: "atrasada" | "hoje" | "proxima" | "futura" | "feito") => ({ vencimento, situacao });
  it("atrasadas desde o início do acompanhamento e as que vencem em até 3 dias, mais urgentes primeiro", () => {
    const lista = [o("2026-10-25", "proxima"), o("2026-10-22", "proxima"), o("2026-10-20", "hoje"), o("2026-10-15", "atrasada"),
      o("2026-08-20", "atrasada"), o("2026-11-10", "futura"), o("2026-10-21", "feito"), o(null, "atrasada")];
    expect(obrigacoesUrgentes(lista, "2026-10-20", "2026-09").map((x) => x.vencimento)).toEqual(["2026-10-15", "2026-10-20", "2026-10-22"]);
    expect(obrigacoesUrgentes(lista, "2026-10-20", null).map((x) => x.vencimento)).toEqual(["2026-10-20", "2026-10-22"]);   // sem início: o passado não avisa
  });
  it("texto do prazo", () => {
    expect(textoPrazo("2026-10-18", "2026-10-20")).toBe("atrasada há 2 dias");
    expect(textoPrazo("2026-10-19", "2026-10-20")).toBe("atrasada há 1 dia");
    expect(textoPrazo("2026-10-20", "2026-10-20")).toBe("vence hoje");
    expect(textoPrazo("2026-10-21", "2026-10-20")).toBe("vence amanhã");
    expect(textoPrazo("2026-11-02", "2026-10-20")).toBe("vence em 13 dias");
  });
});
