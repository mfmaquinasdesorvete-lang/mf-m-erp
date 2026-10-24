// Preço da ordem de compra × preço comprado (o da nota), item a item e no total: usado nas OC já recebidas cuja nota
// veio com valor diferente (OC do Tiny ligada à nota em 23/10). O item casa pelo produto e, sem produto, pela descrição.
export type ItemOrdem = { produto_id: string | null; descricao: string; quantidade: number; custo_unitario: number };
export type ItemComprado = { produto_id: string | null; descricao: string | null; quantidade: number; valor_unitario: number | null; fator?: number };
export type LinhaPreco = {
  descricao: string; qtd_ordem: number | null; preco_ordem: number | null; qtd_nota: number | null; preco_nota: number | null;
  /** diferença do preço comprado sobre o da ordem, em % (1 casa) */
  dif_pct: number | null;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
export const chaveDescricao = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

export function precoOrdemComprado(ordem: ItemOrdem[], nota: ItemComprado[]): LinhaPreco[] {
  const usados = new Set<number>();
  const linhas: LinhaPreco[] = ordem.map((o) => {
    const k = nota.findIndex((i, j) => !usados.has(j) && (o.produto_id ? i.produto_id === o.produto_id : false));
    const j = k >= 0 ? k : nota.findIndex((i, j2) => !usados.has(j2) && chaveDescricao(i.descricao) !== "" && chaveDescricao(i.descricao) === chaveDescricao(o.descricao));
    if (j < 0) return { descricao: o.descricao, qtd_ordem: n(o.quantidade), preco_ordem: n(o.custo_unitario), qtd_nota: null, preco_nota: null, dif_pct: null };
    usados.add(j);
    const i = nota[j];
    const f = n(i.fator) || 1;
    const preco = i.valor_unitario == null ? null : r2(n(i.valor_unitario) / f);
    const base = n(o.custo_unitario);
    return {
      descricao: o.descricao, qtd_ordem: n(o.quantidade), preco_ordem: base, qtd_nota: n(i.quantidade) * f, preco_nota: preco,
      dif_pct: preco != null && base > 0 ? Math.round(((preco - base) / base) * 1000) / 10 : null,
    };
  });
  nota.forEach((i, j) => {
    if (usados.has(j)) return;
    const f = n(i.fator) || 1;
    linhas.push({ descricao: i.descricao ?? "", qtd_ordem: null, preco_ordem: null, qtd_nota: n(i.quantidade) * f,
      preco_nota: i.valor_unitario == null ? null : r2(n(i.valor_unitario) / f), dif_pct: null });
  });
  return linhas;
}
