// Peças puras dos filtros das listas (todas as telas): período por atalho ou de/até, data local do Brasil e a soma do
// que ficou na lista. Os atalhos são os mesmos das notas fiscais.
import { ATALHOS, periodoDoAtalho, type Atalho } from "./filtroNotas";

export { ATALHOS, periodoDoAtalho, type Atalho };

export type Periodo = { de: string; ate: string };
export const SEM_PERIODO: Periodo = { de: "", ate: "" };
export const temPeriodo = (p: Periodo) => !!(p.de || p.ate);

const FUSO = "America/Sao_Paulo";

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

const br = (d: string) => d.split("-").reverse().join("/");

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
