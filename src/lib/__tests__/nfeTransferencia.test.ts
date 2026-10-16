// NF-e de transferência SC ↔ SP: CFOP (produção x revenda), ICMS (41 com cBenef x 00 com destaque), IPI,
// conferência antes de emitir, CFOP de entrada no destino e a rejeição explicada. Dados inventados.
import { describe, expect, it } from "vitest";
import { type ItemBase, itensTransferencia, produzidoNaUnidade, type RegraTributaria, type UnidadeFiscal } from "../../../supabase/functions/_shared/nfe-impostos";
import { cfopEntradaTransferencia, cfopTransferencia, pendenciasTransferencia, resumoEntradaTransferencia } from "../../../supabase/functions/_shared/nfe-transferencia";
import { cbenefObrigatorio, explicarRejeicao, itensSemCbenef } from "../../../supabase/functions/_shared/nfe-conferencia";

const transferir = (u: UnidadeFiscal, uf: string, itens: ItemBase[], regras?: RegraTributaria[]) =>
  itensTransferencia(u, uf, itens, { regras, unidade_id: "u-sc" }) as Record<string, any>[];

const sc: UnidadeFiscal = {
  uf: "SC", fabrica: true, natureza_operacao: "Venda", cfop_venda_producao: "5101", cfop_venda_revenda: "5102",
  icms_cst: "00", icms_aliquota_interna: 17, icms_reducao_base: 0, pis_cst: "01", pis_aliquota: 1.65, cofins_cst: "01", cofins_aliquota: 7.6,
  pis_cofins_exclui_icms: true, ipi_cst: "50", ipi_enquadramento: "999", difal_ativo: true, ipi_cst_aliquota_zero: "51",
  transf_icms_cst: "41", transf_pis_cofins_cst: "08", transf_destacar_ipi: true, transf_cbenef: "SC999999",
  transf_ibs_cbs_cst: "410", transf_ibs_cbs_class_trib: "410002",
};
const sp: UnidadeFiscal = { ...sc, uf: "SP", fabrica: false, transf_cbenef: null };

const maquina: ItemBase = { codigo: "MAQ-T", descricao: "Máquina de teste", ncm: "84186910", unidade: "UN", origem: 0, tipo: "maquina",
  quantidade: 1, valor_unitario: 10000, ipi_aliquota: 5, preco_venda: 20000 };
const peca: ItemBase = { codigo: "PEC-T", descricao: "Peça comprada", ncm: "84189900", unidade: "UN", origem: 0, tipo: "peca", quantidade: 2, valor_unitario: 50 };
const importada: ItemBase = { ...peca, codigo: "IMP-T", origem: 1 };

describe("produção da unidade (CFOP 5151/6151)", () => {
  it("máquina da fábrica é produção; comprada pronta é revenda", () => {
    expect(produzidoNaUnidade({ tipo: "maquina" }, { fabrica: true })).toBe(true);
    expect(produzidoNaUnidade({ tipo: "maquina", origem_producao: "comprado" }, { fabrica: true })).toBe(false);
    expect(produzidoNaUnidade({ tipo: "peca", origem_producao: "fabricado" }, { fabrica: true })).toBe(true);
    expect(produzidoNaUnidade({ tipo: "peca", origem_producao: "terceirizado" }, { fabrica: true })).toBe(true);
    expect(produzidoNaUnidade({ tipo: "peca", subconjunto_estocado: true }, { fabrica: true })).toBe(true);
    expect(produzidoNaUnidade({ tipo: "peca" }, { fabrica: true })).toBe(false);
    // filial que não fabrica nunca transfere como produção
    expect(produzidoNaUnidade({ tipo: "maquina", origem_producao: "fabricado" }, { fabrica: false })).toBe(false);
  });

  it("CFOP de saída: produção x comprado, dentro x fora do estado", () => {
    expect(cfopTransferencia(true, true)).toBe("6151");
    expect(cfopTransferencia(false, true)).toBe("6152");
    expect(cfopTransferencia(true, false)).toBe("5151");
    expect(cfopTransferencia(false, false)).toBe("5152");
    const [m, p] = transferir(sc, "SP", [maquina, peca]);
    expect(m.cfop).toBe("6151");
    expect(p.cfop).toBe("6152");
    expect(transferir(sc, "SC", [peca])[0].cfop).toBe("5152");
    expect(transferir(sc, "SP", [{ ...maquina, origem_producao: "comprado" }])[0].cfop).toBe("6152");
    expect(transferir(sp, "SC", [maquina])[0].cfop).toBe("6152");
  });
});

