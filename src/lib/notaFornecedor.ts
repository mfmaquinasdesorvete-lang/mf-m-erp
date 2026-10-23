// Nota de fornecedor completa: a conta de cada item da nota, sem tela e sem banco (testada em
// __tests__/notaFornecedor.test.ts).
//  * a leitura do XML, o rateio, o custo de entrada e os créditos do Lucro Real (estimativa: confirmar com o
//    contador) ficam em supabase/functions/_shared/nota-custo.ts, a mesma conta da entrada automática, e chegam
//    aqui pelo re-export abaixo;
//  * aqui: o preço pela regra de margem que já existe (lib/precificacao, igual ao banco), o vínculo do item ao
//    produto do ERP, a conversão de unidade (ex.: caixa com 12) e a comparação com a ordem de compra.

import { unidadeDeEmbalagem } from "./itensNotas";
import { foraDaFaixa, margemLiquida, precoSugerido, type ConfigPreco } from "./precificacao";

export {
  ALIQUOTA_COFINS, ALIQUOTA_PIS, FINALIDADES, cfopDeCompra, conferirTotal, creditosItem, custoItem, custosAutomaticos, custosDaNota,
  distribuirAcessorias, itemSemImpostos, lerXmlNota, linhaCusto, opcoesPadraoNota, quantidadeErp, ratear,
} from "../../supabase/functions/_shared/nota-custo";
export type {
  Acessorias, ContaCusto, Creditos, Finalidade, ItemCusto, ItemLigado, ItemXmlNota, OpcoesCusto, TotaisNota,
} from "../../supabase/functions/_shared/nota-custo";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Número digitado ("1.250,90", "285,72", "R$ 10"): a mesma conversão de lib/format. */
export { numeroBR } from "./format";

/** Variação do custo em % (null sem custo atual). */
export function variacaoPct(atual: number | null | undefined, novo: number | null | undefined): number | null {
  const a = num(atual), n = num(novo);
  if (!(a > 0) || !(n > 0)) return null;
  return Math.round(((n - a) / a) * 1000) / 10;
}

/* ------------------------------------------------------------------ preço ------------------------------------------------------------------ */

/** Preço pela margem (a mesma conta do banco, public.preco_sugerido). */
export const precoPelaMargem = (custo: number, margem: number, cfg: ConfigPreco) => precoSugerido(custo, margem, cfg);

/** Margem que sobra num preço digitado (já sem as despesas da venda). */
export const margemPeloPreco = (preco: number, custo: number, cfg: ConfigPreco) => margemLiquida(preco, custo, cfg);

/** Markup: quantas vezes o custo (ex.: 2,5×). */
export function markup(preco: number | null | undefined, custo: number | null | undefined): number | null {
  const p = num(preco), c = num(custo);
  return p > 0 && c > 0 ? Math.round((p / c) * 100) / 100 : null;
}

export type PrecoItem = {
  /** margem usada (a da regra, a digitada ou a que sobra no preço digitado) */
  margem: number | null; preco: number | null; fonte: "regra" | "margem" | "preco";
  markup: number | null;
  /** o preço de hoje ficou fora da faixa da regra (abaixo da tolerância ou, se ligado, acima): vale mudar */
  fora_da_faixa: boolean;
};

/**
 * Preço novo de um item: pela margem da regra (produto > categoria > tipo), pela margem digitada
 * ou pelo preço digitado (aí mostra a margem que sobra).
 */
export function precoDoItem(
  p: { custo: number; precoAtual: number; margemAlvo: number; margem?: number | null; preco?: number | null }, cfg: ConfigPreco,
): PrecoItem {
  let preco: number | null, margem: number | null, fonte: PrecoItem["fonte"];
  if (p.preco != null && p.preco > 0) {
    preco = r2(p.preco);
    margem = margemPeloPreco(preco, p.custo, cfg);
    fonte = "preco";
  } else {
    margem = p.margem ?? p.margemAlvo;
    preco = precoPelaMargem(p.custo, margem, cfg);
    fonte = p.margem != null ? "margem" : "regra";
  }
  return { margem, preco, fonte, markup: markup(preco, p.custo), fora_da_faixa: preco != null && foraDaFaixa(num(p.precoAtual), preco, cfg) };
}

/** Preço da tabela (Marketplace, Revenda…) abaixo do custo: alerta. */
export const abaixoDoCusto = (preco: number | null | undefined, custo: number | null | undefined) => num(preco) > 0 && num(custo) > 0 && num(preco) < num(custo);

/* ------------------------------------------------------------------ vínculo e unidade ------------------------------------------------------------------ */

export type OrigemVinculo = "fornecedor" | "ean" | "fabricante" | "sku" | "manual";
export const ROTULO_ORIGEM: Record<OrigemVinculo, string> = {
  fornecedor: "pelo código do fornecedor", ean: "pelo código de barras", fabricante: "pelo código do fabricante",
  sku: "pelo SKU", manual: "escolhido à mão",
};

