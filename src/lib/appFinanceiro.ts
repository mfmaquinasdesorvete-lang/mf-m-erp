// App do financeiro no celular (quem aprova e quer ver o caixa de relance): só o essencial — quanto tem nas contas,
// o que espera a aprovação dele e o que vence nos próximos dias. As regras de quem aprova continuam em lib/aprovacao.

export type ContaApp = { id: string; valor: number; vencimento: string; status: string; data_pagamento?: string | null };

const emAberto = (c: ContaApp) => c.status !== "pago" && c.status !== "cancelado" && !c.data_pagamento;

function maisDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Totais dos próximos dias (vencidas entram junto, à parte) */
export function proximosDias(contas: ContaApp[], hoje: string, dias = 7) {
  const ate = maisDias(hoje, dias);
  const abertas = contas.filter(emAberto);
  const vencidas = abertas.filter((c) => c.vencimento < hoje);
  const semana = abertas.filter((c) => c.vencimento >= hoje && c.vencimento <= ate);
  const soma = (l: ContaApp[]) => Math.round(l.reduce((s, c) => s + Number(c.valor || 0), 0) * 100) / 100;
  return { vencidas: vencidas.length, valorVencidas: soma(vencidas), semana: semana.length, valorSemana: soma(semana), hoje: abertas.filter((c) => c.vencimento === hoje).length };
}

/** Saldo por unidade e total (as contas com saldo nulo contam como zero) */
export function saldosPorUnidade(saldos: { unidade_id: string | null; saldo: number | null }[]) {
  const por = new Map<string, number>();
  let total = 0;
  for (const s of saldos) {
    const v = Number(s.saldo || 0);
    total += v;
    const k = s.unidade_id ?? "";
    por.set(k, (por.get(k) ?? 0) + v);
  }
  return { total: Math.round(total * 100) / 100, por };
}

/** Abre no app ao entrar pelo celular? Escolha guardada no aparelho; sem escolha, abre para quem cuida do financeiro */
export const CHAVE_APP = "mf-erp-abrir-app";
export function abrirNoApp(escolha: string | null, largura: number, financeiro: boolean) {
  if (largura >= 768) return false;
  if (escolha === "1") return true;
  if (escolha === "0") return false;
  return financeiro;
}
