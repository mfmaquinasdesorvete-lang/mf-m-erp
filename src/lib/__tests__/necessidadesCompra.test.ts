import { describe, expect, it } from "vitest";
import {
  acaoDoProduto, calcularNecessidades, custoMedioCompras, gruposDeCompra, ordenarNecessidades, osComprometida, sugerirMinMax,
  type DadosNecessidade, type LinhaNecessidade,
} from "../necessidadesCompra";
import type { KitComponente, Produto } from "../types";

// dados inventados (nenhum produto, fornecedor ou cliente real)
const HOJE = "2026-06-30";
const SC = "un-sc", SP = "un-sp";
const prod = (id: string, extra: Partial<Produto> = {}): Produto => ({
  id, sku: id.toUpperCase(), descricao: `Peça ${id}`, tipo: "peca", unidade: "UN", ncm: null, cest: null, cfop: null, origem: 0, icms_situacao: null,
  preco_custo: 10, preco_venda: 20, estoque_atual: 0, estoque_minimo: 0, localizacao: null, ativo: true, ...extra,
});
const saida = (produto_id: string, quantidade: number, created_at: string, extra: Record<string, unknown> = {}) =>
  ({ produto_id, tipo: "saida", quantidade, created_at, referencia_tipo: "pedido", unidade_id: SC, ...extra });
const linha = (d: DadosNecessidade, id: string) => calcularNecessidades(d).find((l) => l.produto.id === id)!;
const base = (produtos: Produto[], extra: Partial<DadosNecessidade> = {}): DadosNecessidade => ({ produtos, hoje: HOJE, periodoDias: 90, unidade: null, ...extra });

describe("estoque virtual (físico + entradas previstas − saídas previstas)", () => {
  it("soma compras confirmadas e OPs abertas, desconta vendas aprovadas, peças de OP e de OS; cotação fica separada", () => {
    const produtos = [
      prod("a", { estoque_atual: 10 }),
      prod("maq", { tipo: "maquina", estoque_atual: 0 }),
      prod("kit", { kit: true }),
      prod("b", { estoque_atual: 4 }),
    ];
    const kits: KitComponente[] = [{ id: "k1", kit_id: "kit", componente_id: "a", quantidade: 2, opcional: false, grupo: null, padrao: true }];
    const d = base(produtos, {
      kits,
      fichas: [{ produto_id: "maq", componente_id: "a", quantidade: 3 }],
      compras: [
        { id: "pc1", numero: 1, status: "enviado", itens: [{ produto_id: "a", quantidade: 5, quantidade_recebida: 1 }] },
        { id: "pc2", numero: 2, status: "cotacao", itens: [{ produto_id: "a", quantidade: 7 }] },
        { id: "pc3", numero: 3, status: "recebido", itens: [{ produto_id: "a", quantidade: 50, quantidade_recebida: 50 }] },
      ],
      vendas: [{ id: "v1", numero: 100, cliente: { nome: "Cliente Teste" }, itens: [{ produto_id: "a", quantidade: 1 }, { produto_id: "kit", quantidade: 2 }] }],
      ops: [
        { id: "op1", numero: 7, status: "planejada", produto_id: "maq", quantidade: 2 },
        { id: "op2", numero: 8, status: "concluida", produto_id: "maq", quantidade: 9 },
      ],
      oss: [
        { id: "os1", numero: 50, status: "em_reparo", itens: [{ produto_id: "a", quantidade: 1 }] },
        { id: "os2", numero: 51, status: "aguardando_aprovacao", itens: [{ produto_id: "a", quantidade: 30 }] },
      ],
    });
    const a = linha(d, "a");
    expect(a.entradas).toBe(4); // 5 pedidas − 1 recebida
    expect(a.emCotacao).toBe(7);
    // venda 1 + kit 2×2 + OP 2×3 + OS 1 = 12
    expect(a.saidasPrevistas).toBe(12);
    expect(a.origensSaida.map((o) => `${o.tipo}#${o.numero}:${o.quantidade}`).sort()).toEqual(["op#7:6", "os#50:1", "pedido#100:5"]);
    expect(a.virtual).toBe(10 + 4 - 12);
    // a máquina recebe a OP aberta como entrada prevista; kit não aparece na lista
    expect(linha(d, "maq").entradas).toBe(2);
    expect(calcularNecessidades(d).some((l) => l.produto.id === "kit")).toBe(false);
    expect(linha(d, "b").virtual).toBe(4);
  });

  it("com uma unidade escolhida usa o estoque e os documentos dela e mostra o que há nas outras", () => {
    const d = base([prod("a", { estoque_atual: 12 })], {
      unidade: SP,
      estoqueUnidade: [{ produto_id: "a", unidade_id: SC, quantidade: 9 }, { produto_id: "a", unidade_id: SP, quantidade: 3 }],
      compras: [
        { id: "pc1", numero: 1, status: "enviado", unidade_id: SC, itens: [{ produto_id: "a", quantidade: 5 }] },
        { id: "pc2", numero: 2, status: "parcial", unidade_id: SP, itens: [{ produto_id: "a", quantidade: 6, quantidade_recebida: 4 }] },
      ],
      vendas: [{ id: "v1", numero: 1, unidade_id: SC, itens: [{ produto_id: "a", quantidade: 8 }] }],
    });
    const a = linha(d, "a");
    expect(a.fisico).toBe(3);
    expect(a.emOutras).toBe(9);
    expect(a.entradas).toBe(2);
    expect(a.saidasPrevistas).toBe(0);
    expect(a.virtual).toBe(5);
  });
});

