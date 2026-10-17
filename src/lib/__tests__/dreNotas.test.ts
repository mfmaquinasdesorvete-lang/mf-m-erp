import { describe, expect, it } from "vitest";
import { dre, type CategoriaFin, type LancDre } from "../dre";
import { CAT_NOTAS, comportamentoDe, contasSemNotas, contribuicao, daUnidade, notasParaDre, type NotaDre } from "../dreNotas";
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
