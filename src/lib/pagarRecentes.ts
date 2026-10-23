// Contas a pagar abrem leves: só as em aberto, as renegociadas e as que têm alguma data (vencimento, pagamento,
// emissão ou competência) dos últimos meses. O histórico inteiro (milhares de contas pagas, vários MB) só vem quando
// a tela pede: DRE, Plano de contas, destaque do Analista fiscal ou um período que começa antes do corte.

/** Primeiro dia do mês, 3 meses antes do mês de `dia` ("2026-10-23" → "2026-07-01"). */
export function inicioRecentes(dia: string) {
  const d = new Date(`${dia.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}

/** Filtro do Supabase: em aberto, renegociada ou com alguma data a partir do corte. */
export const filtroRecentesPagar = (corte: string) => (q: any) =>
  q.or(`status.eq.aberto,negociacao_id.not.is.null,vencimento.gte.${corte},data_pagamento.gte.${corte},emissao.gte.${corte},competencia.gte.${corte}`);

/** O período da lista começa antes do corte (ou não tem começo): precisa do histórico inteiro. */
export const periodoPedeHistorico = (p: { de: string; ate: string }, corte: string) => !p.de || p.de < corte;
