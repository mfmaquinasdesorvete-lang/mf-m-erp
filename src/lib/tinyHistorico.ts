// Situação da importação dos pedidos do Tiny pela API (função tiny-historico), em palavras para o quadro de Importar.

export type EstadoHistorico = {
  etapa: string; atualizado_em?: string | null; concluido_em?: string | null;
  totais?: Record<string, any> | null;
};

export type SituacaoHistorico =
  | { tipo: "nunca" }
  | { tipo: "concluida" }
  | { tipo: "bloqueada"; mensagem: string; em: string | null }
  | { tipo: "parada"; desde: string | null }
  | { tipo: "andando" };

/** Horas sem andar para considerar a importação parada. */
export const HORAS_PARADA = 6;

/** Se a API já trouxe alguma coisa (conta, notas ou pedidos). */
export function trouxeAlgo(t: Record<string, any> | null | undefined): boolean {
  const p = t?.pedidos ?? {};
  return !!(t?.conta?.nome || Number(t?.notas?.lidas) || Number(p.lidos) || Number(p.novos) || Number(p.existentes) || Number(p.pulados));
}

/** Bloqueada (o Tiny recusou e o motivo ficou guardado), parada (não anda há horas sem trazer nada) ou andando. */
export function situacaoHistorico(e: EstadoHistorico | null | undefined, agora = Date.now()): SituacaoHistorico {
  if (!e) return { tipo: "nunca" };
  if (e.etapa === "concluida") return { tipo: "concluida" };
  const b = e.totais?.bloqueio;
  if (b?.mensagem) return { tipo: "bloqueada", mensagem: String(b.mensagem), em: b.em ?? null };
  const ultima = e.atualizado_em ? Date.parse(e.atualizado_em) : NaN;
  if (!trouxeAlgo(e.totais) && (!Number.isFinite(ultima) || agora - ultima > HORAS_PARADA * 3_600_000)) {
    return { tipo: "parada", desde: e.atualizado_em ?? null };
  }
  return { tipo: "andando" };
}
