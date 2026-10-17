import { describe, expect, it } from "vitest";
import { dre, type CategoriaFin, type LancDre } from "../dre";
import { CAT_NOTAS, comportamentoDe, contasSemNotas, contribuicao, daUnidade, jurosDescontosDasBaixas, mesesAnoAnterior, notasParaDre, taxasPorCanal, vendasPorMes, type NotaDre } from "../dreNotas";
import type { Produto } from "../types";

const U1 = "u-sc", U2 = "u-sp";
const produto = (id: string, sku: string, custo: number) => ({ id, sku, descricao: `Peça ${sku}`, preco_custo: custo, ativo: true, codigo_fabricante: null, codigos_alternativos: null, unificado_em: null }) as unknown as Produto;
const nota = (p: Partial<NotaDre>): NotaDre => ({
  id: p.id ?? "n1", created_at: "2026-10-10T15:00:00Z", status: "autorizada", ambiente: "producao", pedido_id: null, unidade_id: U1,
  tipo_operacao: "saida", finalidade: "normal", excluida_em: null, valor_total: 0, ...p,
});

describe("DRE pelas notas", () => {
  const notas: NotaDre[] = [
    nota({ id: "v1", payload: { items: [
      { cfop: "6101", codigo_produto: "A1", quantidade_comercial: 2, valor_bruto: 1000, valor_desconto: 100, ipi_valor: 50, icms_valor: 108, pis_valor: 14.85, cofins_valor: 68.4, icms_valor_uf_destino: 20, fcp_valor_uf_destino: 5 },
      { cfop: "6949", codigo_produto: "A1", quantidade_comercial: 1, valor_bruto: 300 }, // remessa: fora
    ] } }),
    nota({ id: "t1", transferencia_id: "tr", payload: { items: [{ cfop: "6152", valor_bruto: 5000 }] } }), // transferência SC→SP: fora
    nota({ id: "h1", ambiente: "homologacao", payload: { items: [{ cfop: "5102", valor_bruto: 999 }] } }),
    nota({ id: "s2", unidade_id: U2, created_at: "2026-10-01T02:00:00Z", payload: { items: [{ cfop: "5102", codigo_produto: "ZZ", quantidade_comercial: 1, valor_bruto: 200 }] } }),
    nota({ id: "d1", finalidade: "devolucao", tipo_operacao: "entrada", valor_total: 300 }),
    nota({ id: "dc", finalidade: "devolucao", tipo_operacao: "saida", valor_total: 77 }), // devolução de compra: não é dedução de venda
  ];
  const r = notasParaDre(notas, [{ id: "r1", data_emissao: "2026-10-12", valor_total: 120, unidade_id: U2, finalidade: "devolucao" }], [produto("p1", "A1", 300)]);
  const soma = (cat: string, u?: string) => r.lancamentos.filter((l) => l.categoria === cat && (!u || l.unidade_id === u)).reduce((s, l) => s + l.valor, 0);

  it("receita = produtos − desconto + IPI, só itens de venda, sem transferência nem homologação", () => {
    expect(soma(CAT_NOTAS.receita, U1)).toBe(950);
    expect(soma(CAT_NOTAS.receita, U2)).toBe(200);
    expect(r.notasVenda).toBe(2);
  });

  it("impostos destacados, devoluções e CMV pelo custo do cadastro", () => {
    expect(soma(CAT_NOTAS.icms)).toBe(108);
    expect(soma(CAT_NOTAS.ipi)).toBe(50);
    expect(soma(CAT_NOTAS.difal)).toBe(25);
    expect(soma(CAT_NOTAS.devolucoes)).toBe(420);
    expect(soma(CAT_NOTAS.cmv)).toBe(600);
    expect(r.semCusto).toBe(1);
    // emitida às 23h de 30/09 em Brasília conta em setembro
    expect(r.lancamentos.find((l) => l.unidade_id === U2 && l.categoria === CAT_NOTAS.receita)?.competencia).toBe("2026-09-30");
  });

  it("contas que as notas já contam saem (vendas, impostos sobre a venda, compra de mercadoria)", () => {
    const cats: CategoriaFin[] = [
      { nome: "vendas", tipo: "receita", grupo: "receita" }, { nome: "impostos", tipo: "despesa", grupo: "deducao" },
      { nome: "fornecedores", tipo: "despesa", grupo: "custo" }, { nome: "frete", tipo: "despesa", grupo: "custo" },
      { nome: "aluguel", tipo: "despesa", grupo: "despesa_operacional" },
    ];
    const l = (tipo: LancDre["tipo"], categoria: string): LancDre => ({ tipo, categoria, valor: 10, status: "aberto", vencimento: "2026-10-05" });
    const servico: LancDre = { ...l("receber", "assistência técnica"), grupo: "receita" };
    const pixSolto: LancDre = { ...l("receber", "Pix recebido"), grupo: "receita", origem: "extrato" };
    expect(contasSemNotas([l("receber", "vendas"), l("pagar", "impostos"), l("pagar", "fornecedores"), l("pagar", "frete"), l("pagar", "aluguel"), servico, pixSolto], cats)
      .map((x) => x.categoria)).toEqual(["frete", "aluguel", "assistência técnica"]);
  });

  it("unidade: só os lançamentos dela", () => {
    expect(daUnidade(r.lancamentos, U2).every((l) => l.unidade_id === U2)).toBe(true);
    expect(daUnidade(r.lancamentos, null)).toHaveLength(r.lancamentos.length);
  });
});

