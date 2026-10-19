// Ajustes da tela "Conferir a NF-e" (itens, valores, desconto, frete e texto) antes de emitir a nota do pedido.
// Sem dependências do Supabase: testado em src/lib/__tests__/nfeAjustes.test.ts.

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ajustes feitos na tela "Conferir a NF-e" antes de emitir (o pedido não muda; vale só para esta nota). */
export type AjustesNfe = {
  itens?: { id: string; descricao?: string; quantidade?: number; valor_unitario?: number }[];
  desconto?: number; frete?: number; informacoes?: string;
};

/** Aplica os ajustes nos itens do pedido; recusa item de outro pedido e números inválidos. */
export function aplicarAjustes(itens: any[], ajustes?: AjustesNfe | null) {
  if (!ajustes?.itens?.length) return itens;
  const porId = new Map(ajustes.itens.map((a) => [a.id, a]));
  for (const id of porId.keys()) if (!itens.some((i) => i.id === id)) throw new Error("item ajustado não é deste pedido");
  return itens.map((i) => {
    const a = porId.get(i.id);
    if (!a) return i;
    const quantidade = a.quantidade ?? Number(i.quantidade);
    const valor_unitario = a.valor_unitario ?? Number(i.valor_unitario);
    if (!(quantidade > 0)) throw new Error(`quantidade inválida em ${i.descricao}`);
    if (!(valor_unitario >= 0)) throw new Error(`valor inválido em ${i.descricao}`);
    const descricao = (a.descricao ?? i.descricao ?? "").trim() || i.descricao;
    return { ...i, descricao, quantidade, valor_unitario, valor_total: r2(quantidade * valor_unitario) };
  });
}
