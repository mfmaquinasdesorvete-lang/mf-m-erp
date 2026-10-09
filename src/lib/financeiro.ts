// Visão geral do financeiro: contas de hoje/semana/mês (o que já entrou e saiu e o que falta) e o fluxo de caixa
// do período: saldo realizado dia a dia até hoje e o previsto daqui para frente (contas em aberto).

export type ContaFin = {
  id: string; descricao: string; valor: number; vencimento: string; status: string;
  data_pagamento?: string | null; valor_pago?: number | null; forma_pagamento?: string | null; categoria?: string | null;
  terceiro?: string | null; unidade_id?: string | null;
};
export type Periodo = "hoje" | "semana" | "mes";
export type Situacao = "pago" | "vencida" | "vence_hoje" | "aberta";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const somarDias = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10) + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const ultimoDiaMes = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).toISOString().slice(0, 10);
const valorEfetivo = (c: ContaFin) => Number(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor);

/** Hoje; a semana de segunda a domingo; o mês do dia 1 ao último dia. */
export function intervalo(p: Periodo, hoje: string) {
  if (p === "hoje") return { de: hoje, ate: hoje, rotulo: "de hoje" };
  if (p === "semana") {
    const dow = new Date(hoje + "T12:00:00Z").getUTCDay(); // 0 = domingo
    const de = somarDias(hoje, -((dow + 6) % 7));
    return { de, ate: somarDias(de, 6), rotulo: "da semana" };
  }
  return { de: `${hoje.slice(0, 7)}-01`, ate: ultimoDiaMes(hoje), rotulo: "do mês" };
}

export const situacao = (c: ContaFin, hoje: string): Situacao =>
  c.status === "pago" ? "pago" : c.vencimento < hoje ? "vencida" : c.vencimento === hoje ? "vence_hoje" : "aberta";

const ORDEM: Record<Situacao, number> = { vencida: 0, vence_hoje: 1, aberta: 2, pago: 3 };

/** Contas que vencem no período: total, quanto já entrou/saiu, o que falta e o que venceu antes e continua em aberto. */
export function contasDoPeriodo(lista: ContaFin[], de: string, ate: string, hoje: string) {
  const validas = lista.filter((c) => c.status !== "cancelado");
  const itens = validas.filter((c) => c.vencimento >= de && c.vencimento <= ate)
    .sort((a, b) => ORDEM[situacao(a, hoje)] - ORDEM[situacao(b, hoje)] || a.vencimento.localeCompare(b.vencimento) || b.valor - a.valor);
  const total = r2(itens.reduce((s, c) => s + valorEfetivo(c), 0));
  const realizado = r2(itens.filter((c) => c.status === "pago").reduce((s, c) => s + valorEfetivo(c), 0));
  const antes = validas.filter((c) => c.status === "aberto" && c.vencimento < de);
  return {
    itens, total, realizado, aberto: r2(total - realizado), pct: total > 0 ? Math.min(1, realizado / total) : 0,
    vencidas: itens.filter((c) => situacao(c, hoje) === "vencida").length,
    vencidasAntes: { qtd: antes.length, valor: r2(antes.reduce((s, c) => s + Number(c.valor), 0)) },
  };
}

export type Movimento = { dia: string; entradas: number; saidas: number };
export type PontoFluxo = { dia: string; realizado: number | null; previsto: number | null; entradas: number; saidas: number };

/**
 * Fluxo do período [de, ate]: até hoje, o saldo realizado de cada dia (saldo de hoje menos o que se movimentou
 * depois daquele dia); de hoje em diante, o saldo previsto com as contas em aberto que vencem até o dia.
 * Contas vencidas e ainda em aberto não entram na previsão (aparecem à parte).
 */
export function fluxoDoPeriodo(p: { saldoHoje: number; movimentos: Movimento[]; receber: ContaFin[]; pagar: ContaFin[]; hoje: string; de: string; ate: string }) {
  const { saldoHoje, hoje, de, ate } = p;
  const liquido = new Map<string, Movimento>();
  for (const m of p.movimentos) {
    const d = m.dia.slice(0, 10);
    if (d > hoje) continue;
    const x = liquido.get(d) ?? { dia: d, entradas: 0, saidas: 0 };
    x.entradas += Number(m.entradas); x.saidas += Number(m.saidas);
    liquido.set(d, x);
  }
  const abertos = (l: ContaFin[]) => l.filter((c) => c.status === "aberto");
  const rec = abertos(p.receber).filter((c) => c.vencimento >= hoje && c.vencimento <= ate);
  const pag = abertos(p.pagar).filter((c) => c.vencimento >= hoje && c.vencimento <= ate);
  const somaAte = (l: ContaFin[], d: string) => l.filter((c) => c.vencimento <= d).reduce((s, c) => s + Number(c.valor), 0);
  const noDia = (l: ContaFin[], d: string) => l.filter((c) => c.vencimento === d).reduce((s, c) => s + Number(c.valor), 0);

  const dias: PontoFluxo[] = [];
  // movimentos depois de cada dia, para voltar do saldo de hoje até o dia
  const datasMov = [...liquido.values()];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    let realizado: number | null = null, previsto: number | null = null, entradas = 0, saidas = 0;
    if (d <= hoje) {
      const depois = datasMov.filter((m) => m.dia > d).reduce((s, m) => s + m.entradas - m.saidas, 0);
      realizado = r2(saldoHoje - depois);
      entradas = r2(liquido.get(d)?.entradas ?? 0); saidas = r2(liquido.get(d)?.saidas ?? 0);
    }
    if (d >= hoje) {
      previsto = r2(saldoHoje + somaAte(rec, d) - somaAte(pag, d));
      entradas = r2(entradas + noDia(rec, d)); saidas = r2(saidas + noDia(pag, d));
    }
    dias.push({ dia: d, realizado, previsto, entradas, saidas });
  }
  const entradasPrevistas = r2(rec.reduce((s, c) => s + Number(c.valor), 0));
  const saidasPrevistas = r2(pag.reduce((s, c) => s + Number(c.valor), 0));
  const maior = [...pag].sort((a, b) => b.valor - a.valor)[0];
  const negativo = dias.find((x) => x.previsto !== null && x.previsto < 0);
  const vencidas = (l: ContaFin[]) => abertos(l).filter((c) => c.vencimento < hoje);
  const soma = (l: ContaFin[]) => r2(l.reduce((s, c) => s + Number(c.valor), 0));
  return {
    dias, saldoHoje: r2(saldoHoje), entradasPrevistas, saidasPrevistas, saldoFim: r2(saldoHoje + entradasPrevistas - saidasPrevistas),
    maiorSaida: maior ? { descricao: maior.terceiro || maior.descricao, dia: maior.vencimento, valor: Number(maior.valor) } : null,
    primeiroNegativo: negativo ? { dia: negativo.dia, saldo: negativo.previsto! } : null,
    vencidosReceber: soma(vencidas(p.receber)), vencidosPagar: soma(vencidas(p.pagar)),
  };
}
