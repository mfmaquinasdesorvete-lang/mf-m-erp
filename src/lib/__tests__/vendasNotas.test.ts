import { describe, expect, it } from "vitest";
import { CFOP_VENDA, devolvidoPorNota, notaEhVendaSemPedido, rotuloVenda, vendasDasNotas, type NotaVenda } from "../vendasNotas";
import type { Produto } from "../types";

const prod = (x: Partial<Produto>) => ({ id: "p", sku: null, descricao: "", tipo: "peca", preco_custo: 0, ativo: true, ...x }) as Produto;
const nota = (x: Partial<NotaVenda>): NotaVenda => ({
  id: "n1", numero: "294", created_at: "2026-02-25T17:15:56+00:00", status: "autorizada", ambiente: "producao", pedido_id: null,
  unidade_id: "u1", cliente_id: "c1", tipo_operacao: "saida", finalidade: "normal", excluida_em: null, destinatario_nome: "Sorveteria Exemplo",
  payload: { items: [] }, ...x,
});

describe("vendas que só existem na nota fiscal", () => {
  it("CFOP de venda: produção, mercadoria e ST; transferência, remessa e devolução não", () => {
    for (const c of ["5101", "6101", "5102", "6108", "5405", "6403", "5124"]) expect(CFOP_VENDA.test(c)).toBe(true);
    for (const c of ["5151", "6152", "5915", "6949", "5202", "5910", "5901", "5949"]) expect(CFOP_VENDA.test(c)).toBe(false);
  });

  it("só entra nota autorizada de produção, sem pedido, saída normal e com item de venda", () => {
    const venda = { items: [{ cfop: "5101", valor_bruto: 100 }] };
    expect(notaEhVendaSemPedido(nota({ payload: venda }))).toBe(true);
    expect(notaEhVendaSemPedido(nota({ payload: venda, pedido_id: "ped" }))).toBe(false);
    expect(notaEhVendaSemPedido(nota({ payload: venda, ambiente: "homologacao" }))).toBe(false);
    expect(notaEhVendaSemPedido(nota({ payload: venda, status: "cancelada" }))).toBe(false);
    expect(notaEhVendaSemPedido(nota({ payload: venda, finalidade: "devolucao" }))).toBe(false);
    expect(notaEhVendaSemPedido(nota({ payload: { items: [{ cfop: "5915", valor_bruto: 100 }] } }))).toBe(false);
  });

  it("monta a venda com os itens de venda, o produto do cadastro e os impostos da nota", () => {
    const produtos = [prod({ id: "maq", sku: "MQ-1", descricao: "Máquina Exemplo", preco_custo: 9000, tipo: "maquina" }),
      prod({ id: "pa", descricao: "Pá Batedora Exemplo", preco_custo: 30 })];
    const { pedidos, notas, semProduto } = vendasDasNotas([nota({ payload: { items: [
      { codigo_produto: "mq-1", descricao: "MAQUINA", cfop: "6101", quantidade_comercial: 1, valor_bruto: 20000, icms_valor: 1400, pis_valor: 330, cofins_valor: 1520 },
      { codigo_produto: "x", descricao: "pá  batedora exemplo", cfop: "6101", quantidade_comercial: 2, valor_bruto: 300, icms_valor: 21 },
      { descricao: "Peça sem cadastro", cfop: "5102", quantidade_comercial: 1, valor_bruto: 50 },
      { descricao: "Remessa de garantia", cfop: "6949", quantidade_comercial: 1, valor_bruto: 999 },
    ] } })], produtos);
    expect(pedidos).toHaveLength(1);
    const p = pedidos[0];
    expect(p).toMatchObject({ id: "nf:n1", status: "faturado", origem: "nfe", valor_total: 20350, cliente: { nome: "Sorveteria Exemplo" } });
    expect(p.itens.map((i) => [i.produto_id, i.quantidade, i.valor_unitario])).toEqual([["maq", 1, 20000], ["pa", 2, 150], ["nf-item:peca sem cadastro", 1, 50]]);
    expect(p.itens[0].produto).toEqual({ preco_custo: 9000, tipo: "maquina" });
    expect(semProduto).toBe(1);
    expect(notas[0]).toMatchObject({ pedido_id: "nf:n1", status: "autorizada" });
    expect(notas[0].payload.items[0]).toEqual({ icms_valor: 1400, pis_valor: 330, cofins_valor: 1520 });
    expect(rotuloVenda(p)).toBe("NF 294");
    expect(rotuloVenda({ numero: 12 })).toBe("#12");
  });

  it("venda devolvida sai dos relatórios; devolução parcial reduz na proporção", () => {
    const venda = nota({ id: "v14", numero: "14", chave: "CHAVE14", valor_total: 50000, payload: { items: [
      { descricao: "Torno exemplo", cfop: "6102", quantidade_comercial: 2, valor_bruto: 50000, icms_valor: 3500 },
    ] } });
    // entrada de devolução importada do Tiny: aponta pela chave da nota de venda
    const devolucao = nota({ id: "d15", numero: "15", finalidade: "devolucao", tipo_operacao: "entrada", valor_total: 50000, chave_referenciada: "CHAVE14", payload: { items: [] } });
    expect(devolvidoPorNota([venda, devolucao]).get("v14")).toBe(50000);
    const total = vendasDasNotas([venda, devolucao], []);
    expect(total.pedidos).toHaveLength(0);
    expect(total.devolvidas).toBe(1);

    // metade devolvida (pelo id), e uma devolução cancelada não conta
    const metade = nota({ id: "d16", finalidade: "devolucao", tipo_operacao: "entrada", valor_total: 25000, nota_referenciada_id: "v14" });
    const cancelada = nota({ id: "d17", finalidade: "devolucao", tipo_operacao: "entrada", status: "cancelada", valor_total: 25000, nota_referenciada_id: "v14" });
    const parcial = vendasDasNotas([venda, metade, cancelada], []);
    expect(parcial.pedidos[0].valor_total).toBe(25000);
    expect(parcial.pedidos[0].itens.map((i) => [i.quantidade, i.valor_unitario])).toEqual([[1, 25000]]);
    expect(parcial.notas[0].payload.items[0].icms_valor).toBe(1750);
  });
});
