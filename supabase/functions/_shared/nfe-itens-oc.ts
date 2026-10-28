// Item da nota do fornecedor sem produto vinculado: casa com o item da OC ligada à nota (pedido de 28/10, OCs #247 e
// #248 paradas em "item sem produto vinculado" com a OC dizendo qual era o produto). Só casa quando não há dúvida:
// 1º pelo código do fornecedor guardado no item da OC; 2º pela quantidade, quando só um item da nota e só um item da OC
// (do que falta receber) têm aquela quantidade. Quantidade diferente (entrega parcial, caixa × unidade) fica para a tela.

export type ItemNotaCasar = { codigo: string | null; quantidade: number };
export type ItemOcCasar = { produto_id: string; quantidade: number; quantidade_recebida: number; codigo_fornecedor: string | null };

const Q = 0.0005;
const cod = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();

/**
 * Para cada item da nota que precisa de produto (`nota[k]`; null = já tem produto ou não entra no estoque), o produto
 * da OC. `jaUsados`: produtos que outros itens da nota já pegaram (não são casados de novo).
 */
export function casarItensComOc(nota: (ItemNotaCasar | null)[], oc: ItemOcCasar[], jaUsados: Iterable<string> = []): Map<number, string> {
  const usados = new Set(jaUsados);
  const livres = oc
    .map((i) => ({ ...i, pendente: Number(i.quantidade) - Number(i.quantidade_recebida || 0) }))
    .filter((i) => i.pendente > Q && !usados.has(i.produto_id));
  const casados = new Map<number, string>();
  const pegar = (k: number, i: (typeof livres)[number]) => { casados.set(k, i.produto_id); livres.splice(livres.indexOf(i), 1); };

  nota.forEach((n, k) => {
    if (!n || !cod(n.codigo)) return;
    const i = livres.find((o) => cod(o.codigo_fornecedor) === cod(n.codigo));
    if (i) pegar(k, i);
  });

  const faltam = nota.flatMap((n, k) => (n && !casados.has(k) ? [{ k, q: Number(n.quantidade) }] : []));
  for (const { k, q } of faltam) {
    const mesmasNaNota = faltam.filter((f) => Math.abs(f.q - q) <= Q);
    const mesmasNaOc = livres.filter((o) => Math.abs(o.pendente - q) <= Q);
    if (mesmasNaNota.length === 1 && mesmasNaOc.length === 1) pegar(k, mesmasNaOc[0]);
  }
  return casados;
}
