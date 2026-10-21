// Devolução de produtos de um pedido: quanto de cada item ainda pode voltar e qual caminho usar.
export type ItemDevolvido = { item_id: string; quantidade: number; valor_unitario?: number };
export type DevolucaoPedido = { id: string; itens: ItemDevolvido[]; valor: number; motivo: string; created_at: string };
export type NotaDoPedido = { id: string; status: string; ambiente?: string | null; numero?: string | null };

/** Vendido, já devolvido e o que ainda pode voltar, por item do pedido. */
export function saldoDevolucao(itens: { id?: string; quantidade: number }[], devolucoes: { itens: ItemDevolvido[] }[]) {
  const voltou = new Map<string, number>();
  for (const d of devolucoes) for (const i of d.itens ?? []) voltou.set(i.item_id, (voltou.get(i.item_id) ?? 0) + Number(i.quantidade || 0));
  return new Map(itens.filter((i) => i.id).map((i) => {
    const devolvido = voltou.get(i.id!) ?? 0;
    return [i.id!, { vendido: Number(i.quantidade), devolvido, disponivel: Math.max(0, Number(i.quantidade) - devolvido) }];
  }));
}

/**
 * Caminho da devolução: com NF-e autorizada é a NF de devolução (ela devolve o estoque);
 * com NF ainda na SEFAZ espera; sem NF do ERP volta ao estoque direto pelo pedido.
 */
export function caminhoDevolucao(notas: NotaDoPedido[] = []): { tipo: "nf"; nota: NotaDoPedido } | { tipo: "aguardar" } | { tipo: "sem_nf" } {
  const validas = notas.filter((n) => n.ambiente !== "homologacao");
  const nota = validas.find((n) => n.status === "autorizada");
  if (nota) return { tipo: "nf", nota };
  if (validas.some((n) => n.status === "processando" || n.status === "contingencia")) return { tipo: "aguardar" };
  return { tipo: "sem_nf" };
}

/** Lê "1,5" ou "2" como número (vazio = 0). */
export const qtdDigitada = (v: string | undefined) => Number(String(v ?? "").replace(",", ".")) || 0;
