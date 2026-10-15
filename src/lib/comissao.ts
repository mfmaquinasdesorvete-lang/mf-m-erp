// Comissão item a item (espelha comissao_percentual_produto / comissao_percentual_pedido do banco).
// O mais específico vence: vendedor+categoria → linha do produto → categoria (todos) → % geral do vendedor.
// "Peças > Vedação" também usa a regra de "Peças" quando não houver uma própria.
// Linha "fixa" tem um % só; linha "desconto" usa a faixa do desconto dado no item; linha "herda" só agrupa.
// O % digitado no pedido vale acima de tudo.

export type RegraComissao = { id: string; categoria: string; vendedor_id: string | null; percentual: number; ativo: boolean };

export type FaixaDesconto = { desconto_ate: number; percentual: number };
export type LinhaProduto = {
  id: string; nome: string; comissao_tipo: "fixa" | "desconto" | "herda"; comissao_percentual: number;
  comissao_faixas: FaixaDesconto[]; ativo: boolean;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const mae = (s: string | null | undefined) => norm((s ?? "").split(" > ")[0]);

export type OrigemPct = "vendedor_categoria" | "linha" | "categoria" | "vendedor";

/** % da linha para um desconto (%), ou null quando a linha não define comissão (herda ou inativa). */
export function percentualLinha(linha: LinhaProduto | null | undefined, desconto = 0): number | null {
  if (!linha || !linha.ativo) return null;
  if (linha.comissao_tipo === "fixa") return Number(linha.comissao_percentual);
  if (linha.comissao_tipo !== "desconto") return null;
  const faixas = [...(linha.comissao_faixas ?? [])].sort((a, b) => Number(a.desconto_ate) - Number(b.desconto_ate));
  if (!faixas.length) return Number(linha.comissao_percentual);
  const f = faixas.find((x) => (Number(desconto) || 0) <= Number(x.desconto_ate) + 0.005) ?? faixas[faixas.length - 1];
  return Number(f.percentual);
}

/** % de um produto para um vendedor, e de onde veio. */
export function percentualItem(regras: RegraComissao[], vendedorId: string | null | undefined, categoria: string | null | undefined, padrao: number,
  linha?: LinhaProduto | null, desconto = 0): { pct: number; origem: OrigemPct } {
  const ativas = regras.filter((r) => r.ativo);
  const cat = norm(categoria), m = mae(categoria);
  const acha = (vend: string | null, c: string) => c ? ativas.find((r) => (r.vendedor_id ?? null) === vend && norm(r.categoria) === c) : undefined;
  const r1 = vendedorId ? acha(vendedorId, cat) ?? acha(vendedorId, m) : undefined;
  if (r1) return { pct: Number(r1.percentual), origem: "vendedor_categoria" };
  const pl = percentualLinha(linha, desconto);
  if (pl != null) return { pct: pl, origem: "linha" };
  const r2 = acha(null, cat) ?? acha(null, m);
  if (r2) return { pct: Number(r2.percentual), origem: "categoria" };
  return { pct: Number(padrao) || 0, origem: "vendedor" };
}

type ItemBase = { produto_id?: string | null; quantidade: number | string; valor_unitario: number | string };
/** Para a linha e o desconto de cada item: a linha do produto, o preço de lista e o desconto do pedido em R$. */
export type ExtrasComissao = {
  linhaDe?: (produtoId: string) => LinhaProduto | null | undefined;
  precoListaDe?: (produtoId: string) => number | null | undefined;
  descontoPedido?: number;
};

/** Desconto (%) do item: preço de lista x preço cobrado com o desconto do pedido rateado. */
export function descontoItem(valorUnitario: number, precoLista: number | null | undefined, fatorPedido: number) {
  const cobrado = Number(valorUnitario) * fatorPedido;
  if (!(Number(precoLista) > 0)) return Math.max(0, (1 - fatorPedido) * 100);
  return Math.max(0, (1 - cobrado / Number(precoLista)) * 100);
}

/** % efetivo do pedido (média pesada pelo valor dos itens) e o resumo por %. */
export function percentualPedido(
  regras: RegraComissao[], vendedor: { id: string; percentual: number } | null | undefined,
  itens: ItemBase[], categoriaDe: (produtoId: string) => string | null | undefined, manual?: number | null, extras: ExtrasComissao = {},
): { pct: number; faixas: { pct: number; valor: number; categorias: string[] }[] } | null {
  if (!vendedor) return null;
  if (manual != null && String(manual) !== "") return { pct: Number(manual), faixas: [] };
  const subtotal = itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0);
  const fator = subtotal > 0 ? Math.max(0, 1 - Number(extras.descontoPedido || 0) / subtotal) : 1;
  let soma = 0, pesado = 0;
  const faixas = new Map<number, { valor: number; categorias: Set<string> }>();
  for (const i of itens) {
    const v = Number(i.quantidade) * Number(i.valor_unitario);
    if (!(v > 0)) continue;
    const cat = i.produto_id ? categoriaDe(i.produto_id) : null;
    const linha = i.produto_id ? extras.linhaDe?.(i.produto_id) : null;
    const desc = descontoItem(Number(i.valor_unitario), i.produto_id ? extras.precoListaDe?.(i.produto_id) : null, fator);
    const { pct } = percentualItem(regras, vendedor.id, cat, vendedor.percentual, linha, desc);
    soma += v; pesado += v * pct;
    const f = faixas.get(pct) ?? { valor: 0, categorias: new Set<string>() };
    f.valor += v;
    if (linha && percentualLinha(linha, desc) === pct) f.categorias.add(linha.nome);
    else if (cat) f.categorias.add(cat.split(" > ")[0]);
    faixas.set(pct, f);
  }
  if (!soma) return { pct: Number(vendedor.percentual) || 0, faixas: [] };
  return {
    pct: pesado / soma,
    faixas: [...faixas].map(([pct, f]) => ({ pct, valor: f.valor, categorias: [...f.categorias] })).sort((a, b) => b.valor - a.valor),
  };
}

export const pctTexto = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("pt-BR")}%`;

/** Texto curto do comissionamento da linha: "2% fixo", "até 5% de desconto: 3% · …", "usa a categoria/vendedor". */
export function textoComissaoLinha(l: Pick<LinhaProduto, "comissao_tipo" | "comissao_percentual" | "comissao_faixas">) {
  if (l.comissao_tipo === "fixa") return `${pctTexto(Number(l.comissao_percentual))} fixo`;
  if (l.comissao_tipo === "desconto") {
    const f = [...(l.comissao_faixas ?? [])].sort((a, b) => Number(a.desconto_ate) - Number(b.desconto_ate));
    return f.length ? f.map((x) => `desc. até ${pctTexto(Number(x.desconto_ate))} → ${pctTexto(Number(x.percentual))}`).join(" · ") : "conforme desconto (sem faixas)";
  }
  return "sem % próprio (usa categoria ou vendedor)";
}