describe("ICMS da transferência", () => {
  it("CST 41 leva o cBenef da unidade e não leva valores", () => {
    const [i] = transferir(sc, "SP", [maquina]);
    expect(i).toMatchObject({ icms_situacao_tributaria: "41", codigo_beneficio_fiscal: "SC999999" });
    expect(i).not.toHaveProperty("icms_valor");
    expect(i).toMatchObject({ pis_situacao_tributaria: "08", cofins_situacao_tributaria: "08" });
  });

  it("cBenef da regra de transferência vale por cima do da unidade", () => {
    const regras: RegraTributaria[] = [{ nome: "Transferência", prioridade: 1, operacao: "transferencia", codigo_beneficio: "sc888888" }];
    expect(transferir(sc, "SP", [peca], regras)[0].codigo_beneficio_fiscal).toBe("SC888888");
  });

  it("CST 00 destaca 12% (4% no importado) sobre o custo e não manda cBenef", () => {
    const u = { ...sc, transf_icms_cst: "00" };
    const [m, i] = transferir(u, "SP", [maquina, importada]);
    expect(m).toMatchObject({ icms_situacao_tributaria: "00", icms_base_calculo: 10000, icms_aliquota: 12, icms_valor: 1200 });
    expect(m).not.toHaveProperty("codigo_beneficio_fiscal");
    expect(i).toMatchObject({ icms_aliquota: 4, icms_valor: 4 });
    // dentro do estado: alíquota interna
    expect(transferir(u, "SC", [peca])[0]).toMatchObject({ icms_aliquota: 17, icms_valor: 17 });
  });

  it("CST 90 sai sem valores e sem cBenef quando não há código", () => {
    const [i] = transferir({ ...sc, transf_icms_cst: "90", transf_cbenef: null }, "SP", [peca]);
    expect(i.icms_situacao_tributaria).toBe("90");
    expect(i).not.toHaveProperty("codigo_beneficio_fiscal");
  });
});

describe("IPI da transferência (RIPI)", () => {
  it("destaca no que a unidade fabrica, pelo custo ou pelo preço de venda", () => {
    expect(transferir(sc, "SP", [maquina])[0]).toMatchObject({ ipi_situacao_tributaria: "50", ipi_base_calculo: 10000, ipi_aliquota: 5, ipi_valor: 500 });
    expect(transferir({ ...sc, transf_ipi_base: "preco_venda" }, "SP", [maquina])[0]).toMatchObject({ ipi_base_calculo: 20000, ipi_valor: 1000 });
    expect(transferir(sc, "SP", [peca])[0]).not.toHaveProperty("ipi_situacao_tributaria");
  });

  it("sem destacar: sem IPI; TIPI 0%: CST de alíquota zero; regra com suspensão: só o código", () => {
    expect(transferir({ ...sc, transf_destacar_ipi: false }, "SP", [maquina])[0]).not.toHaveProperty("ipi_situacao_tributaria");
    expect(transferir(sc, "SP", [{ ...maquina, ipi_aliquota: 0 }])[0]).toMatchObject({ ipi_situacao_tributaria: "51" });
    const regras: RegraTributaria[] = [{ nome: "IPI suspenso", prioridade: 1, operacao: "transferencia", ipi_cst: "55", ipi_enquadramento: "105" }];
    const [i] = transferir(sc, "SP", [maquina], regras);
    expect(i).toMatchObject({ ipi_situacao_tributaria: "55", ipi_codigo_enquadramento_legal: "105" });
    expect(i).not.toHaveProperty("ipi_valor");
  });
});

