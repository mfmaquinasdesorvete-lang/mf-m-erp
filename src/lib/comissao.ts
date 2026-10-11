// Comissão por categoria (espelha comissao_percentual_item / comissao_percentual_pedido do banco).
// Item a item, o mais específico vence: vendedor+categoria → categoria (todos) → % geral do vendedor.
// "Peças > Vedação" também usa a regra de "Peças" quando não houver uma própria.
// O % digitado no pedido vale acima de tudo.

export type RegraComissao = { id: string; categoria: string; vendedor_id: string | null; percentual: number; ativo: boolean };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const mae = (s: string | null | undefined) => norm((s ?? "").split(" > ")[0]);

export type OrigemPct = "vendedor_categoria" | "categoria" | "vendedor";

/** % de um produto (pela categoria) para um vendedor, e de onde veio. */
export function percentualItem(regras: RegraComissao[], vendedorId: string | null | undefined, categoria: string | null | undefined, padrao: number): { pct: number; origem: OrigemPct } {
  const ativas = regras.filter((r) => r.ativo);
  const cat = norm(categoria), m = mae(categoria);
  const acha = (vend: string | null, c: string) => c ? ativas.find((r) => (r.vendedor_id ?? null) === vend && norm(r.categoria) === c) : undefined;
  const r1 = vendedorId ? acha(vendedorId, cat) ?? acha(vendedorId, m) : undefined;
  if (r1) return { pct: Number(r1.percentual), origem: "vendedor_categoria" };
  const r2 = acha(null, cat) ?? acha(null, m);
  if (r2) return { pct: Number(r2.percentual), origem: "categoria" };
  return { pct: Number(padrao) || 0, origem: "vendedor" };
}

type ItemBase = { produto_id?: string | null; quantidade: number | string; valor_unitario: number | string };

/** % efetivo do pedido (média pesada pelo valor dos itens) e o resumo por %. */
export function percentualPedido(
  regras: RegraComissao[], vendedor: { id: string; percentual: number } | null | undefined,
  itens: ItemBase[], categoriaDe: (produtoId: string) => string | null | undefined, manual?: number | null,
): { pct: number; faixas: { pct: number; valor: number; categorias: string[] }[] } | null {
  if (!vendedor) return null;
  if (manual != null && String(manual) !== "") return { pct: Number(manual), faixas: [] };
  let soma = 0, pesado = 0;
  const faixas = new Map<number, { valor: number; categorias: Set<string> }>();
  for (const i of itens) {
    const v = Number(i.quantidade) * Number(i.valor_unitario);
    if (!(v > 0)) continue;
    const cat = i.produto_id ? categoriaDe(i.produto_id) : null;
    const { pct } = percentualItem(regras, vendedor.id, cat, vendedor.percentual);
    soma += v; pesado += v * pct;
    const f = faixas.get(pct) ?? { valor: 0, categorias: new Set<string>() };
    f.valor += v; if (cat) f.categorias.add(cat.split(" > ")[0]);
    faixas.set(pct, f);
  }
  if (!soma) return { pct: Number(vendedor.percentual) || 0, faixas: [] };
  return {
    pct: pesado / soma,
    faixas: [...faixas].map(([pct, f]) => ({ pct, valor: f.valor, categorias: [...f.categorias] })).sort((a, b) => b.valor - a.valor),
  };
}

export const pctTexto = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("pt-BR")}%`;
