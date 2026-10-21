// Aviso antes de aprovar: outra venda do mesmo cliente, com o mesmo valor, feita nas últimas 24 horas e não cancelada
// (ex.: o mesmo pedido lançado duas vezes, uma em cada unidade). Só avisa; quem decide é quem aprova.
export type OutraVenda = { id: string; numero: number | null; valor_total: number | string | null; status: string; created_at: string };

export function pedidoRepetido(atual: { id?: string | null; total: number }, outras: OutraVenda[], agora = new Date()): OutraVenda | null {
  const limite = agora.getTime() - 24 * 60 * 60 * 1000;
  return outras.find((o) =>
    o.id !== atual.id && o.status !== "cancelado" && new Date(o.created_at).getTime() >= limite
    && Math.abs(Number(o.valor_total ?? 0) - atual.total) < 0.01) ?? null;
}
