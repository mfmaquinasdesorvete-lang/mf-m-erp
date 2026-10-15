import { describe, expect, it } from "vitest";
import { cfopDaOperacao, chaveValida, operacaoNota, OPERACOES_NOTA } from "../../../supabase/functions/_shared/nfe-operacoes";
import { itensEntrada as calcular, type OpcoesEntrada } from "../../../supabase/functions/_shared/nfe-entrada";
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
    expect(OPERACOES_NOTA.filter((o) => o.entrada).map((o) => o.id)).toEqual(["entrada_conserto", "compra_usado", "retorno_comodato", "retorno_demonstracao", "outras_entradas"]);
    expect(operacaoNota("compra_usado")?.cfop).toBe("1102");
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