describe("cBenef obrigatório e conferência antes de emitir", () => {
  it("SC exige o cBenef nos CST sem destaque; o 90 e o 00 passam; SP não está na lista", () => {
    expect(cbenefObrigatorio("SC", "41")).toBe(true);
    expect(cbenefObrigatorio("sc", "40")).toBe(true);
    expect(cbenefObrigatorio("SC", "50")).toBe(true);
    expect(cbenefObrigatorio("SC", "20")).toBe(true);
    expect(cbenefObrigatorio("SC", "90")).toBe(false);
    expect(cbenefObrigatorio("SC", "00")).toBe(false);
    expect(cbenefObrigatorio("SP", "41")).toBe(false);
    expect(itensSemCbenef("SC", [{ numero_item: 1, icms_situacao_tributaria: "41" }, { numero_item: 2, icms_situacao_tributaria: "41", codigo_beneficio_fiscal: "SC999999" }]))
      .toEqual([{ numero: 1, cst: "41", cbenef: "" }]);
  });

  it("bloqueia SC com CST 41 sem cBenef e diz onde configurar (a rejeição de hoje)", () => {
    const u = { ...sc, transf_cbenef: null };
    const itens = transferir(u, "SP", [maquina]);
    const p = pendenciasTransferencia({ origem: { nome: "Matriz SC", uf: "SC", transf_icms_cst: "41" }, itens, custos: [{ descricao: "Máquina", custo: 10000 }] });
    expect(p).toHaveLength(1);
    expect(p[0].nivel).toBe("erro");
    expect(p[0].texto).toContain("cBenef");
    expect(p[0].texto).toContain("Configurações da NF-e → Transferência (Matriz SC)");
    expect(p[0].texto).toContain("CST 00");
  });

  it("libera com o cBenef, com CST 00 e na saída de SP", () => {
    const custos = [{ descricao: "Máquina", custo: 10000 }];
    expect(pendenciasTransferencia({ origem: { uf: "SC", transf_icms_cst: "41" }, itens: transferir(sc, "SP", [maquina]), custos })).toEqual([]);
    expect(pendenciasTransferencia({ origem: { uf: "SC", transf_icms_cst: "00" }, itens: transferir({ ...sc, transf_icms_cst: "00", transf_cbenef: null }, "SP", [maquina]), custos })).toEqual([]);
    expect(pendenciasTransferencia({ origem: { uf: "SP", transf_icms_cst: "41" }, itens: transferir(sp, "SC", [peca]), custos })).toEqual([]);
  });

  it("bloqueia CST que não serve para transferência e item sem custo", () => {
    const p = pendenciasTransferencia({ origem: { uf: "SP", transf_icms_cst: "20" }, itens: [], custos: [{ descricao: "Peça sem custo", custo: 0 }] });
    expect(p.map((x) => x.nivel)).toEqual(["erro", "erro"]);
    expect(p[0].texto).toContain("CST 20");
    expect(p[1].texto).toContain("Peça sem custo");
    // a regra de transferência que troca o CST também é conferida
    const regras: RegraTributaria[] = [{ nome: "Errada", prioridade: 1, operacao: "transferencia", icms_cst: "20" }];
    const q = pendenciasTransferencia({ origem: { uf: "SP", transf_icms_cst: "41" }, itens: transferir(sp, "SC", [peca], regras), custos: [{ descricao: "Peça", custo: 50 }] });
    expect(q.map((x) => x.texto.includes("CST 20"))).toEqual([true]);
  });
});

describe("entrada da transferência no destino", () => {
  it("CFOP de entrada pelo uso no destino: a filial que revende entra com x152", () => {
    const filial = { fabrica: false }, fabrica = { fabrica: true };
    expect(cfopEntradaTransferencia("6151", filial)).toBe("2152");
    expect(cfopEntradaTransferencia("6152", filial)).toBe("2152");
    expect(cfopEntradaTransferencia("5151", filial)).toBe("1152");
    expect(cfopEntradaTransferencia("5152", filial)).toBe("1152");
    expect(cfopEntradaTransferencia("6152", fabrica, "insumo")).toBe("2151");
    expect(cfopEntradaTransferencia("6152", fabrica, "peca")).toBe("2152");
    expect(cfopEntradaTransferencia("6155", filial)).toBe("2152");
    expect(cfopEntradaTransferencia("6552", filial)).toBe("2552");
    expect(cfopEntradaTransferencia("6557", filial)).toBe("2557");
    expect(cfopEntradaTransferencia("6409", filial)).toBe("2409");
    expect(cfopEntradaTransferencia("abc", filial)).toBe("");
  });

  it("resumo do livro de entradas: CFOP, crédito do ICMS destacado e IPI", () => {
    const saida = transferir({ ...sc, transf_icms_cst: "00" }, "SP", [maquina, peca]);
    const r = resumoEntradaTransferencia(saida, { fabrica: false });
    expect(r.cfops).toBe("2152");
    expect(r.icms_credito).toBe(1212);
    expect(r.ipi_destacado).toBe(500);
    expect(r.itens.map((i) => [i.cfop, i.cfop_entrada])).toEqual([["6151", "2152"], ["6152", "2152"]]);
    // sem destaque (CST 41): nada a creditar
    expect(resumoEntradaTransferencia(transferir(sc, "SP", [peca]), { fabrica: false }).icms_credito).toBe(0);
  });
});

describe("rejeição da SEFAZ explicada", () => {
  it("cBenef faltando: diz o que fazer e o item", () => {
    const e = explicarRejeicao("Rejeicao: CST com beneficio fiscal e nao informado o codigo de beneficio fiscal [nItem:1]")!;
    expect(e.titulo).toContain("código de benefício");
    expect(e.oQueFazer).toContain("Configurações da NF-e → Transferência");
    expect(e.item).toBe(1);
  });

  it("outros casos e mensagem desconhecida", () => {
    expect(explicarRejeicao("Rejeicao: Duplicidade de NF-e")!.titulo).toContain("número");
    expect(explicarRejeicao("Rejeicao: NCM inexistente [nItem:2]")!.item).toBe(2);
    expect(explicarRejeicao("Rejeicao: algo novo")!.titulo).toBe("A SEFAZ recusou a nota");
    expect(explicarRejeicao("")).toBeNull();
  });
});