describe("saídas do período e média", () => {
  it("conta só as saídas dentro do período, sem transferência nem unificação, e desconta o que voltou de venda cancelada", () => {
    const d = base([prod("a", { estoque_atual: 100 })], {
      periodoDias: 30,
      movimentos: [
        saida("a", 10, "2026-06-20T10:00:00Z"),
        saida("a", 5, "2026-06-01T10:00:00Z"),
        saida("a", 40, "2026-05-01T10:00:00Z"), // fora dos 30 dias
        saida("a", 7, "2026-06-25T10:00:00Z", { referencia_tipo: "transferencia" }),
        saida("a", 3, "2026-06-25T10:00:00Z", { referencia_tipo: "unificacao" }),
        { produto_id: "a", tipo: "entrada", quantidade: 4, created_at: "2026-06-21T10:00:00Z", referencia_tipo: "pedido" }, // cancelamento
        { produto_id: "a", tipo: "entrada", quantidade: 50, created_at: "2026-06-21T10:00:00Z", referencia_tipo: "pedido_compra" }, // compra
      ],
    });
    const a = linha(d, "a");
    expect(a.saidasPeriodo).toBe(11);
    expect(a.consumoDia).toBeCloseTo(11 / 30, 6);
    expect(a.consumoMes).toBeCloseTo(11, 6);
    expect(a.coberturaDias).toBe(Math.floor(100 / (11 / 30)));
  });
});

