// Lista de produtos para o catálogo do WhatsApp (Gerenciador de Comércio da Meta) e, com ?formato=google, para o
// Google Merchant Center (Google Shopping).
// GET público: cole a URL desta função na fonte de dados programada de cada um.
// Só sai o que está marcado "Mostrar no catálogo" (com foto e preço). Deploy com --no-verify-jwt.
import { adminClient } from "../_shared/supabase.ts";
import { feedCsv, feedGoogleXml, type ProdutoLoja } from "../_shared/catalogo.ts";
import { enderecoSite } from "../_shared/site.ts";

Deno.serve(async (req) => {
  const db = adminClient();
  const { data, error } = await db.rpc("loja_dados");
  if (error) return new Response(`erro: ${error.message}`, { status: 500 });
  const base = Deno.env.get("SUPABASE_URL");
  const { data: cfg } = await db.from("configuracoes").select("site_url").eq("id", 1).maybeSingle();
  const site = enderecoSite(cfg?.site_url);
  const empresa = data?.empresa ?? {};
  const produtos = (data?.produtos ?? []) as ProdutoLoja[];
  const marca = empresa.nome || "MF Máquinas";
  const linkProduto = (id: string) => (site ? `${site}/loja/${id}` : `https://wa.me/55${String(empresa.whatsapp ?? "").replace(/\D/g, "")}`);
  const urlFoto = (c: string) => `${base}/storage/v1/object/public/produtos-fotos/${c}`;
  const cabecalho = { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" };

  if (new URL(req.url).searchParams.get("formato") === "google") {
    const xml = feedGoogleXml(produtos, { marca, linkLoja: site ? `${site}/loja` : linkProduto(""), linkProduto, urlFoto });
    return new Response(xml, { headers: { ...cabecalho, "Content-Type": "application/xml; charset=utf-8" } });
  }
  const csv = feedCsv(produtos, { marca, linkProduto, urlFoto });
  return new Response(csv, { headers: { ...cabecalho, "Content-Type": "text/csv; charset=utf-8" } });
});
