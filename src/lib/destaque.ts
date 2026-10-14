// "Destaque": outra tela (ex.: Analista fiscal) abre uma lista mostrando só os registros apontados.
// Vai no state da navegação: navigate("/notas", { state: { destaque: { ids, titulo } } }).

export type Destaque = { ids: string[]; titulo: string; origem: string };

/** Lê o destaque do state da navegação (ou null). */
export function lerDestaque(state: unknown): Destaque | null {
  const d = (state as { destaque?: { ids?: unknown; titulo?: unknown; origem?: unknown } } | null)?.destaque;
  if (!d || !Array.isArray(d.ids) || !d.ids.length) return null;
  return { ids: d.ids.map(String), titulo: String(d.titulo ?? ""), origem: d.origem ? String(d.origem) : "Analista fiscal" };
}

/** Monta o state de navegação com o destaque (e o que mais a tela de destino entender, ex.: aba). */
export const comDestaque = (ids: string[], titulo: string, extra: Record<string, unknown> = {}) =>
  ({ ...extra, destaque: { ids, titulo, origem: "Analista fiscal" } });