describe("Fixa × variável e ponto de equilíbrio", () => {
  it("sugestão pelo grupo e pelo nome; o gravado vale mais", () => {
    expect(comportamentoDe("deducao", "impostos").valor).toBe("variavel");
    expect(comportamentoDe("despesa_operacional", "comissoes").valor).toBe("variavel");
    expect(comportamentoDe("despesa_operacional", "aluguel")).toEqual({ valor: "fixa", sugerido: true });
    expect(comportamentoDe("despesa_operacional", "marketing", "variavel")).toEqual({ valor: "variavel", sugerido: false });
  });

  it("margem de contribuição, fixas, ponto de equilíbrio e margem de segurança", () => {
    const cats = [
      { nome: "vendas", tipo: "receita", grupo: "receita" }, { nome: "impostos", tipo: "despesa", grupo: "deducao" },
      { nome: "comissoes", tipo: "despesa", grupo: "despesa_operacional" }, { nome: "aluguel", tipo: "despesa", grupo: "despesa_operacional" },
      { nome: "folha", tipo: "despesa", grupo: "despesa_operacional", comportamento: "fixa" },
    ] as const;
    const l = (tipo: LancDre["tipo"], categoria: string, valor: number): LancDre => ({ tipo, categoria, valor, status: "aberto", vencimento: "2026-10-05" });
    const d = dre([l("receber", "vendas", 10000), l("pagar", "impostos", 1500), l("pagar", "comissoes", 500), l("pagar", "aluguel", 2000), l("pagar", "folha", 2000)],
      [...cats], ["2026-10"], "competencia");
    const c = contribuicao(d.linhas, [...cats], 1);
    expect(c.variaveis[0]).toBe(2000);
    expect(c.mc[0]).toBe(8000);
    expect(c.mcPct[0]).toBeCloseTo(0.8);
    expect(c.fixas[0]).toBe(4000);
    expect(c.pe[0]).toBe(5000);
    expect(c.seguranca[0]).toBeCloseTo(0.5);
    expect(c.categorias.find((x) => x.categoria === "folha")).toMatchObject({ comportamento: "fixa", sugerido: false });
  });
});

