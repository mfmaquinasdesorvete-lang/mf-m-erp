// Regras dos técnicos que mais de uma tela usa.

/** Link do Instagram: aceita o endereço completo, "@perfil" ou só o perfil; outro site não vira link. */
export function linkInstagram(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return /^https?:\/\/(www\.)?instagram\.com\/[^/?#]+/i.test(v) ? v : null;
  const perfil = v.replace(/^@/, "").replace(/^(www\.)?instagram\.com\//i, "").split(/[/?#\s]/)[0];
  return /^[\w.]{1,30}$/.test(perfil) ? `https://instagram.com/${perfil}` : null;
}

/** Imagem do anúncio no site Dr. Frost (o banner do cartão, com a foto ou o logo no círculo do meio). */
export const ehBannerDrFrost = (url: string | null | undefined) => /^https:\/\/drfrost\.com\.br\/wp-content\/uploads\//.test(url ?? "");
