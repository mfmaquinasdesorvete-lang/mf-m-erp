// Endereço do ERP para os links (proposta, cotação, catálogo do WhatsApp, e-mails). Vale o "Endereço do site" das
// Configurações; o secret ERP_SITE_URL só entra se for um endereço de verdade (com o nome de outro secret no lugar,
// os links saíam quebrados).
export function enderecoSite(siteUrlConfig?: string | null): string {
  for (const v of [siteUrlConfig, Deno.env.get("ERP_SITE_URL")]) {
    const s = String(v ?? "").trim().replace(/\/+$/, "");
    if (/^https?:\/\/[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return s;
  }
  return "";
}
