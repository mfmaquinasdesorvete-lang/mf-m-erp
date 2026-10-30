// Peças puras dos filtros das listas (todas as telas): período por atalho ou de/até, data local do Brasil e a soma do
// que ficou na lista. Os atalhos são os mesmos das notas fiscais.
import { ATALHOS, periodoDoAtalho, type Atalho } from "./filtroNotas";

export { ATALHOS, periodoDoAtalho, type Atalho };

export type Periodo = { de: string; ate: string };
export const SEM_PERIODO: Periodo = { de: "", ate: "" };
export const temPeriodo = (p: Periodo) => !!(p.de || p.ate);
/** Período com que as listas abrem: a semana atual (segunda a domingo). */
export const semanaAtual = (hoje: string): Periodo => periodoDoAtalho("semana", hoje);

const FUSO = "America/Sao_Paulo";

/** Dia da venda (Brasília): o da aprovação, não o do lançamento. Pedido lançado depois, com a data da venda acertada
 *  no Editar do pedido, conta no dia em que a venda fechou (pedido de 30/10: venda antiga entrou na semana). */
export const diaDaVenda = (p: { created_at: string; aprovado_em?: string | null }) => diaLocal(p.aprovado_em ?? p.created_at);

/** Dia (AAAA-MM-DD) no horário de Brasília: "2026-09-28" fica igual; "2026-09-29T01:30:00Z" vira "2026-09-28". */
export function diaLocal(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString("sv-SE", { timeZone: FUSO });
}

/** A data está no período? Sem período: sempre. Com período e sem data: não. */
export function noPeriodo(data: string | null | undefined, p: Periodo): boolean {
  if (!temPeriodo(p)) return true;
  const dia = diaLocal(data);
  if (!dia) return false;
  if (p.de && dia < p.de) return false;
  if (p.ate && dia > p.ate) return false;
  return true;
}

/** Como noPeriodo, mas o que ainda está pendente e é de antes do período continua aparecendo
 * (conta vencida em aberto, pedido antigo ainda não entregue): abrir na semana não esconde atraso. */
export function noPeriodoOuPendente(data: string | null | undefined, p: Periodo, pendente: boolean): boolean {
  if (noPeriodo(data, p)) return true;
  const dia = diaLocal(data);
  return pendente && !!p.de && (!dia || dia < p.de);
}

const br = (d: string) => d.split("-").reverse().join("/");

/** O mês inteiro "AAAA-MM" como período (do dia 1º ao último dia). */
export function periodoDoMes(ym: string): Periodo {
  const [y, m] = ym.split("-").map(Number);
  return { de: `${ym}-01`, ate: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** Mês "AAAA-MM" quando o período é um mês só (começa no dia 1º e termina no mesmo mês, como "Este mês"); senão "". */
export function mesDoPeriodo(p: Periodo): string {
  return p.de.endsWith("-01") && p.ate && p.ate.slice(0, 7) === p.de.slice(0, 7) ? p.de.slice(0, 7) : "";
}

/** "Este mês", "01/09/2026 a 30/09/2026", "Desde 01/09/2026", "Até 30/09/2026" ou "Qualquer data". */
export function rotuloPeriodo(p: Periodo, hoje: string): string {
  if (!temPeriodo(p)) return "Qualquer data";
  const atalho = ATALHOS.find((a) => { const x = periodoDoAtalho(a.id, hoje); return x.de === p.de && x.ate === p.ate; });
  if (atalho) return atalho.rotulo;
  if (p.de && p.ate) return p.de === p.ate ? br(p.de) : `${br(p.de)} a ${br(p.ate)}`;
  return p.de ? `Desde ${br(p.de)}` : `Até ${br(p.ate)}`;
}

/** Soma de um valor da lista, em centavos para não juntar erro de arredondamento. */
export function somar<T>(lista: readonly T[], valor: (x: T) => number | string | null | undefined): number {
  let c = 0;
  for (const x of lista) c += Math.round(Number(valor(x) ?? 0) * 100) || 0;
  return c / 100;
}
