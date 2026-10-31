// Visões salvas das listas (barra de filtros, 31/10): cada pessoa guarda os filtros que usa sempre, por tela.
// Ficam no perfil (preferências "visoes:<página>", valem em qualquer aparelho) e numa cópia neste aparelho.
export type VisaoSalva = { id: string; nome: string; estado: Record<string, unknown> };

const chave = (pagina: string) => `mf-erp-visoes:${pagina}`;

export function lerVisoesSalvas(pagina?: string): VisaoSalva[] {
  if (!pagina) return [];
  try { const v = JSON.parse(localStorage.getItem(chave(pagina)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function guardarVisoesSalvas(pagina: string, lista: VisaoSalva[]) {
  try { localStorage.setItem(chave(pagina), JSON.stringify(lista)); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/** Ao entrar: copia para este aparelho as visões salvas no perfil. */
export function aplicarVisoesDoPerfil(p: Record<string, unknown> | null | undefined) {
  for (const [k, v] of Object.entries(p ?? {})) {
    if (k.startsWith("visoes:") && Array.isArray(v)) guardarVisoesSalvas(k.slice(7), v as VisaoSalva[]);
  }
}

/** Mesmo filtro? (a ordem das chaves não importa) */
export function mesmoEstado(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) {
  if (!a || !b) return false;
  const ordenar = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  return ordenar(a) === ordenar(b);
}