describe("necessidade de compra", () => {
  it("usa a regra da reposição: ponto = maior entre mínimo e consumo × prazo × 1,5; repõe até o máximo", () => {
    // 90 saídas em 90 dias = 1/dia; prazo 10 → ponto 15; máximo 40
    const movimentos = [saida("a", 90, "2026-06-15T10:00:00Z")];
    const d = base([prod("a", { estoque_atual: 12, prazo_reposicao_dias: 10, estoque_maximo: 40 })], { movimentos });
    const a = linha(d, "a");
    expect(a.ponto).toBe(15);
    expect(a.alvo).toBe(40);
    expect(a.necessidade).toBe(28);
    expect(a.valor).toBe(280);
    expect(a.motivo).toBe("ponto_reposicao");
    // cobertura 12 dias ≥ prazo 10: não é crítico
    expect(a.critico).toBe(false);
  });

  it("sem máximo: ponto + 30 dias de consumo; desconta o que já está em cotação; respeita a compra mínima", () => {
    const movimentos = [saida("a", 90, "2026-06-15T10:00:00Z")];
    const compras = [{ id: "pc", numero: 9, status: "cotacao", itens: [{ produto_id: "a", quantidade: 5 }] }];
    const d = base([prod("a", { estoque_atual: 2, prazo_reposicao_dias: 10, compra_minima: 50 })], { movimentos, compras });
    const a = linha(d, "a");
    expect(a.alvo).toBe(45);
    // alvo 45 − (virtual 2 + cotação 5) = 38, mas a compra mínima é 50
    expect(a.necessidade).toBe(50);
    expect(a.critico).toBe(true); // cobertura 2 dias < prazo 10
  });

  it("estoque negativo sem mínimo nem consumo compra o que falta para zerar; sem nada, não compra", () => {
    const d = base([prod("a", { estoque_atual: -36 }), prod("b"), prod("c", { estoque_minimo: 5 })]);
    expect(linha(d, "a").necessidade).toBe(36);
    expect(linha(d, "a").motivo).toBe("negativo");
    expect(linha(d, "a").critico).toBe(true);
    expect(linha(d, "b").necessidade).toBe(0);
    expect(linha(d, "b").semMovimento).toBe(true);
    // mínimo 5 sem consumo: repõe até mínimo + mínimo
    expect(linha(d, "c").necessidade).toBe(10);
    expect(linha(d, "c").semMovimento).toBe(false);
  });

  it("sob encomenda só compra para atender o que foi vendido; fora de linha nunca compra; máquina vai por OP", () => {
    const vendas = [{ id: "v", numero: 1, itens: [{ produto_id: "enc", quantidade: 3 }, { produto_id: "fl", quantidade: 3 }, { produto_id: "maq", quantidade: 1 }] }];
    const d = base([
      prod("enc", { sob_encomenda: true, estoque_minimo: 10, compra_minima: 2 }),
      prod("fl", { fora_de_linha: true, estoque_minimo: 10 }),
      prod("maq", { tipo: "maquina" }),
    ], { vendas });
    expect(linha(d, "enc").necessidade).toBe(3);
    expect(linha(d, "enc").motivo).toBe("zerado");
    expect(linha(d, "fl").necessidade).toBe(0);
    expect(linha(d, "fl").acao).toBe("nao_compra");
    expect(linha(d, "maq").acao).toBe("produzir");
    expect(linha(d, "maq").necessidade).toBe(1);
  });

  it("mínimo e máximo digitados na tela já entram na conta antes de gravar", () => {
    const d = base([prod("a", { estoque_atual: 3 })], { ajustes: { a: { minimo: 5, maximo: 20 } } });
    expect(linha(d, "a").necessidade).toBe(17);
  });
});

describe("custo médio", () => {
  it("média ponderada das compras recebidas nos últimos 12 meses; sem compra, o custo do cadastro", () => {
    const compras = [
      { id: "1", numero: 1, status: "recebido", enviado_em: "2026-03-01T00:00:00Z", itens: [{ produto_id: "a", quantidade: 10, quantidade_recebida: 10, custo_unitario: 10 }] },
      { id: "2", numero: 2, status: "parcial", created_at: "2026-05-01T00:00:00Z", itens: [{ produto_id: "a", quantidade: 30, quantidade_recebida: 30, custo_unitario: 14 }] },
      { id: "3", numero: 3, status: "recebido", created_at: "2024-01-01T00:00:00Z", itens: [{ produto_id: "a", quantidade: 100, quantidade_recebida: 100, custo_unitario: 1 }] },
      { id: "4", numero: 4, status: "enviado", created_at: "2026-06-01T00:00:00Z", itens: [{ produto_id: "a", quantidade: 100, custo_unitario: 99 }] },
    ];
    expect(custoMedioCompras(compras, "2025-06-30").get("a")).toBe(13);
    const d = base([prod("a"), prod("b", { preco_custo: 7.5 })], { compras });
    expect(linha(d, "a").custo).toBe(13);
    expect(linha(d, "a").origemCusto).toBe("compras");
    expect(linha(d, "b").custo).toBe(7.5);
    expect(linha(d, "b").origemCusto).toBe("cadastro");
  });
});

