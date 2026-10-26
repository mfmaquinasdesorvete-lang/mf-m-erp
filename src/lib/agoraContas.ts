// "O que fazer agora" nas contas a pagar e a receber (pedido de 26/10, a tela estava confusa): quatro cartões no topo
// (vencidas, hoje, esta semana e para decidir) e a lista logo abaixo, em aberto, pagas ou todas. Funções puras.

export type CartaoAgora = "vencidas" | "hoje" | "semana" | "decidir";
export type EstadoLista = "aberto" | "pagas" | "todas";

type Conta = { status: string; vencimento: string; valor: number | string };
export type RegrasAgora<C extends Conta> = {
  /** o dia que vale para pagar ou receber (a pagar: o dia programado, quando há; senão o vencimento) */
  dia?: (c: C) => string;
  /** segurada (não pagar, golpe): não entra em vencidas, hoje nem semana */
  parada?: (c: C) => boolean;
  /** espera a decisão (aprovar, escolher pagar ou não) */
  decidir: (c: C) => boolean;
};

const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function noCartao<C extends Conta>(c: C, cartao: CartaoAgora, hoje: string, r: RegrasAgora<C>): boolean {
  if (c.status !== "aberto") return false;
  if (cartao === "decidir") return r.decidir(c);
  if (r.parada?.(c)) return false;
  const d = (r.dia?.(c) ?? c.vencimento).slice(0, 10);
  if (cartao === "vencidas") return d < hoje;
  if (cartao === "hoje") return d === hoje;
  return d > hoje && d <= somar(hoje, 6);
}

export function noEstado(c: { status: string }, e: EstadoLista): boolean {
  if (e === "aberto") return c.status === "aberto";
  if (e === "pagas") return c.status === "pago";
  return c.status !== "cancelado";
}

/** Quantidade e soma de cada cartão. */
export function resumoAgora<C extends Conta>(contas: C[], hoje: string, r: RegrasAgora<C>) {
  const vazio = () => ({ n: 0, total: 0 });
  const out: Record<CartaoAgora, { n: number; total: number }> = { vencidas: vazio(), hoje: vazio(), semana: vazio(), decidir: vazio() };
  for (const c of contas) {
    for (const k of Object.keys(out) as CartaoAgora[]) {
      if (noCartao(c, k, hoje, r)) { out[k].n += 1; out[k].total += Number(c.valor) || 0; }
    }
  }
  return out;
}
