// Identidade da empresa (Configurações → Empresa): logo dos PDFs e ícone da aba do navegador.
// Os PDFs pegam a logo daqui; sem logo enviada, usam a padrão.
let logoUrl: string | null = null;

export const logoDaEmpresa = () => logoUrl;

export function usarLogoEmpresa(logo: string | null, icone: string | null) {
  logoUrl = logo || null;
  if (typeof document === "undefined") return;
  const href = icone || null;
  for (const rel of ["icon", "apple-touch-icon"]) {
    const el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!el) continue;
    el.dataset.padrao ??= el.href;
    el.href = href ?? el.dataset.padrao;
  }
}

/** Arquivo da marca (logo/ícone) no armazenamento público: pasta empresa/ do bucket das fotos. */
export const PASTA_MARCA = "empresa";