describe("apoios", () => {
  it("sugere mínimo = consumo × prazo × 1,5 e máximo = mínimo + 30 dias", () => {
    expect(sugerirMinMax(2, 10)).toEqual({ minimo: 30, maximo: 90 });
    expect(sugerirMinMax(0.1, 15)).toEqual({ minimo: 3, maximo: 6 });
    expect(sugerirMinMax(0, 15)).toBeNull();
  });

  it("OS com peças prometidas: aguardando peça, em reparo ou orçamento aprovado; nunca concluída ou já baixada", () => {
    expect(osComprometida({ id: "1", numero: 1, status: "em_reparo" })).toBe(true);
    expect(osComprometida({ id: "1", numero: 1, status: "aberta", orcamento_aprovado_em: "2026-06-01" })).toBe(true);
    expect(osComprometida({ id: "1", numero: 1, status: "aguardando_aprovacao" })).toBe(false);
    expect(osComprometida({ id: "1", numero: 1, status: "concluida", orcamento_aprovado_em: "2026-06-01" })).toBe(false);
    expect(osComprometida({ id: "1", numero: 1, status: "em_reparo", estoque_baixado: true })).toBe(false);
  });

  it("peça fabricada e subconjunto com estoque próprio vão por OP", () => {
    expect(acaoDoProduto(prod("x", { origem_producao: "fabricado" }))).toBe("produzir");
    expect(acaoDoProduto(prod("x", { subconjunto_estocado: true }))).toBe("produzir");
    expect(acaoDoProduto(prod("x"))).toBe("comprar");
  });

  it("ordena pela coluna (vazio no fim) e pela prioridade (crítico primeiro)", () => {
    const d = base([
      prod("a", { sku: null, estoque_atual: 50 }), prod("b", { sku: "Z1", estoque_atual: -2 }), prod("c", { sku: "A1", estoque_atual: 5, estoque_minimo: 8 }),
    ]);
    const linhas = calcularNecessidades(d);
    expect(linhas.map((l) => l.produto.id)).toEqual(["b", "c", "a"]);
    expect(ordenarNecessidades(linhas, "sku", true).map((l) => l.produto.id)).toEqual(["c", "b", "a"]);
    expect(ordenarNecessidades(linhas, "sku", false).map((l) => l.produto.id)).toEqual(["b", "c", "a"]);
    expect(ordenarNecessidades(linhas, "fisico", false).map((l) => l.produto.id)).toEqual(["a", "c", "b"]);
  });

  it("agrupa a compra por fornecedor e separa o que não vira OC", () => {
    const l = (id: string, fornecedor_id: string | null, acao: LinhaNecessidade["acao"] = "comprar", prazo = 10) =>
      ({ produto: prod(id), fornecedor_id, acao, prazo, custo: 2 } as LinhaNecessidade);
    const { grupos, fora } = gruposDeCompra([
      { linha: l("a", "f1"), quantidade: 5 }, { linha: l("b", "f1", "comprar", 20), quantidade: 1 }, { linha: l("c", null), quantidade: 2 },
      { linha: l("d", "f2"), quantidade: 0 }, { linha: l("e", "f2", "produzir"), quantidade: 3 }, { linha: l("f", "f2", "nao_compra"), quantidade: 3 },
    ]);
    expect(grupos.map((g) => [g.fornecedor_id, g.itens.length, g.valor, g.prazo])).toEqual([["f1", 2, 12, 20], [null, 1, 4, 10]]);
    expect([fora.semQuantidade.length, fora.produzir.length, fora.naoCompra.length]).toEqual([1, 1, 1]);
  });
});
