// Copia para o ERP as fotos de produtos que ainda são links externos
// (ex.: importadas do Tiny). Assim o catálogo não depende do sistema antigo.
// POST {} -> copia até 25 fotos por chamada; responde { copiadas, falharam, restantes }
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const LIMITE = 5 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req, ["financeiro"]);
    const db = adminClient();
    const { data: lista } = await db.from("produtos").select("id, foto_caminho").like("foto_caminho", "http%").limit(25);
    let copiadas = 0, falharam = 0;
    for (const p of lista ?? []) {
      try {
        const url = new URL(p.foto_caminho);
        if (url.protocol !== "https:") throw new Error("só https");
        const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
        const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim();
        if (!r.ok || !TIPOS[tipo]) throw new Error(`resposta ${r.status} ${tipo}`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (bytes.byteLength > LIMITE) throw new Error("foto maior que 5 MB");
        const caminho = `${crypto.randomUUID()}.${TIPOS[tipo]}`;
        const { error } = await db.storage.from("produtos-fotos").upload(caminho, bytes, { contentType: tipo });
        if (error) throw error;
        await db.from("produtos").update({ foto_caminho: caminho }).eq("id", p.id).eq("foto_caminho", p.foto_caminho);
        copiadas++;
      } catch (e) {
        console.warn("foto", p.id, (e as Error).message);
        falharam++;
      }
    }
    const { count } = await db.from("produtos").select("id", { count: "exact", head: true }).like("foto_caminho", "http%");
    return json({ copiadas, falharam, restantes: Math.max(0, (count ?? 0) - falharam) });
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500);
  }
});
