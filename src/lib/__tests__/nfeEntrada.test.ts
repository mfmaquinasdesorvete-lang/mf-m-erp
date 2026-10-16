import { describe, expect, it } from "vitest";
import { cfopDaOperacao, chaveValida, operacaoNota, OPERACOES_NOTA } from "../../../supabase/functions/_shared/nfe-operacoes";
import { itensEntrada as calcular, cstPisCofinsDevolucao, type OpcoesEntrada, pendenciasEntrada } from "../../../supabase/functions/_shared/nfe-entrada";
import type { ItemBase, RegraTributaria } from "../../../supabase/functions/_shared/nfe-impostos";
import type { OperacaoNota } from "../../../supabase/functions/_shared/nfe-operacoes";

const itensEntrada = (op: OperacaoNota, itens: ItemBase[], o: OpcoesEntrada) => calcular(op, itens, o) as Record<string, any>[];

// chave inventada (CNPJ de teste) com o dígito verificador certo
const CHAVE = "42251011222333000181550010000001841123456781";

const maquina: ItemBase = {
  codigo: "MAQ-1", descricao: "Máquina de sorvete usada · série 123", ncm: "84186910", unidade: "UN", origem: 0, tipo: "maquina",
  quantidade: 1, valor_unitario: 8000, cfop: "5101", ipi_aliquota: 5,
};
const base = { ufEmitente: "SC", ufRemetente: "SC", contribuinte: false, aliquotaInterna: 17, ibsCbs: { ativo: true, cbs: 0.9, ibs_uf: 0.1, ibs_mun: 0 }, ibsCbsUnidade: { cst: "000", class_trib: "000001" } };

describe("operações de entrada", () => {
  it("separa entradas e saídas e acha a operação", () => {
    expect(OPERACOES_NOTA.filter((o) => o.entrada).map((o) => o.id)).toEqual(["entrada_conserto", "entrada_retorno_conserto", "compra_usado", "compra_usado_industrializacao", "retorno_comodato", "retorno_demonstracao", "outras_entradas"]);
    expect(operacaoNota("compra_usado")?.cfop).toBe("1102");
    expect(operacaoNota("compra_usado_industrializacao")?.cfop).toBe("1101");
    expect(operacaoNota("entrada_retorno_conserto")?.cfop).toBe("1916");
    // retornos citam a nota de remessa
    expect(OPERACOES_NOTA.filter((o) => o.exige_referencia).map((o) => o.cfop)).toEqual(["1916", "1909", "1913"]);
    expect(operacaoNota("venda")?.entrada).toBeFalsy();
  });

  it("CFOP de outro estado: 5→6 na saída e 1→2 na entrada", () => {
    expect(cfopDaOperacao("5915", true)).toBe("6915");
    expect(cfopDaOperacao("1915", true)).toBe("2915");
    expect(cfopDaOperacao("1915", false)).toBe("1915");
  });

  it("confere a chave de acesso (44 números e dígito verificador)", () => {
    expect(chaveValida(CHAVE)).toBe(CHAVE);
    expect(chaveValida("4225 1011 2223 3300 0181 5500 1000 0001 8411 2345 6781")).toBe(CHAVE);
    expect(chaveValida(CHAVE.slice(0, 43) + "0")).toBe("");
    expect(chaveValida("123")).toBe("");
    expect(chaveValida(null)).toBe("");
  });
});

describe("itens da nota de entrada", () => {
  it("compra de usado de pessoa física: CFOP 1102, ICMS 90 sem destaque, PIS/COFINS 70 zerados, sem IPI", () => {
    const [i] = itensEntrada(operacaoNota("compra_usado")!, [maquina], base);
    expect(i.cfop).toBe("1102");
    expect(i.icms_situacao_tributaria).toBe("90");
    expect(i).not.toHaveProperty("icms_valor");
    expect(i).not.toHaveProperty("ipi_situacao_tributaria");
    expect(i).toMatchObject({ pis_situacao_tributaria: "70", pis_base_calculo: 0, pis_aliquota_porcentual: 0, pis_valor: 0, cofins_situacao_tributaria: "70", cofins_valor: 0 });
    expect(i.valor_bruto).toBe(8000);
    // IBS/CBS da unidade (2026: só informativo)
    expect(i).toMatchObject({ ibs_cbs_situacao_tributaria: "000", cbs_valor: 72 });
  });

  it("conserto vindo de outro estado: CFOP 2915, ICMS suspenso 50, PIS/COFINS 98, IBS/CBS 410", () => {
    const [i] = itensEntrada(operacaoNota("entrada_conserto")!, [maquina], { ...base, ufRemetente: "PR" });
    expect(i.cfop).toBe("2915");
    expect(i.icms_situacao_tributaria).toBe("50");
    expect(i.pis_situacao_tributaria).toBe("98");
    expect(i).toMatchObject({ ibs_cbs_situacao_tributaria: "410", ibs_cbs_classificacao_tributaria: "410999" });
    expect(i).not.toHaveProperty("cbs_valor");
  });

  it("regra do CFOP da entrada vale; regras de saída e de outro CFOP não", () => {
    const usadas = new Set<RegraTributaria>();
    const regras: RegraTributaria[] = [
      { nome: "Venda geral", prioridade: 1, icms_cst: "20", icms_reducao_base: 50 },
      { nome: "Conserto 1915", prioridade: 5, cfop: "1915", icms_cst: "41", codigo_beneficio: "sc000001", observacao_nfe: "Conserto." },
    ];
    const [i] = itensEntrada(operacaoNota("entrada_conserto")!, [maquina], { ...base, regras, usadas });
    expect(i.icms_situacao_tributaria).toBe("41");
    expect(i.codigo_beneficio_fiscal).toBe("SC000001");
    expect([...usadas].map((r) => r.nome)).toEqual(["Conserto 1915"]);
    const [semRegra] = itensEntrada(operacaoNota("compra_usado")!, [maquina], { ...base, regras });
    expect(semRegra.icms_situacao_tributaria).toBe("90");
  });

  it("regra com crédito: ICMS e PIS/COFINS com valor", () => {
    const regras: RegraTributaria[] = [{ nome: "Compra com crédito", prioridade: 1, cfop: "1102", icms_cst: "00", icms_aliquota: 12, pis_cst: "50", pis_aliquota: 1.65, cofins_cst: "50", cofins_aliquota: 7.6 }];
    const [i] = itensEntrada(operacaoNota("compra_usado")!, [maquina], { ...base, regras });
    expect(i).toMatchObject({ icms_situacao_tributaria: "00", icms_base_calculo: 8000, icms_aliquota: 12, icms_valor: 960 });
    expect(i).toMatchObject({ pis_base_calculo: 7040, pis_valor: 116.16, cofins_valor: 535.04 });
  });

  it("recusa operação de saída", () => {
    expect(() => itensEntrada(operacaoNota("venda")!, [maquina], base)).toThrow();
  });
});