describe("DRE 2: devoluções, custo do dia, ISS, juros, canais e tributos", () => {
  it("devolução emitida estorna impostos e CMV; CMV pelo custo da data da venda; ISS só do não retido", () => {
    const notas: NotaDre[] = [
      nota({ id: "v", created_at: "2026-09-10T15:00:00Z", payload: { items: [{ cfop: "5101", codigo_produto: "A1", quantidade_comercial: 1, valor_bruto: 1000 }] } }),
      nota({ id: "w", created_at: "2026-10-20T15:00:00Z", payload: { items: [{ cfop: "5101", codigo_produto: "A1", quantidade_comercial: 1, valor_bruto: 1000 }] } }),
      nota({ id: "d", created_at: "2026-10-25T15:00:00Z", finalidade: "devolucao", tipo_operacao: "entrada", valor_total: 1000,
        payload: { items: [{ codigo_produto: "A1", quantidade_comercial: 1, icms_valor: 120, pis_valor: 16.5, cofins_valor: 76 }] } }),
    ];
    // custo era 300 até 01/10 e passou a 400
    const r = notasParaDre(notas, [], [produto("p1", "A1", 400)], {
      custosAnteriores: [{ produto_id: "p1", alterado_em: "2026-10-01T12:00:00Z", custo_antes: 300 }],
      nfse: [{ data: "2026-10-05", valor_iss: 50, iss_retido: false, valida: true }, { data: "2026-10-06", valor_iss: 30, iss_retido: true, valida: true }],
    });
    const de = (cat: string, mes: string) => r.lancamentos.filter((l) => l.categoria === cat && l.competencia!.startsWith(mes));
    expect(de(CAT_NOTAS.cmv, "2026-09")[0].valor).toBe(300);
    expect(de(CAT_NOTAS.cmv, "2026-10")[0].valor).toBe(400);
    expect(de(CAT_NOTAS.estornoImpostos, "2026-10")[0]).toMatchObject({ tipo: "receber", grupo: "deducao", valor: 212.5 });
    expect(de(CAT_NOTAS.estornoCmv, "2026-10")[0]).toMatchObject({ tipo: "receber", grupo: "custo", valor: 400 });
    expect(de(CAT_NOTAS.iss, "2026-10").map((l) => l.valor)).toEqual([50]);
    expect(r.vendas.map((v) => v.valor)).toEqual([1000, 1000]);
    expect(r.devolucoes).toBe(1);
    expect(vendasPorMes(r.vendas, ["2026-09", "2026-10"], null)).toEqual({ nNotas: [1, 1], ticket: [1000, 1000] });
  });

  it("juros e descontos pela baixa; conta com restante não conta", () => {
    const base = { status: "pago", vencimento: "2026-10-01", data_pagamento: "2026-10-03" } as const;
    const j = jurosDescontosDasBaixas([
      { ...base, id: "a", tipo: "pagar", valor: 100, valor_pago: 105 },
      { ...base, id: "b", tipo: "pagar", valor: 100, valor_pago: 95 },
      { ...base, id: "c", tipo: "receber", valor: 200, valor_pago: 190 },
      { ...base, id: "p", tipo: "pagar", valor: 50, valor_pago: 40 },
      { status: "aberto", vencimento: "2026-10-20", id: "r", conta_origem_id: "p", tipo: "pagar", valor: 10 },
    ]);
    expect(j.map((x) => [x.categoria, x.grupo, x.valor])).toEqual([
      ["juros e multas pagos (nas baixas)", "despesa_financeira", 5],
      ["descontos obtidos (nas baixas)", "receita_financeira", 5],
      ["descontos concedidos (nas baixas)", "despesa_financeira", 10],
    ]);
  });

  it("taxas por canal e meses do ano anterior", () => {
    const t = taxasPorCanal([
      { tipo: "pagar", categoria: "Tarifas (cartão, OLIST, banco) e juros", canal: "InfinitePay SP", valor: 30, status: "pago", vencimento: "2026-10-02" },
      { tipo: "pagar", categoria: "tarifas bancárias", descricao: "Tarifa Mercado Pago", valor: 12.5, status: "aberto", vencimento: "2026-10-09" },
      { tipo: "pagar", categoria: "Compras em marketplaces", descricao: "Mercado Livre", valor: 900, status: "pago", vencimento: "2026-10-09" },
    ], ["2026-10"]);
    expect(t.map((x) => [x.canal, x.total])).toEqual([["InfinitePay", 30], ["Mercado Livre / Mercado Pago", 12.5]]);
    expect(mesesAnoAnterior(["2026-01", "2026-10"])).toEqual(["2025-01", "2025-10"]);
  });

  it("tributos sobre o lucro em linha própria e margem bruta", () => {
    const cats: CategoriaFin[] = [{ nome: "vendas", tipo: "receita", grupo: "receita" }, { nome: "IRPJ", tipo: "despesa", grupo: "tributos" },
      { nome: "fornecedores", tipo: "despesa", grupo: "custo" }];
    const l = (tipo: LancDre["tipo"], categoria: string, valor: number): LancDre => ({ tipo, categoria, valor, status: "aberto", vencimento: "2026-10-05" });
    const d = dre([l("receber", "vendas", 1000), l("pagar", "fornecedores", 400), l("pagar", "IRPJ", 90)], cats, ["2026-10"], "competencia");
    expect(d.linhas.find((x) => x.chave === "antes")?.valores[0]).toBe(600);
    expect(d.linhas.find((x) => x.chave === "tributos")?.valores[0]).toBe(-90);
    expect(d.linhas.find((x) => x.chave === "liquido")?.valores[0]).toBe(510);
    expect(d.margemBruta[0]).toBeCloseTo(0.6);
  });
});
