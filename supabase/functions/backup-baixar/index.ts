// Entrega à Hostinger o backup criptografado mais recente (todas as partes juntas, num arquivo só).
// GET com o header x-backup-token (o banco guarda só o SHA-256 dele, em backups_config).
// 409 quando o backup de hoje ainda não ficou pronto: a Hostinger não grava cópia repetida.
import { adminClient } from "../_shared/supabase.ts";
import { json } from "../_shared/cors.ts";

const HORAS = 36;

async function sha256(texto: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ erro: "use GET" }, 405);
  const token = req.headers.get("x-backup-token") ?? "";
  const db = adminClient();
  const { data: cfg } = await db.from("backups_config").select("token_hash").eq("id", 1).maybeSingle();
  if (!token || !cfg?.token_hash || !iguais(await sha256(token), cfg.token_hash)) return json({ erro: "não autorizado" }, 401);

  const { data: b } = await db.from("backups_registro").select("id, pasta, partes, tamanho, sha256, created_at")
    .eq("status", "ok").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!b?.pasta || !b.partes) return json({ erro: "nenhum backup ainda" }, 409);
  if (Date.now() - Date.parse(b.created_at) > HORAS * 3600 * 1000) return json({ erro: "o backup de hoje ainda não ficou pronto" }, 409);

  const base = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/backups/${b.pasta}`;
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const partes = Array.from({ length: b.partes }, (_, i) => `${base}/parte-${String(i).padStart(3, "0")}`);
  // junta as partes num fluxo só, sem carregar tudo na memória
  const corpo = new ReadableStream<Uint8Array>({
    async start(ctl) {
      try {
        for (const url of partes) {
          const r = await fetch(url, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
          if (!r.ok || !r.body) throw new Error(`parte ${url.slice(-3)}: HTTP ${r.status}`);
          const leitor = r.body.getReader();
          for (;;) {
            const { done, value } = await leitor.read();
            if (done) break;
            ctl.enqueue(value);
          }
        }
        ctl.close();
        await db.from("backups_registro").update({ hostinger_em: new Date().toISOString() }).eq("id", b.id);
      } catch (e) {
        ctl.error(e);
      }
    },
  });
  return new Response(corpo, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(b.tamanho),
      "Content-Disposition": `attachment; filename="${b.pasta}.tar.gz.gpg"`,
      "X-Backup-Sha256": b.sha256 ?? "",
    },
  });
});
