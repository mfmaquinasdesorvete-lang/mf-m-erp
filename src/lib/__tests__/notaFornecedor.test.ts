import { describe, expect, it } from "vitest";
import {
  compararNotaOc, conferirTotal, creditosItem, custoItem, custosDaNota, distribuirAcessorias, fatorDaDescricao, itemSemImpostos,
  lerXmlNota, markup, margemPeloPreco, numeroBR, ordenarOcsSugeridas, precoDoItem, precoPelaMargem, quantidadeErp, ratear, sugerirVinculo, valorPorUnidadeErp,
  variacaoPct, type ItemCusto, type ItemOc,
} from "../notaFornecedor";
import { PRECO_PADRAO, type ConfigPreco } from "../precificacao";
import { cfopDeCompra as cfopAnalista, COFINS, PIS } from "../analistaFiscal";
import { cfopDeCompra, custosAutomaticos, opcoesPadraoNota } from "../../../supabase/functions/_shared/nota-custo";

// XML inventado (empresa, códigos e valores de exemplo)
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe00000000000000000000000000000000000000000000" versao="4.00">
<det nItem="1"><prod><cProd>AB-100</cProd><cEAN>7890000000017</cEAN><xProd>Rolamento teste &amp; cia</xProd><NCM>84821010</NCM><CFOP>6102</CFOP>
<uCom>cx</uCom><qCom>2.0000</qCom><vUnCom>500.0000000000</vUnCom><vProd>1000.00</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>CX</uTrib><qTrib>2.0000</qTrib>
<vFrete>30.00</vFrete><indTot>1</indTot></prod>
<imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>1030.00</vBC><pICMS>12.00</pICMS><vICMS>123.60</vICMS></ICMS00></ICMS>
<IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>1000.00</vBC><pIPI>10.00</pIPI><vIPI>100.00</vIPI></IPITrib></IPI>
<PIS><PISAliq><CST>01</CST><vBC>1000.00</vBC><pPIS>1.65</pPIS><vPIS>16.50</vPIS></PISAliq></PIS>
<COFINS><COFINSAliq><CST>01</CST><vBC>1000.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>76.00</vCOFINS></COFINSAliq></COFINS></imposto></det>
<det nItem="2"><prod><cProd>0042</cProd><cEAN>SEM GTIN</cEAN><xProd>Vedação teste</xProd><NCM>40169300</NCM><CFOP>5102</CFOP>
<uCom>UN</uCom><qCom>10</qCom><vUnCom>5</vUnCom><vProd>50.00</vProd><vDesc>5.00</vDesc><indTot>1</indTot></prod>
<imposto><ICMS><ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><pCredSN>2.50</pCredSN><vCredICMSSN>1.25</vCredICMSSN></ICMSSN101></ICMS>
<PIS><PISOutr><CST>99</CST><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>99</CST><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>
<total><ICMSTot><vBC>1030.00</vBC><vICMS>123.60</vICMS><vST>0.00</vST><vFCPST>0.00</vFCPST><vProd>1050.00</vProd><vFrete>40.00</vFrete><vSeg>0.00</vSeg>
<vDesc>5.00</vDesc><vIPI>100.00</vIPI><vPIS>16.50</vPIS><vCOFINS>76.00</vCOFINS><vOutro>0.00</vOutro><vNF>1185.00</vNF></ICMSTot></total>
<pag><detPag><tPag>15</tPag><vPag>1185.00</vPag></detPag></pag></infNFe></NFe></nfeProc>`;

const cfg = (c: Partial<ConfigPreco> = {}): ConfigPreco => ({ ...PRECO_PADRAO, ...c });

const base: ItemCusto = {
  cfop: "5102", quantidade: 10, valor_produto: 2000, frete: 0, seguro: 0, outras: 0, desconto: 0,
  ipi: 200, icms: 240, icms_st: 0, fcp_st: 0, credito_sn: 0,
};

describe("lerXmlNota", () => {
  it("lê itens, impostos e totais", () => {
    const r = lerXmlNota(XML)!;
    expect(r.itens).toHaveLength(2);
    const [a, b] = r.itens;
    expect(a).toMatchObject({
      numero: 1, codigo: "AB-100", ean: "7890000000017", descricao: "Rolamento teste & cia", cfop: "6102", unidade: "CX",
      quantidade: 2, valor_unitario: 500, valor_produto: 1000, frete: 30, ipi: 100, icms: 123.6, pis: 16.5, cofins: 76, cst_icms: "00",
    });
    expect(b).toMatchObject({ numero: 2, codigo: "0042", ean: null, desconto: 5, icms: 0, credito_sn: 1.25, cst_icms: "101", ipi: 0 });
    expect(r.totais).toMatchObject({ produtos: 1050, frete: 40, desconto: 5, ipi: 100, icms: 123.6, total: 1185 });
  });

  it("aceita prefixo de namespace e devolve null sem itens", () => {
    const comPrefixo = XML.replace(/<(\/?)(det|prod|imposto|ICMS|ICMS00|cProd|vProd|qCom)\b/g, "<$1nfe:$2");
    expect(lerXmlNota(comPrefixo)!.itens[0].codigo).toBe("AB-100");
    expect(lerXmlNota("<resNFe><chNFe>1</chNFe></resNFe>")).toBeNull();
    expect(lerXmlNota(null)).toBeNull();
  });

  it("item sem XML completo vira item sem impostos", () => {
    const i = itemSemImpostos({ numero: 3, codigo: "X1", descricao: "Peça", quantidade: 4, valor_unitario: 2.5, valor_total: 10, unidade: "pc" });
    expect(i).toMatchObject({ unidade: "PC", valor_produto: 10, ipi: 0, icms: 0, frete: 0 });
  });
});

describe("rateio", () => {
  it("divide em centavos e a soma bate", () => {
    const partes = ratear(10, [1, 1, 1]);
    expect(partes).toEqual([3.34, 3.33, 3.33]);
    expect(partes.reduce((s, p) => s + p, 0)).toBeCloseTo(10, 10);
    expect(ratear(100, [300, 100])).toEqual([75, 25]);
  });

  it("sem peso divide igual; valor negativo mantém o sinal; lista vazia", () => {
    expect(ratear(1, [0, 0])).toEqual([0.5, 0.5]);
    expect(ratear(-0.03, [1, 1])).toEqual([-0.02, -0.01]);
    expect(ratear(5, [])).toEqual([]);
  });

  it("despesa só no total é rateada pelo valor; a que veio no item fica", () => {
    const itens = [{ valor_produto: 1000, frete: 30 }, { valor_produto: 50 }];
    const r = distribuirAcessorias(itens, { frete: 40, seguro: 0, outras: 0, desconto: 5 });
    // faltavam 10 de frete: 1000/1050 e 50/1050
    expect(r[0].frete).toBeCloseTo(39.52, 2);
    expect(r[1].frete).toBeCloseTo(0.48, 2);
    expect(r[0].frete + r[1].frete).toBeCloseTo(40, 10);
    // desconto só no total: rateado também
    expect(r.map((x) => x.desconto)).toEqual([4.76, 0.24]);
  });
});

describe("créditos (Lucro Real, estimativa)", () => {
  it("revenda: ICMS, PIS e COFINS; IPI fica no custo e entra na base", () => {
    const c = creditosItem(base, "revenda");
    // base = 2000 + 200 (IPI não recuperado) − 240 (ICMS) = 1960
    expect(c).toEqual({ icms: 240, ipi: 0, pis: 32.34, cofins: 148.96, base_pis_cofins: 1960, total: 421.3 });
  });

  it("industrialização: também o IPI, que sai da base", () => {
    const c = creditosItem(base, "industrializacao");
    expect(c).toEqual({ icms: 240, ipi: 200, pis: 29.04, cofins: 133.76, base_pis_cofins: 1760, total: 602.8 });
  });

  it("uso e consumo e operação que não é compra não dão crédito", () => {
    expect(creditosItem(base, "consumo").total).toBe(0);
    expect(creditosItem({ ...base, cfop: "5915" }, "revenda").total).toBe(0);
    expect(creditosItem({ ...base, cfop: null }, "revenda").total).toBe(0);
  });

  it("compra com ST (x4xx) não credita ICMS; fornecedor do Simples credita o vCredICMSSN", () => {
    expect(creditosItem({ ...base, cfop: "5405" }, "revenda").icms).toBe(0);
    const sn = creditosItem({ ...base, icms: 0, ipi: 0, credito_sn: 50 }, "revenda");
    expect(sn.icms).toBe(50);
    expect(sn.base_pis_cofins).toBe(2000);
  });
});

describe("custo de entrada", () => {
  it("custo cheio e líquido, por unidade do ERP", () => {
    const cheio = custoItem({ ...base, frete: 40, desconto: 20, icms_st: 0 }, 1, { finalidade: "revenda", descontarCreditos: false });
    expect(cheio.custo_cheio).toBe(2220);
    expect(cheio.custo_total).toBe(2220);
    expect(cheio.custo_unitario).toBe(222);
    const liquido = custoItem(base, 1, { finalidade: "revenda", descontarCreditos: true });
    expect(liquido.custo_cheio).toBe(2200);
    expect(liquido.custo_total).toBe(1778.7);
    expect(liquido.custo_unitario).toBe(177.87);
  });

  it("caixa com 12: divide pela quantidade do ERP", () => {
    const c = custoItem({ ...base, ipi: 0, icms: 0, quantidade: 2, valor_produto: 120 }, 12, { finalidade: "consumo", descontarCreditos: true });
    expect(c.quantidade_erp).toBe(24);
    expect(c.custo_unitario).toBe(5);
    expect(c.fator).toBe(12);
  });

  it("ICMS-ST e FCP-ST entram no custo", () => {
    const c = custoItem({ ...base, ipi: 0, icms: 0, icms_st: 90, fcp_st: 10 }, 1, { finalidade: "revenda", descontarCreditos: false });
    expect(c.icms_st).toBe(100);
    expect(c.custo_cheio).toBe(2100);
  });

  it("nota inteira: rateio, despesa extra e conferência com o total", () => {
    const { itens, totais } = lerXmlNota(XML)!;
    const contas = custosDaNota(itens, totais, [12, 1], { finalidade: "revenda", descontarCreditos: false, despesaExtra: 21 });
    expect(contas.map((c) => c.extra)).toEqual([20, 1]);
    expect(conferirTotal(contas, totais, 21)).toBe(0);
    expect(contas[0].quantidade_erp).toBe(24);
    // 1000 + 39,52 de frete + 100 de IPI + 20 de extra = 1159,52 ÷ 24 (o desconto veio todo no item 2)
    expect(contas[0].custo_total).toBe(1159.52);
    expect(contas[0].custo_unitario).toBe(48.3133);
    expect(contas[1].desconto).toBe(5);
    expect(conferirTotal(contas, null)).toBeNull();
  });

  it("variação do custo", () => {
    expect(variacaoPct(100, 110)).toBe(10);
    expect(variacaoPct(80, 60)).toBe(-25);
    expect(variacaoPct(0, 60)).toBeNull();
  });
});

describe("número digitado", () => {
  it("entende vírgula, milhar, R$ e %", () => {
    expect(numeroBR("1.250,90")).toBe(1250.9);
    expect(numeroBR("285,72")).toBe(285.72);
    expect(numeroBR("285.72")).toBe(285.72);
    expect(numeroBR("1.250")).toBe(1250);
    expect(numeroBR("R$ 10")).toBe(10);
    expect(numeroBR("65%")).toBe(65);
    expect(numeroBR("")).toBeNull();
    expect(numeroBR("abc")).toBeNull();
    expect(numeroBR(3)).toBe(3);
  });
});

describe("preço pela regra de margem", () => {
  it("margem → preço e preço → margem, como na formação de preço", () => {
    const c = cfg({ impostos_pct: 10 });
    expect(precoPelaMargem(100, 40, c)).toBe(200);
    expect(margemPeloPreco(200, 100, c)).toBe(40);
    expect(markup(200, 100)).toBe(2);
    expect(markup(0, 100)).toBeNull();
    expect(precoPelaMargem(100, 90, c)).toBeNull();
  });

  it("preço do item: regra, margem digitada ou preço digitado", () => {
    const c = cfg({ impostos_pct: 10, tolerancia_pct: 5 });
    expect(precoDoItem({ custo: 100, precoAtual: 150, margemAlvo: 40 }, c)).toEqual({ margem: 40, preco: 200, fonte: "regra", markup: 2, fora_da_faixa: true });
    expect(precoDoItem({ custo: 100, precoAtual: 200, margemAlvo: 40, margem: 50 }, c)).toMatchObject({ preco: 250, fonte: "margem", fora_da_faixa: true });
    expect(precoDoItem({ custo: 100, precoAtual: 200, margemAlvo: 40, preco: 195 }, c)).toMatchObject({ margem: 38.7, fonte: "preco", fora_da_faixa: false });
  });
});

describe("vínculo e unidade", () => {
  const produtos = [
    { id: "p1", descricao: "Rolamento", sku: "ROL-1", codigo_barras: "7890000000017" },
    { id: "p2", descricao: "Vedação", sku: "0042", codigo_fabricante: "VD-77" },
    { id: "p3", descricao: "Antigo", sku: "AB100X", unificado_em: "p1" },
    { id: "p4", descricao: "Motor", sku: "MTR9" },
  ];

  it("código do fornecedor primeiro (com o fator), depois EAN, fabricante e SKU", () => {
    expect(sugerirVinculo({ codigo: "ab 100" }, [{ codigo_fornecedor: "AB100", produto_id: "p4", fator_conversao: 12 }], produtos))
      .toEqual({ produto_id: "p4", fator: 12, origem: "fornecedor" });
    expect(sugerirVinculo({ codigo: "Z", ean: "7890000000017" }, [], produtos)).toEqual({ produto_id: "p1", fator: 1, origem: "ean" });
    expect(sugerirVinculo({ codigo: "vd-77" }, [], produtos)).toEqual({ produto_id: "p2", fator: 1, origem: "fabricante" });
    expect(sugerirVinculo({ codigo: "mtr9" }, [], produtos)).toEqual({ produto_id: "p4", fator: 1, origem: "sku" });
  });

  it("não liga por SKU numérico curto nem a produto unificado", () => {
    expect(sugerirVinculo({ codigo: "0042" }, [], produtos)).toBeNull();
    expect(sugerirVinculo({ codigo: "AB100X" }, [], produtos)).toBeNull();
  });

  it("fator pela descrição só em unidade de embalagem", () => {
    expect(fatorDaDescricao("PARAFUSO M6 CX C/ 100", "CX")).toBe(100);
    expect(fatorDaDescricao("Luva nitrílica caixa com 50 un", "CAIXA")).toBe(50);
    expect(fatorDaDescricao("Abraçadeira 200 PCS", "PCT")).toBe(200);
    expect(fatorDaDescricao("PARAFUSO C/ 100", "UN")).toBeNull();
    expect(fatorDaDescricao("Fita 10MM", "RL")).toBeNull();
  });

  it("converte quantidade e valor para a unidade do ERP", () => {
    expect(quantidadeErp(2, 12)).toBe(24);
    expect(quantidadeErp(3, 0)).toBe(3);
    expect(valorPorUnidadeErp(60, 12)).toBe(5);
  });
});

describe("nota × ordem de compra", () => {
  const oc: ItemOc[] = [
    { id: "i2", pedido_compra_id: "oc2", numero: 12, produto_id: "p1", descricao: "Rolamento", quantidade: 10, quantidade_recebida: 0, custo_unitario: 10 },
    { id: "i1", pedido_compra_id: "oc1", numero: 11, produto_id: "p1", descricao: "Rolamento", quantidade: 5, quantidade_recebida: 3, custo_unitario: 10 },
    { id: "i3", pedido_compra_id: "oc1", numero: 11, produto_id: "p2", descricao: "Vedação", quantidade: 4, quantidade_recebida: 0, custo_unitario: 2 },
    { id: "i4", pedido_compra_id: "oc1", numero: 11, produto_id: "p5", descricao: "Junta", quantidade: 1, quantidade_recebida: 0, custo_unitario: 7 },
  ];

  it("baixa na OC mais antiga primeiro e aponta a mais, a menos, fora da OC e não veio", () => {
    const r = compararNotaOc([
      { produto_id: "p1", descricao: "Rolamento", quantidade: 8, preco_unitario: 10.1 },
      { produto_id: "p1", descricao: "Rolamento", quantidade: 6, preco_unitario: 10.1 },
      { produto_id: "p2", descricao: "Vedação", quantidade: 5, preco_unitario: 2.1 },
      { produto_id: "p9", descricao: "Brinde", quantidade: 1, preco_unitario: 1 },
    ], oc);
    const l = Object.fromEntries(r.linhas.map((x) => [x.produto_id, x]));
    // p1: pendente 2 (OC 11) + 10 (OC 12) = 12; nota 14 → 2 a mais
    expect(l.p1.baixas).toEqual([
      { item_id: "i1", pedido_compra_id: "oc1", numero: 11, quantidade: 2 },
      { item_id: "i2", pedido_compra_id: "oc2", numero: 12, quantidade: 10 },
    ]);
    expect(l.p1).toMatchObject({ qtd_nota: 14, qtd_pendente: 12, qtd_baixa: 12, diferenca: 2, situacao: "a_mais", dif_preco_pct: 1, alerta_preco: false });
    // p2: 5% mais caro que a OC → alerta
    expect(l.p2).toMatchObject({ qtd_baixa: 4, situacao: "a_mais", dif_preco_pct: 5, alerta_preco: true });
    expect(l.p9).toMatchObject({ situacao: "fora_da_oc", qtd_baixa: 0 });
    expect(l.p5).toMatchObject({ situacao: "nao_veio", diferenca: -1 });
    expect(r.baixas).toHaveLength(3);
    expect(r.alertas).toBe(4);
  });

  it("sem preço na nota (técnico não vê o valor): compara só a quantidade", () => {
    const r = compararNotaOc([{ produto_id: "p2", descricao: "Vedação", quantidade: 4, preco_unitario: null }], oc.filter((i) => i.produto_id === "p2"));
    expect(r.linhas[0]).toMatchObject({ situacao: "confere", preco_nota: null, dif_preco_pct: null, alerta_preco: false });
  });

  it("veio a menos e confere", () => {
    const r = compararNotaOc([{ produto_id: "p2", descricao: "Vedação", quantidade: 3, preco_unitario: 2 }], oc.filter((i) => i.produto_id === "p2"));
    expect(r.linhas[0]).toMatchObject({ situacao: "a_menos", diferenca: -1, qtd_baixa: 3, alerta_preco: false });
    const ok = compararNotaOc([{ produto_id: "p2", descricao: "Vedação", quantidade: 4, preco_unitario: 2.02 }], oc.filter((i) => i.produto_id === "p2"));
    expect(ok.linhas[0]).toMatchObject({ situacao: "confere", dif_preco_pct: 1 });
    expect(ok.alertas).toBe(0);
  });

  it("sugere as OC abertas com produtos da nota e as já ligadas", () => {
    const ocs = [
      { id: "a", numero: 3, status: "enviado", ligada: false, itens: [{ produto_id: "p1", quantidade: 1, quantidade_recebida: 0 }] },
      { id: "b", numero: 2, status: "parcial", ligada: false, itens: [{ produto_id: "p1", quantidade: 1, quantidade_recebida: 0 }, { produto_id: "p2", quantidade: 1, quantidade_recebida: 0 }] },
      { id: "c", numero: 1, status: "enviado", ligada: false, itens: [{ produto_id: "p7", quantidade: 1, quantidade_recebida: 0 }] },
      { id: "d", numero: 4, status: "recebido", ligada: true, itens: [] },
      { id: "e", numero: 5, status: "cotacao", ligada: false, itens: [{ produto_id: "p1", quantidade: 1, quantidade_recebida: 0 }] },
    ];
    expect(ordenarOcsSugeridas(ocs, ["p1", "p2"]).map((o) => [o.id, o.comuns])).toEqual([["d", 0], ["b", 2], ["a", 1]]);
  });
});

describe("mesma conta na tela e na entrada automática", () => {
  it("CFOP de compra e alíquotas iguais às do Analista fiscal", () => {
    for (const c of ["5101", "6102", "5405", "6403", "5915", "5152", "5551", "6201", "1102", "7101", "", null]) {
      expect(cfopDeCompra(c)).toBe(cfopAnalista(c));
    }
    expect([PIS, COFINS]).toEqual([1.65, 7.6]);
  });

  it("padrão: custo líquido e revenda, a não ser que a configuração diga outra coisa", () => {
    expect(opcoesPadraoNota(null)).toEqual({ finalidade: "revenda", descontarCreditos: true });
    expect(opcoesPadraoNota({ custo_nota: "cheio", finalidade_nota: "industrializacao" })).toEqual({ finalidade: "industrializacao", descontarCreditos: false });
    expect(opcoesPadraoNota({ finalidade_nota: "qualquer" }).finalidade).toBe("revenda");
  });

  it("entrada automática: conta completa dos itens ligados, com o fator", () => {
    const itens = [
      { numero: 1, codigo: "AB-100", descricao: "Rolamento", produto_id: "p1", quantidade: 2, fator: 12, valor_unitario: 500, valor_total: 1000, cfop: "6102" },
      { numero: 2, codigo: "0042", descricao: "Vedação", produto_id: null, quantidade: 10, fator: 1, valor_unitario: 5, valor_total: 50, cfop: "5102" },
    ];
    const r = custosAutomaticos(XML, itens, { finalidade: "revenda", descontarCreditos: false });
    expect(r).toHaveLength(1);
    // igual à tela: 1000 + 39,52 de frete + 100 de IPI = 1139,52 ÷ 24
    expect(r[0]).toMatchObject({ numero: 1, produto_id: "p1", fator: 12, quantidade_erp: 24, custo_total: 1139.52, custo_unitario: 47.48, atualizar_custo: true });
    const liquido = custosAutomaticos(XML, itens, { finalidade: "revenda", descontarCreditos: true })[0];
    expect(liquido.custo_total).toBeLessThan(1139.52);
    expect(liquido.credito_icms).toBe(123.6);
  });

  it("sem XML completo: só o valor dos produtos, dividido pelo fator", () => {
    const r = custosAutomaticos(null, [{ numero: 1, codigo: "X", descricao: "Peça", produto_id: "p1", quantidade: 3, fator: 1, valor_unitario: 10, valor_total: 30 }],
      { finalidade: "revenda", descontarCreditos: true });
    expect(r[0]).toMatchObject({ custo_total: 30, custo_unitario: 10, credito_pis: 0 });
  });
});
