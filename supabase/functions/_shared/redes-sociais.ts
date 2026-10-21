// Redes sociais dos clientes: o site da empresa (campo Site ou o domínio do e-mail) costuma ter os links do
// Instagram, Facebook e TikTok no rodapé. Arquivo puro: usado pela função clientes-redes e pelas telas
// (testado em src/lib/__tests__/redesSociais.test.ts).

/** E-mails gratuitos e de marketplaces: o domínio não é o site da empresa. */
const DOMINIOS_GENERICOS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "live.com", "msn.com",
  "yahoo.com", "yahoo.com.br", "ymail.com", "icloud.com", "me.com", "mac.com", "bol.com.br", "uol.com.br", "terra.com.br",
  "ig.com.br", "globo.com", "globomail.com", "r7.com", "zipmail.com.br", "oi.com.br", "aol.com", "protonmail.com", "proton.me",
  "gmx.com", "mail.com", "yandex.com", "pop.com.br", "superig.com.br", "brturbo.com.br", "click21.com.br",
  "mercadolivre.com", "mercadolivre.com.br", "mercadolibre.com", "marketplace.amazon.com.br", "amazon.com.br", "shopee.com.br",
  "magazineluiza.com.br", "americanas.com", "tiny.com.br", "olist.com", "example.com",
]);

/** Domínio do site do cliente: o campo Site; sem ele, o domínio do e-mail (se não for gratuito). */
export function dominioDoCliente(c: { website?: string | null; email?: string | null }): string | null {
  const site = String(c.website ?? "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site) && !ehRede(site)) return site;
  const emails = String(c.email ?? "").toLowerCase().split(/[;,\s]+/);
  for (const e of emails) {
    const d = e.split("@")[1]?.replace(/^www\./, "");
    if (d && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && !DOMINIOS_GENERICOS.has(d)) return d;
  }
  return null;
}

const ehRede = (d: string) => /(^|\.)(instagram|facebook|fb|tiktok|wa|whatsapp|linktr)\.(com|me|ee)/.test(d);

export type Redes = { instagram?: string; facebook?: string; tiktok?: string; website?: string };

// caminhos que não são perfil (botão de compartilhar, plugin, página de login…)
const NAO_PERFIL = /^(p|reel|reels|tv|explore|stories|accounts|sharer|share|sharer\.php|plugins|tr|dialog|login|watch|hashtag|groups|events|policies|privacy|help|legal|about|direct|developer|intent|home\.php|profile\.php|pages|tag|video|music|discover)$/i;

/** Links das redes no HTML do site: o primeiro perfil de cada rede (o do rodapé/topo). */
export function extrairRedes(html: string): Redes {
  const r: Redes = {};
  const texto = html.replace(/\\\//g, "/");
  for (const m of texto.matchAll(/https?:\/\/(?:www\.|m\.|pt-br\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})\/?/g)) {
    if (NAO_PERFIL.test(m[1])) continue;
    r.instagram = "@" + m[1].replace(/\.$/, "").toLowerCase();
    break;
  }
  for (const m of texto.matchAll(/https?:\/\/(?:www\.|m\.|pt-br\.|web\.)?(?:facebook|fb)\.com\/([A-Za-z0-9_.-]{2,80})\/?/g)) {
    if (NAO_PERFIL.test(m[1])) continue;
    r.facebook = "facebook.com/" + m[1];
    break;
  }
  for (const m of texto.matchAll(/https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,30})/g)) {
    r.tiktok = "@" + m[1].toLowerCase();
    break;
  }
  return r;
}

/** Busca pronta na internet para quem não tem site: nome fantasia (ou razão social) + cidade. */
export function linksBusca(c: { nome?: string | null; nome_fantasia?: string | null; municipio?: string | null; uf?: string | null }) {
  const nome = String(c.nome_fantasia || c.nome || "").replace(/\b(ltda|me|epp|eireli|s\.?a\.?)\b\.?/gi, "").replace(/\s+/g, " ").trim();
  const onde = [c.municipio, c.uf].filter(Boolean).join(" ");
  const q = (s: string) => encodeURIComponent(s.trim());
  return {
    google: `https://www.google.com/search?q=${q(`${nome} ${onde} instagram`)}`,
    instagram: `https://www.instagram.com/explore/search/keyword/?q=${q(nome)}`,
    facebook: `https://www.facebook.com/search/pages/?q=${q(`${nome} ${onde}`)}`,
  };
}

/** Link clicável do que está no cadastro (@perfil, perfil ou endereço completo). */
export function linkRede(rede: "instagram" | "facebook" | "tiktok", valor?: string | null): string | null {
  const v = String(valor ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/\.(com|me)\//i.test(v)) return "https://" + v.replace(/^\/+/, "");
  const perfil = v.replace(/^@/, "");
  if (rede === "instagram") return `https://www.instagram.com/${perfil}`;
  if (rede === "tiktok") return `https://www.tiktok.com/@${perfil}`;
  return `https://www.facebook.com/${perfil}`;
}
