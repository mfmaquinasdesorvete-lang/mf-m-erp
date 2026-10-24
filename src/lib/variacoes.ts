// Produtos com variações: o pai agrupa (não vende sozinho) e cada variação é um produto de verdade.
// Funções puras: a lista, a ficha e os testes usam as mesmas regras.
export type ProdutoVariacao = { id: string; descricao: string; agrupador?: boolean | null; produto_pai_id?: string | null; variacao?: string | null; ativo?: boolean | null; unificado_em?: string | null };

/** Variações ativas de cada pai, em ordem de nome da variação. */
export function variacoesPorPai<T extends ProdutoVariacao>(produtos: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const p of produtos) {
    if (!p.produto_pai_id || p.ativo === false || p.unificado_em) continue;
    m.set(p.produto_pai_id, [...(m.get(p.produto_pai_id) ?? []), p]);
  }
  for (const l of m.values()) l.sort((a, b) => (a.variacao ?? a.descricao).localeCompare(b.variacao ?? b.descricao, "pt-BR", { numeric: true }));
  return m;
}

/** Nome completo da variação para pedido, nota e anúncio: "Kit de Borrachas O-Rings - 3 Sabores". */
export function nomeComVariacao(pai: Pick<ProdutoVariacao, "descricao"> | undefined, filho: Pick<ProdutoVariacao, "descricao" | "variacao">): string {
  const v = (filho.variacao ?? "").trim();
  if (!pai || !v) return filho.descricao;
  return filho.descricao.toLowerCase().includes(v.toLowerCase()) ? filho.descricao : `${pai.descricao} - ${v}`;
}

/** Pais que podem receber variações (para o campo "Variação de"). */
export const opcoesPai = (produtos: ProdutoVariacao[]) =>
  produtos.filter((p) => p.agrupador && p.ativo !== false && !p.unificado_em).sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"))
    .map((p) => ({ value: p.id, label: p.descricao }));