describe("Lucro Real: CST de entrada e conferência antes de emitir", () => {
  it("cada entrada com o CST coerente: crédito só na compra de PJ de bem tributado (por regra); sem crédito nas demais", () => {
    const esperado: Record<string, [string, string]> = {
      entrada_conserto: ["1915", "50"], entrada_retorno_conserto: ["1916", "50"], compra_usado: ["1102", "90"], compra_usado_industrializacao: ["1101", "90"],
      retorno_comodato: ["1909", "41"], retorno_demonstracao: ["1913", "41"], outras_entradas: ["1949", "90"],
    };
    for (const [id, [cfop, cst]] of Object.entries(esperado)) {
      const [i] = itensEntrada(operacaoNota(id)!, [maquina], base);
      expect([i.cfop, i.icms_situacao_tributaria]).toEqual([cfop, cst]);
      expect(["70", "98"]).toContain(i.pis_situacao_tributaria);
      expect(i).not.toHaveProperty("ipi_valor");
    }
    // de outro estado: 1→2
    expect(itensEntrada(operacaoNota("entrada_retorno_conserto")!, [maquina], { ...base, ufRemetente: "PR" })[0].cfop).toBe("2916");
  });

  it("SC com CST 41/50 sem cBenef: bloqueia e manda criar a regra do CFOP", () => {
    const op = operacaoNota("retorno_comodato")!;
    const itens = itensEntrada(op, [maquina], base);
    const p = pendenciasEntrada(op, { ufEmitente: "SC", itens, chaveReferenciada: CHAVE });
    expect(p).toHaveLength(1);
    expect(p[0].nivel).toBe("erro");
    expect(p[0].texto).toContain("CFOP 1909");
    // com a regra do CFOP e o código, passa
    const regras: RegraTributaria[] = [{ nome: "Comodato", prioridade: 1, cfop: "1909", codigo_beneficio: "SC777777" }];
    expect(pendenciasEntrada(op, { ufEmitente: "SC", itens: itensEntrada(op, [maquina], { ...base, regras }), chaveReferenciada: CHAVE })).toEqual([]);
    // SP não pede cBenef; compra de usado (CST 90) também não
    expect(pendenciasEntrada(op, { ufEmitente: "SP", itens, chaveReferenciada: CHAVE })).toEqual([]);
    const compra = operacaoNota("compra_usado")!;
    expect(pendenciasEntrada(compra, { ufEmitente: "SC", itens: itensEntrada(compra, [maquina], base) })).toEqual([]);
  });

  it("retorno sem a chave da remessa: bloqueia", () => {
    const op = operacaoNota("retorno_demonstracao")!;
    const p = pendenciasEntrada(op, { ufEmitente: "SP", itens: itensEntrada(op, [maquina], { ...base, ufEmitente: "SP", ufRemetente: "SP" }), chaveReferenciada: null });
    expect(p.map((x) => x.nivel)).toEqual(["erro"]);
    expect(p[0].texto).toContain("NF de remessa");
  });

  it("devolução: venda tributada dá crédito (50); sem PIS/COFINS na venda, 98; compra estorna (49)", () => {
    expect(cstPisCofinsDevolucao("venda", 16.5)).toBe("50");
    expect(cstPisCofinsDevolucao("venda", 0)).toBe("98");
    expect(cstPisCofinsDevolucao("compra", 16.5)).toBe("49");
  });
});
