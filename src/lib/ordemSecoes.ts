// Ordem das seções de cada página escolhida pela pessoa (componente Secoes). Fica no perfil (preferências
// "ordem:<página>", vale em qualquer aparelho) e uma cópia neste aparelho para a página já abrir na ordem certa.
const CHAVE = (pagina: string) => `mf-erp-ordem:${pagina}`;

export function lerOrdemSecoes(pagina: string): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE(pagina)) ?? "null");
    return Array.isArray(v) && v.length ? v.map(String) : null;
  } catch { return null; }
}

export function guardarOrdemSecoes(pagina: string, ordem: string[] | null) {
  try {
    if (ordem?.length) localStorage.setItem(CHAVE(pagina), JSON.stringify(ordem));
    else localStorage.removeItem(CHAVE(pagina));
  } catch { /* sem armazenamento: vale só nesta visita */ }
}

/** Ao entrar: copia para este aparelho as ordens salvas no perfil. */
export function aplicarOrdensDoPerfil(p: Record<string, unknown> | null | undefined) {
  for (const [k, v] of Object.entries(p ?? {})) {
    if (k.startsWith("ordem:")) guardarOrdemSecoes(k.slice(6), Array.isArray(v) ? v.map(String) : null);
  }
}
