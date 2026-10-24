// Férias (CLT): a cada 12 meses de casa a pessoa ganha 30 dias (período aquisitivo) e tem os 12 meses seguintes
// para tirar (período concessivo). Aqui não entram faltas nem férias coletivas: é o controle simples de 24/10.

export type FeriasTirada = { aquisitivo_inicio: string; inicio: string; dias: number; abono_dias?: number | null };
export type SituacaoFerias = "em_aquisicao" | "a_tirar" | "vence_logo" | "vencida" | "tirada";
export type PeriodoFerias = {
  inicio: string; fim: string; limite: string; usados: number; saldo: number; situacao: SituacaoFerias; tiradas: FeriasTirada[];
};

export const DIAS_DIREITO = 30;
/** Avisa "vence logo" quando faltam até 60 dias para o limite de tirar. */
export const AVISO_DIAS = 60;

const data = (d: string) => new Date(`${d}T12:00:00`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function somarAnos(d: string, n: number) { const t = data(d); t.setFullYear(t.getFullYear() + n); return iso(t); }
export function somarDiasData(d: string, n: number) { const t = data(d); t.setDate(t.getDate() + n); return iso(t); }

/** Períodos de férias desde a admissão até hoje (ou até a saída), do mais novo para o mais antigo. */
export function periodosFerias(admissao: string | null, hoje: string, tiradas: FeriasTirada[] = [], saida?: string | null): PeriodoFerias[] {
  if (!admissao) return [];
  const ate = saida && saida < hoje ? saida : hoje;
  const lista: PeriodoFerias[] = [];
  for (let inicio = admissao; inicio <= ate; inicio = somarAnos(inicio, 1)) {
    const fim = somarDiasData(somarAnos(inicio, 1), -1);
    const limite = somarAnos(fim, 1);
    const doPeriodo = tiradas.filter((t) => t.aquisitivo_inicio === inicio);
    const usados = doPeriodo.reduce((s, t) => s + Number(t.dias) + Number(t.abono_dias ?? 0), 0);
    const saldo = Math.max(0, DIAS_DIREITO - usados);
    const situacao: SituacaoFerias = fim >= hoje ? "em_aquisicao"
      : saldo === 0 ? "tirada"
      : limite < hoje ? "vencida"
      : limite <= somarDiasData(hoje, AVISO_DIAS) ? "vence_logo"
      : "a_tirar";
    lista.push({ inicio, fim, limite, usados, saldo, situacao, tiradas: doPeriodo });
  }
  return lista.reverse();
}

/** Períodos que contam: o em aquisição e os 2 últimos completos (pela lei não se acumulam mais que 2).
 *  Os mais antigos sem registro ficam de fora: em geral foram tirados antes do ERP. */
export function periodosRecentes(periodos: PeriodoFerias[]) {
  const emAquisicao = periodos.filter((p) => p.situacao === "em_aquisicao");
  const completos = periodos.filter((p) => p.situacao !== "em_aquisicao");
  const antigos = completos.slice(2).filter((p) => !p.tiradas.length);
  return { mostrar: [...emAquisicao, ...completos.slice(0, 2), ...completos.slice(2).filter((p) => p.tiradas.length)], antigos: antigos.length };
}

/** O período que mais pede atenção (vencida > vence logo > a tirar); null quando não há nada a tirar. */
export function feriasPendente(periodos: PeriodoFerias[]) {
  const ordem: SituacaoFerias[] = ["vencida", "vence_logo", "a_tirar"];
  for (const s of ordem) {
    const p = [...periodos].reverse().find((x) => x.situacao === s);
    if (p) return p;
  }
  return null;
}
