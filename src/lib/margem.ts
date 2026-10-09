// Margem de contribuição: o que sobra de cada venda depois dos custos variáveis
// (impostos sobre a venda, custo do produto, comissão, frete pago e taxa do meio de pagamento).
import { aliquotaInterestadual } from "../../supabase/functions/_shared/nfe-impostos";
import { composicao } from "./kits";
import type { Cliente, Config, Item, KitComponente, Pedido, Produto, Vendedor } from "./types";
import type { Unidade } from "./unidade";

export const CANAIS: Record<string, string> = {
  whatsapp: "WhatsApp", telefone: "Telefone", presencial: "Presencial", representante: "Representante", loja: "Loja virtual", proposta: "Proposta",
};

export type Valores = { receita: number; impostos: number; cmv: number; comissao: number; frete: number; taxa: number; mc: number };
export const zero = (): Valores => ({ receita: 0, impostos: 0, cmv: 0, comissao: 0, frete: 0, taxa: 0, mc: 0 });
export const somar = (a: Valores, b: Valores): Valores => ({
  receita: a.receita + b.receita, impostos: a.impostos + b.impostos, cmv: a.cmv + b.cmv, comissao: a.comissao + b.comissao,
  frete: a.frete + b.frete, taxa: a.taxa + b.taxa, mc: a.mc + b.mc,
});

