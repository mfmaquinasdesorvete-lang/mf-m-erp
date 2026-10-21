// Procura o Instagram, o Facebook e o TikTok dos clientes no site da empresa (campo Site ou domínio do e-mail).
// O que achar fica em redes_sugeridas: a equipe aprova na tela antes de ir para o cadastro (ver _shared/redes-sociais.ts).
// POST { acao: "lote" }               -> agendamento (a cada 5 minutos) ou botão "Procurar agora"
// POST { acao: "um", cliente_id }     -> botão da ficha
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { dominioDoCliente, extrairRedes, type Redes } from "../_shared/redes-sociais.ts";

const POR_LOTE = 20;
const JUNTOS = 5;

async function baixar(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      redirect: "follow", signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ERPLine/1.0)", Accept: "text/html" },
    });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return null;
    return (await r.text()).slice(0, 1_500_000);
  } catch { return null; }
}

async function procurar(db: ReturnType<typeof adminClient>, c: any) {
  const dominio = dominioDoCliente(c);
  let achou: Redes = {};
  let siteOk = false;
  if (dominio) {
    for (const url of [`https://${dominio}`, `https://www.${dominio}`, `http://${dominio}`]) {
      const html = await baixar(url);
      if (html == null) continue;
      siteOk = true;
      achou = extrairRedes(html);
      break;
    }
  }
  // só sugere o que falta no cadastro; site que abriu entra como sugestão se o campo Site estiver vazio
  const sugestao: Redes = {};
  if (achou.instagram && !c.instagram) sugestao.instagram = achou.instagram;
  if (achou.facebook && !c.facebook) sugestao.facebook = achou.facebook;
  if (achou.tiktok && !c.tiktok) sugestao.tiktok = achou.tiktok;
  if (siteOk && !c.website && dominio) sugestao.website = dominio;
  const { error } = await db.from("clientes").update({
    redes_sugeridas: Object.keys(sugestao).length ? sugestao : null, redes_buscado_em: new Date().toISOString(),
  }).eq("id", c.id);
  if (error) throw new HttpError(400, error.message);
  return { id: c.id, dominio, site_abriu: siteOk, sugestao };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await chamadaDoAgendamento(req))) await requireErpUser(req, ["vendas", "financeiro"]);
    const campos = "id, website, email, instagram, facebook, tiktok";

    if (body.acao === "um") {
      const { data: c } = await db.from("clientes").select(campos).eq("id", body.cliente_id).maybeSingle();
      if (!c) throw new HttpError(404, "cliente não encontrado");
      return json({ ok: true, resultado: await procurar(db, c) });
    }

    const { data: fila, error } = await db.rpc("clientes_para_redes", { p_limite: POR_LOTE });
    if (error) throw new HttpError(400, error.message);
    const feitos: unknown[] = [];
    const lista = (fila ?? []) as any[];
    for (let i = 0; i < lista.length; i += JUNTOS) {
      const parte = await Promise.all(lista.slice(i, i + JUNTOS).map((c) =>
        procurar(db, c).catch((e) => ({ id: c.id, erro: (e as Error).message }))));
      feitos.push(...parte);
    }
    return json({ ok: true, procurados: feitos.length, achados: feitos.filter((f: any) => f.sugestao && Object.keys(f.sugestao).length).length });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
