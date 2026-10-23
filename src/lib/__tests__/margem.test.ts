import { describe, expect, it } from "vitest";
import { custoUnitario, margemBruta, margemPedido, pctMc, somar, zero, type Contexto, type PedidoMargem } from "../margem";
import type { Cliente, Config, KitComponente, Produto, Vendedor } from "../types";
import type { Unidade } from "../unidade";

const produto = (id: string, preco_custo: number, extra: Partial<Produto> = {}) =>
  ({ id, descricao: id, tipo: "peca", origem: 0, preco_custo, categoria: null, ...extra }) as Produto;
const kc = (kit_id: string, componente_id: string, quantidade: number): KitComponente =>
  ({ id: `${kit_id}>${componente_id}`, kit_id, componente_id, quantidade, opcional: false, grupo: null, padrao: true });

const PRODUTOS = [
  produto("MAQ", 8000, { tipo: "maquina", descricao: "Máquina de Sorvete Q050" }),
  produto("PECA", 30, { descricao: "Anel de vedação" }),
  produto("ROL", 25.5), produto("EIXO", 120),
  produto("MEC", 999, { kit: true, descricao: "Mecânica Q050" }),
  produto("MECD", 0, { kit: true, descricao: "Mecânica Dupla" }),
];
const COMPS = [kc("MEC", "ROL", 2), kc("MEC", "EIXO", 1), kc("MECD", "MEC", 2)];

// Matriz em SC, lucro real: ICMS 17% (CST 00), PIS 1,65% e COFINS 7,6% sobre a base sem o ICMS
const SC = {
  id: "U-SC", matriz: true, uf: "SC", icms_cst: "00", icms_aliquota_interna: 17, icms_reducao_base: 0,
  pis_cst: "01", pis_aliquota: 1.65, cofins_cst: "01", cofins_aliquota: 7.6, pis_cofins_exclui_icms: true, difal_ativo: true,
} as Unidade;
const vendedor = { id: "V1", nome: "Carla", percentual: 5, descontar_frete: true } as Vendedor;
const clienteSC = { id: "C1", tipo_pessoa: "PJ", contribuinte_icms: 1, uf: "SC" } as Cliente;

const ctx = (c: Partial<Contexto> = {}): Contexto => ({
  produtos: PRODUTOS, comps: COMPS, unidades: [SC], vendedores: [vendedor], comissoes: [], cotacoes: [], notas: [], ufs: [],
  cfg: { custos_pagamento: { cartao_pct: 3, boleto_fixo: 3.5, pix_pct: 0 } } as Config, ...c,
});

// 1 máquina R$ 15.000 + 10 anéis R$ 50 = R$ 15.500; desconto R$ 500; frete cobrado R$ 300 (CIF); cartão
const pedido = (p: Partial<PedidoMargem> = {}): PedidoMargem => ({
  id: "PED1", unidade_id: "U-SC", vendedor_id: "V1", cliente: clienteSC, forma_pagamento: "cartao", parcelas: 1,
  modalidade_frete: 0, desconto: 500, frete: 300, valor_total: 15300,
  itens: [
    { produto_id: "MAQ", descricao: "Máquina", quantidade: 1, valor_unitario: 15000 },
    { produto_id: "PECA", descricao: "Anel", quantidade: 10, valor_unitario: 50 },
  ],
  ...p,
}) as PedidoMargem;

describe("custoUnitario", () => {
  it("produto comum: preço de custo; kit: soma das peças, abrindo kit dentro de kit", () => {
    const c = { produtos: PRODUTOS, comps: COMPS };
    expect(custoUnitario(PRODUTOS[0], c)).toBe(8000);
    expect(custoUnitario(PRODUTOS[4], c)).toBeCloseTo(171, 2); // 2×25,50 + 120 (ignora o custo 999 do cadastro)
    expect(custoUnitario(PRODUTOS[5], c)).toBeCloseTo(342, 2);
    expect(custoUnitario(PRODUTOS[4], c, [{ componente_id: "EIXO", quantidade: 1 }])).toBe(120);
    expect(custoUnitario(undefined, c)).toBe(0);
  });
});