export type PedidoMargem = Pedido & { itens: Item[]; cliente?: Cliente; aprovado_em?: string | null };
export type Contexto = {
  produtos: Produto[]; comps: KitComponente[]; unidades: Unidade[]; vendedores: Vendedor[];
  comissoes: { pedido_id: string; valor: number; status: string }[];
  cotacoes: { pedido_id: string; valor: number; escolhida: boolean }[];
  notas: { pedido_id: string | null; status: string; payload?: { items?: Record<string, number>[] } | null }[];
  ufs: { uf: string; aliquota_interna: number; fcp: number }[];
  cfg: Config;
  /** Formas de pagamento cadastradas: a taxa e a tarifa da forma escolhida no pedido valem mais que as da configuração. */
  formas?: { id: string; taxa_percentual: number; tarifa_fixa: number }[];
  /** Envios (Fretes): o frete final (ou o aprovado) do envio pago pela MF é o custo de frete da venda. */
  envios?: { pedido_id: string | null; status: string; pagador: string; valor_aprovado: number | null; valor_final: number | null }[];
};
export type ItemMargem = Valores & { produto_id: string; descricao: string; quantidade: number };
export type ResultadoPedido = { total: Valores; itens: ItemMargem[]; impostosEstimados: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Custo atual de 1 unidade do produto (kit = soma dos componentes da composição vendida). */
export function custoUnitario(p: Produto | undefined, ctx: Contexto, escolha?: Item["kit_escolha"]): number {
  if (!p) return 0;
  if (!p.kit) return Number(p.preco_custo ?? 0);
  return composicao(p.id, ctx.comps, escolha).reduce((s, c) => s + c.quantidade * Number(ctx.produtos.find((x) => x.id === c.componente_id)?.preco_custo ?? 0), 0);
}

export function margemPedido(p: PedidoMargem, ctx: Contexto): ResultadoPedido {
  const itens = p.itens ?? [];
  const brutos = itens.map((i) => Number(i.quantidade) * Number(i.valor_unitario));
  const soma = brutos.reduce((a, b) => a + b, 0) || 1;
  const parte = (v: number, k: number) => (v * brutos[k]) / soma;
  const desconto = Number(p.desconto ?? 0), freteCobrado = Number(p.frete ?? 0);
  const total = Number(p.valor_total) || brutos.reduce((a, b) => a + b, 0) - desconto + freteCobrado;

  // impostos destacados na NF-e autorizada; sem nota, estimados com o cadastro da unidade
  const nota = ctx.notas.find((n) => n.pedido_id === p.id && n.status === "autorizada" && (n as { ambiente?: string }).ambiente !== "homologacao" && n.payload?.items?.length === itens.length);
  const u = ctx.unidades.find((x) => x.id === p.unidade_id) ?? ctx.unidades.find((x) => x.matriz);
  const c = p.cliente;
  const contribuinte = c?.tipo_pessoa === "PJ" && Number(c?.contribuinte_icms) === 1;
  const inter = !!(u?.uf && c?.uf && u.uf.toUpperCase() !== c.uf.toUpperCase());
  const ufDest = ctx.ufs.find((x) => x.uf === c?.uf?.toUpperCase());
  const tributado = ["00", "10", "20", "70", "90"].includes(u?.icms_cst ?? "00");
  function imposto(k: number, base: number): number {
    if (nota) {
      const it = nota.payload!.items![k];
      return ["icms_valor", "pis_valor", "cofins_valor", "icms_valor_uf_destino", "fcp_valor_uf_destino"].reduce((s, f) => s + Number(it[f] ?? 0), 0);
    }
    if (!u) return 0;
    const prod = ctx.produtos.find((x) => x.id === itens[k].produto_id);
    const aliq = inter ? aliquotaInterestadual(u.uf ?? "SC", c?.uf ?? u.uf ?? "SC", Number(prod?.origem ?? 0)) : Number(u.icms_aliquota_interna ?? 0);
    const icms = tributado ? base * (1 - Number(u.icms_reducao_base ?? 0) / 100) * aliq / 100 : 0;
    const difal = inter && !contribuinte && u.difal_ativo && tributado && ufDest ? base * (Math.max(0, Number(ufDest.aliquota_interna) - aliq) + Number(ufDest.fcp)) / 100 : 0;
    const basePc = base - (u.pis_cofins_exclui_icms ? icms : 0);
    const pc = (["01", "02"].includes(u.pis_cst) ? Number(u.pis_aliquota) : 0) + (["01", "02"].includes(u.cofins_cst) ? Number(u.cofins_aliquota) : 0);
    return icms + difal + basePc * pc / 100;
  }

  // comissão: a lançada (se já houver) ou a prevista pelo % do vendedor
  const lancada = ctx.comissoes.filter((x) => x.pedido_id === p.id && x.status !== "cancelada").reduce((s, x) => s + Number(x.valor), 0);
  const vend = ctx.vendedores.find((v) => v.id === p.vendedor_id);
  const pct = Number(p.comissao_percentual ?? vend?.percentual ?? 0);
  const comissaoTotal = lancada || (vend ? (total - (vend.descontar_frete ? freteCobrado : 0)) * pct / 100 : 0);

  // frete pago pela MF (frete por conta do emitente): a cotação escolhida ou o valor cobrado
  const cot = ctx.cotacoes.find((x) => x.pedido_id === p.id && x.escolhida);
  const envio = ctx.envios?.find((e) => e.pedido_id === p.id && e.status !== "cancelado");
  const freteCusto = envio
    ? (envio.pagador === "empresa" ? Number(envio.valor_final ?? envio.valor_aprovado ?? (Number(p.modalidade_frete) === 0 ? cot?.valor ?? freteCobrado : 0)) : 0)
    : Number(p.modalidade_frete) === 0 ? Number(cot?.valor ?? freteCobrado) : 0;

  // taxa do meio de pagamento
  const cp = ctx.cfg.custos_pagamento ?? {};
  const pctPag: Record<string, number | undefined> = { cartao: cp.cartao_pct, pix: cp.pix_pct, transferencia: cp.transferencia_pct, dinheiro: cp.dinheiro_pct };
  const forma = ctx.formas?.find((f) => f.id === (p as { forma_pagamento_id?: string | null }).forma_pagamento_id);
  const taxaTotal = forma && (Number(forma.taxa_percentual) || Number(forma.tarifa_fixa))
    ? total * Number(forma.taxa_percentual) / 100 + Number(forma.tarifa_fixa) * Number(p.parcelas || 1)
    : p.forma_pagamento === "boleto" ? Number(cp.boleto_fixo ?? 0) * Number(p.parcelas || 1) : total * Number(pctPag[p.forma_pagamento] ?? 0) / 100;

  const linhas: ItemMargem[] = itens.map((i, k) => {
    const receita = brutos[k] - parte(desconto, k) + parte(freteCobrado, k);
    const prod = ctx.produtos.find((x) => x.id === i.produto_id);
    const v: Valores = {
      receita, impostos: imposto(k, receita), cmv: Number(i.quantidade) * custoUnitario(prod, ctx, i.kit_escolha),
      comissao: parte(comissaoTotal, k), frete: parte(freteCusto, k), taxa: parte(taxaTotal, k), mc: 0,
    };
    v.mc = v.receita - v.impostos - v.cmv - v.comissao - v.frete - v.taxa;
    return { ...v, produto_id: i.produto_id, descricao: prod?.descricao ?? i.descricao, quantidade: Number(i.quantidade) };
  });
  const tot = linhas.reduce<Valores>((s, l) => somar(s, l), zero());
  return { total: Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, r2(v)])) as Valores, itens: linhas, impostosEstimados: !nota };
}

export const pctMc = (v: Valores) => (v.receita ? v.mc / v.receita : 0);
