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

/** Erro no cadastro da variação (vazio = está certo): não pode ser variação de si mesma, o pai tem de ser um produto
 *  pai, e o produto pai não pode ser variação de outro. */
export function erroVariacao(r: Pick<ProdutoVariacao, "id" | "agrupador" | "produto_pai_id">, produtos: ProdutoVariacao[]): string {
  if (!r.produto_pai_id) return "";
  if (r.produto_pai_id === r.id) return "o produto não pode ser variação dele mesmo";
  if (r.agrupador) return "um produto pai não pode ser variação de outro";
  const pai = produtos.find((p) => p.id === r.produto_pai_id);
  if (!pai?.agrupador) return "escolha como pai um produto marcado \"Produto pai (tem variações)\"";
  return "";
}

/** Pais que podem receber variações (para o campo "Variação de"). */
export const opcoesPai = (produtos: ProdutoVariacao[]) =>
  produtos.filter((p) => p.agrupador && p.ativo !== false && !p.unificado_em).sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"))
    .map((p) => ({ value: p.id, label: p.descricao }));