describe("margemPedido", () => {
  it("venda dentro do estado com impostos estimados, comissão, frete pago e taxa do cartão", () => {
    const r = margemPedido(pedido(), ctx({ cotacoes: [{ pedido_id: "PED1", valor: 280, escolhida: true }, { pedido_id: "PED1", valor: 250, escolhida: false }] }));
    expect(r.impostosEstimados).toBe(true);
    expect(r.total).toEqual({
      receita: 15300,
      impostos: 3775.66, // 15.300 × (17% + 83% × 9,25%)
      cmv: 8300, // 8.000 + 10 × 30
      comissao: 750, // (15.300 − 300 de frete) × 5%
      frete: 280, // cotação escolhida
      taxa: 459, // 3% de 15.300
      mc: 1735.34,
    });
    expect(pctMc(r.total)).toBeCloseTo(1735.34 / 15300, 6);
    // desconto e frete rateados pelo valor dos itens
    expect(r.itens[0].receita).toBeCloseTo(14806.45, 2);
    expect(r.itens[1].receita).toBeCloseTo(493.55, 2);
    expect(r.itens[0].descricao).toBe("Máquina de Sorvete Q050");
  });

  it("com a NF-e autorizada usa os impostos destacados; nota de homologação não vale", () => {
    const items = [{ icms_valor: 2550, pis_valor: 247.5, cofins_valor: 1140 }, { icms_valor: 85, pis_valor: 8.25, cofins_valor: 38 }];
    const autorizada = { pedido_id: "PED1", status: "autorizada", payload: { items } };
    expect(margemPedido(pedido(), ctx({ notas: [autorizada] })).total.impostos).toBe(4068.75);
    expect(margemPedido(pedido(), ctx({ notas: [autorizada] })).impostosEstimados).toBe(false);
    const teste = { ...autorizada, ambiente: "homologacao" } as Contexto["notas"][number];
    expect(margemPedido(pedido(), ctx({ notas: [teste] })).impostosEstimados).toBe(true);
  });

  it("interestadual para consumidor final: ICMS interestadual 7% (SC → BA) + DIFAL e FCP do destino", () => {
    const pf = { id: "C2", tipo_pessoa: "PF", contribuinte_icms: 9, uf: "BA" } as Cliente;
    const r = margemPedido(pedido({ cliente: pf, desconto: 0, frete: 0, valor_total: 1200, itens: [{ produto_id: "PECA", descricao: "Anel", quantidade: 24, valor_unitario: 50 }] }),
      ctx({ ufs: [{ uf: "BA", aliquota_interna: 20.5, fcp: 2 }] }));
    // ICMS 7% = 84,00; DIFAL + FCP (20,5 − 7 + 2)% = 186,00; PIS/COFINS 9,25% de (1.200 − 84) = 103,23
    expect(r.total.impostos).toBe(373.23);
    // contribuinte (PJ com IE) no outro estado não tem DIFAL
    const pj = { ...pf, tipo_pessoa: "PJ", contribuinte_icms: 1 } as Cliente;
    const r2 = margemPedido(pedido({ cliente: pj, desconto: 0, frete: 0, valor_total: 1200, itens: [{ produto_id: "PECA", descricao: "Anel", quantidade: 24, valor_unitario: 50 }] }),
      ctx({ ufs: [{ uf: "BA", aliquota_interna: 20.5, fcp: 2 }] }));
    expect(r2.total.impostos).toBe(187.23);
  });

  it("frete: envio pago pela MF usa o valor final; FOB não custa nada para a MF", () => {
    const envio = { pedido_id: "PED1", status: "entregue", pagador: "empresa", valor_aprovado: 290, valor_final: 310 };
    expect(margemPedido(pedido(), ctx({ envios: [envio] })).total.frete).toBe(310);
    expect(margemPedido(pedido(), ctx({ envios: [{ ...envio, pagador: "cliente" }] })).total.frete).toBe(0);
    expect(margemPedido(pedido({ modalidade_frete: 1 }), ctx()).total.frete).toBe(0);
    // sem cotação, o frete cobrado do cliente é a estimativa do custo
    expect(margemPedido(pedido(), ctx()).total.frete).toBe(300);
  });

  it("taxa: forma de pagamento cadastrada vence a configuração; boleto cobra tarifa por parcela", () => {
    const formas = [{ id: "F-CARTAO-6X", taxa_percentual: 4.99, tarifa_fixa: 0.5 }];
    const comForma = pedido({ forma_pagamento_id: "F-CARTAO-6X", parcelas: 6 } as Partial<PedidoMargem>);
    expect(margemPedido(comForma, ctx({ formas })).total.taxa).toBe(766.47); // 4,99% de 15.300 + 6 × 0,50
    expect(margemPedido(pedido({ forma_pagamento: "boleto", parcelas: 3 }), ctx()).total.taxa).toBe(10.5);
    expect(margemPedido(pedido({ forma_pagamento: "pix" }), ctx()).total.taxa).toBe(0);
  });

  it("comissão já lançada (não cancelada) vale mais que a prevista", () => {
    const comissoes = [{ pedido_id: "PED1", valor: 600, status: "paga" }, { pedido_id: "PED1", valor: 999, status: "cancelada" }];
    expect(margemPedido(pedido(), ctx({ comissoes })).total.comissao).toBe(600);
    expect(margemPedido(pedido({ vendedor_id: null }), ctx()).total.comissao).toBe(0);
  });

  it("pedido sem itens não quebra (sem divisão por zero)", () => {
    const r = margemPedido(pedido({ itens: [], desconto: 0, frete: 0, valor_total: 0 }), ctx());
    expect(r.itens).toEqual([]);
    expect(r.total).toEqual(zero());
  });

  it("somar e zero", () => {
    const a = { ...zero(), receita: 100, mc: 40 };
    expect(somar(a, a)).toEqual({ ...zero(), receita: 200, mc: 80 });
    expect(pctMc(zero())).toBe(0);
  });
});

describe("margemBruta", () => {
  it("(venda − custo) ÷ venda", () => { expect(margemBruta(1000, 800)).toBeCloseTo(20); });
  it("sem custo ou sem preço: null", () => { expect(margemBruta(1000, 0)).toBeNull(); expect(margemBruta(0, 10)).toBeNull(); });
});
