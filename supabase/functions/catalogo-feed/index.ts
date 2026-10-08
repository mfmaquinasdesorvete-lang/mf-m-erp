// Lista de produtos para o catálogo do WhatsApp (Gerenciador de Comércio da Meta).
// GET público: cole a URL desta função em Fontes de dados → Feed de dados → Programado.
// Só sai o que está marcado "Mostrar no catálogo" (com foto e preço). Deploy com --no-verify-jwt.
import { adminClient } from "../_shared/supabase.ts";
import { feedCsv, type ProdutoLoja } from "../_shared/catalogo.ts";

Deno.serve(async () => {
  const db = adminClient();
  const { data, error } = await db.rpc("loja_dados");
  if (error) return new Response(`erro: ${error.message}`, { status: 500 });
  const base = Deno.env.get("SUPABASE_URL");
  const site = (Deno.env.get("ERP_SITE_URL") ?? "").replace(/\/$/, "");
  const empresa = data?.empresa ?? {};
  const csv = feedCsv((data?.produtos ?? []) as ProdutoLoja[], {
    marca: empresa.nome || "MF Máquinas",
    linkProduto: (id) => (site ? `${site}/loja/${id}` : `https://wa.me/55${String(empresa.whatsapp ?? "").replace(/\D/g, "")}`),
    urlFoto: (c) => `${base}/storage/v1/object/public/produtos-fotos/${c}`,
  });
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
});