export type VinculoFornecedor = { codigo_fornecedor: string; produto_id: string; fator_conversao: number | null };
export type ProdutoVinculo = {
  id: string; descricao: string; sku?: string | null; codigo_barras?: string | null; codigo_fabricante?: string | null;
  ativo?: boolean | null; unificado_em?: string | null;
};

export const normCodigo = (c: string | null | undefined) => String(c ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Produto do ERP para o item da nota, na ordem: código do fornecedor já ligado (com o fator), código de barras,
 * código do fabricante (4+ letras) e SKU (com letra ou 6+ dígitos, para não pegar número curto por acaso).
 */
export function sugerirVinculo(
  item: { codigo: string; ean?: string | null }, vinculos: VinculoFornecedor[], produtos: ProdutoVinculo[],
): { produto_id: string; fator: number; origem: OrigemVinculo } | null {
  const cod = normCodigo(item.codigo);
  const ativos = produtos.filter((p) => p.ativo !== false && !p.unificado_em);
  const v = cod ? vinculos.find((x) => normCodigo(x.codigo_fornecedor) === cod) : undefined;
  if (v && produtos.some((p) => p.id === v.produto_id && !p.unificado_em)) {
    return { produto_id: v.produto_id, fator: num(v.fator_conversao) > 0 ? num(v.fator_conversao) : 1, origem: "fornecedor" };
  }
  if (item.ean) {
    const p = ativos.find((x) => x.codigo_barras === item.ean);
    if (p) return { produto_id: p.id, fator: 1, origem: "ean" };
  }
  if (cod.length >= 4) {
    const p = ativos.find((x) => normCodigo(x.codigo_fabricante) === cod);
    if (p) return { produto_id: p.id, fator: 1, origem: "fabricante" };
  }
  if (cod && (/[A-Z]/.test(cod) || cod.length >= 6)) {
    const p = ativos.find((x) => normCodigo(x.sku) === cod);
    if (p) return { produto_id: p.id, fator: 1, origem: "sku" };
  }
  return null;
}

/**
 * Fator lido da descrição quando a unidade é de embalagem (caixa, pacote, rolo…):
 * "CX C/12", "CAIXA COM 50 UN", "PCT 100 PCS". Fora disso, null (a pessoa informa).
 */
export function fatorDaDescricao(descricao: string | null | undefined, unidade: string | null | undefined): number | null {
  if (!unidadeDeEmbalagem(unidade)) return null;
  const t = String(descricao ?? "").toUpperCase();
  const m = /(?:\bC\/\s*|\bCOM\s+|\bCX\s*)(\d{1,5})\b/.exec(t) ?? /\b(\d{1,5})\s*(?:UN|UND|UNID|UNIDADES|PCS|PC|PECAS|PEÇAS|PÇS)\b/.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return n >= 2 && n <= 10000 ? n : null;
}

/** Valor de uma unidade do ERP a partir do unitário da nota. */
export const valorPorUnidadeErp = (valorUnitario: number, fator: number) => r4(num(valorUnitario) / (fator > 0 ? fator : 1));

/* ------------------------------------------------------------------ ordem de compra ------------------------------------------------------------------ */

export type ItemOc = {
  id: string; pedido_compra_id: string; numero: number; produto_id: string; descricao: string;
  quantidade: number; quantidade_recebida: number; custo_unitario: number;
};
/** preco_unitario nulo = preço não mostrado (ex.: técnico, que não vê o valor das notas) */
export type ItemNotaOc = { produto_id: string; descricao: string; quantidade: number; preco_unitario: number | null };
export type SituacaoOc = "confere" | "a_mais" | "a_menos" | "fora_da_oc" | "nao_veio";
export const ROTULO_SITUACAO_OC: Record<SituacaoOc, string> = {
  confere: "confere", a_mais: "veio a mais", a_menos: "veio a menos", fora_da_oc: "fora da OC", nao_veio: "não veio",
};
export type BaixaOc = { item_id: string; pedido_compra_id: string; numero: number; quantidade: number };
export type LinhaOc = {
  produto_id: string; descricao: string;
  qtd_nota: number; qtd_pendente: number; qtd_baixa: number;
  /** nota − pendente na OC: positivo veio a mais, negativo veio a menos */
  diferenca: number;
  preco_nota: number | null; preco_oc: number | null; dif_preco_pct: number | null; alerta_preco: boolean;
  situacao: SituacaoOc; baixas: BaixaOc[];
};

const Q = 0.0005;
const pendente = (i: ItemOc) => Math.max(0, num(i.quantidade) - num(i.quantidade_recebida));

/**
 * Nota × ordens de compra ligadas, produto a produto: quantidade (a mais / a menos), preço (diferença acima da
 * tolerância, padrão 2%) e quanto baixar em cada item da OC (a mais antiga primeiro, até o que falta receber).
 */
export function compararNotaOc(nota: ItemNotaOc[], oc: ItemOc[], toleranciaPct = 2): { linhas: LinhaOc[]; baixas: BaixaOc[]; alertas: number } {
  // a nota pode ter o mesmo produto em mais de um item: soma (preço médio pela quantidade)
  const porProduto = new Map<string, { descricao: string; qtd: number; valor: number; semPreco: boolean }>();
  for (const i of nota) {
    if (!i.produto_id) continue;
    const a = porProduto.get(i.produto_id) ?? { descricao: i.descricao, qtd: 0, valor: 0, semPreco: false };
    a.qtd += num(i.quantidade);
    a.valor += num(i.quantidade) * num(i.preco_unitario);
    if (i.preco_unitario == null) a.semPreco = true;
    porProduto.set(i.produto_id, a);
  }
  const linhas: LinhaOc[] = [];
  const baixas: BaixaOc[] = [];
  for (const [produto_id, n] of porProduto) {
    const itens = oc.filter((x) => x.produto_id === produto_id).sort((a, b) => a.numero - b.numero || a.id.localeCompare(b.id));
    const qtdNota = Math.round(n.qtd * 1000) / 1000;
    const precoNota = n.qtd > 0 && !n.semPreco ? r4(n.valor / n.qtd) : null;
    if (!itens.length) {
      linhas.push({ produto_id, descricao: n.descricao, qtd_nota: qtdNota, qtd_pendente: 0, qtd_baixa: 0, diferenca: qtdNota,
        preco_nota: precoNota, preco_oc: null, dif_preco_pct: null, alerta_preco: false, situacao: "fora_da_oc", baixas: [] });
      continue;
    }
    const pend = itens.reduce((s, i) => s + pendente(i), 0);
    let resta = n.qtd;
    const minhas: BaixaOc[] = [];
    for (const i of itens) {
      const q = Math.min(resta, pendente(i));
      if (q > Q) {
        minhas.push({ item_id: i.id, pedido_compra_id: i.pedido_compra_id, numero: i.numero, quantidade: Math.round(q * 1000) / 1000 });
        resta -= q;
      }
    }
    // preço da OC: médio pelo que falta receber (ou pelo pedido, se já veio tudo)
    const pesoDe = (i: ItemOc) => (pend > Q ? pendente(i) : num(i.quantidade));
    const pesoTotal = itens.reduce((s, i) => s + pesoDe(i), 0);
    const precoOc = pesoTotal > 0 ? r4(itens.reduce((s, i) => s + pesoDe(i) * num(i.custo_unitario), 0) / pesoTotal) : null;
    const difPreco = precoNota != null && precoOc != null && precoOc > 0 ? Math.round(((precoNota - precoOc) / precoOc) * 1000) / 10 : null;
    const diferenca = Math.round((n.qtd - pend) * 1000) / 1000;
    linhas.push({
      produto_id, descricao: n.descricao, qtd_nota: qtdNota, qtd_pendente: Math.round(pend * 1000) / 1000,
      qtd_baixa: Math.round(minhas.reduce((s, b) => s + b.quantidade, 0) * 1000) / 1000, diferenca,
      preco_nota: precoNota, preco_oc: precoOc, dif_preco_pct: difPreco, alerta_preco: difPreco != null && Math.abs(difPreco) > toleranciaPct,
      situacao: diferenca > Q ? "a_mais" : diferenca < -Q ? "a_menos" : "confere", baixas: minhas,
    });
    baixas.push(...minhas);
  }
  // o que a OC pediu e a nota não trouxe
  const naoVieram = new Map<string, ItemOc[]>();
  for (const i of oc) {
    if (porProduto.has(i.produto_id) || pendente(i) <= Q) continue;
    naoVieram.set(i.produto_id, [...(naoVieram.get(i.produto_id) ?? []), i]);
  }
  for (const [produto_id, itens] of naoVieram) {
    const pend = Math.round(itens.reduce((s, i) => s + pendente(i), 0) * 1000) / 1000;
    linhas.push({ produto_id, descricao: itens[0].descricao, qtd_nota: 0, qtd_pendente: pend, qtd_baixa: 0, diferenca: -pend,
      preco_nota: null, preco_oc: r4(num(itens[0].custo_unitario)), dif_preco_pct: null, alerta_preco: false, situacao: "nao_veio", baixas: [] });
  }
  const alertas = linhas.filter((l) => l.alerta_preco || l.situacao !== "confere").length;
  return { linhas, baixas, alertas };
}

export type OcSugerida = {
  id: string; numero: number; status: string; ligada: boolean;
  itens: { produto_id: string; quantidade: number; quantidade_recebida: number }[];
};

/** Ordens de compra para a nota: as já ligadas e as abertas com produtos da nota (mais produtos em comum primeiro). */
export function ordenarOcsSugeridas<T extends OcSugerida>(ocs: T[], produtosNota: string[]): (T & { comuns: number })[] {
  const set = new Set(produtosNota.filter(Boolean));
  return ocs
    .map((o) => ({ ...o, comuns: new Set(o.itens.filter((i) => set.has(i.produto_id)).map((i) => i.produto_id)).size }))
    .filter((o) => o.ligada || (o.comuns > 0 && ["enviado", "parcial"].includes(o.status)))
    .sort((a, b) => Number(b.ligada) - Number(a.ligada) || b.comuns - a.comuns || a.numero - b.numero);
}
