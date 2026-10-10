// NFS-e (nota de serviço) da ordem de serviço, pela Focus NFe. O token da Focus fica só aqui no servidor.
// POST { acao: "previa", os_id }                                  -> conferência: tomador, valores, ISS, pendências e avisos
// POST { acao: "emitir", os_id, discriminacao?, substitui_id? }  -> grava a referência e envia (resultado assíncrono)
// POST { acao: "consultar", id }                                 -> consulta agora pela mesma referência
// POST { acao: "cancelar", id, motivo }                          -> cancelamento com motivo (só financeiro), auditado
// A lógica fica em _shared/nfse.ts (também usada pelo agendamento nfse-processar e pelo aviso focus-webhook).
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { cancelarNfse, consultarNfse, emitirNfse, montarNfse, type Nfse } from "../_shared/nfse.ts";

const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const corpo = await req.json().catch(() => ({}));
    const db = adminClient();
    const carregar = async () => {
      if (!uuid(corpo.id)) throw new HttpError(400, "informe a NFS-e");
      const { data } = await db.from("nfse").select("*").eq("id", corpo.id).maybeSingle();
      if (!data) throw new HttpError(404, "NFS-e não encontrada");
      return data as Nfse;
    };

    switch (corpo.acao) {
      case "previa": {
        await requireErpUser(req, ["vendas", "financeiro", "tecnico"]);
        if (!uuid(corpo.os_id)) throw new HttpError(400, "informe a OS");
        return json((await montarNfse(db, corpo.os_id)).previa);
      }
      case "emitir": {
        const { userId } = await requireErpUser(req, ["vendas", "financeiro"]);
        if (!uuid(corpo.os_id)) throw new HttpError(400, "informe a OS");
        if (corpo.substitui_id != null && !uuid(corpo.substitui_id)) throw new HttpError(400, "nota corrigida inválida");
        const r = await emitirNfse(db, corpo.os_id, {
          discriminacao: typeof corpo.discriminacao === "string" ? corpo.discriminacao : null, substitui_id: corpo.substitui_id ?? null, usuario: userId,
        });
        return json({ ok: true, ...r });
      }
      case "consultar": {
        const { userId } = await requireErpUser(req, ["vendas", "financeiro", "tecnico"]);
        return json({ ok: true, nfse: await consultarNfse(db, await carregar(), "consulta", userId) });
      }
      case "cancelar": {
        const { userId } = await requireErpUser(req, ["financeiro"]);
        const r = await cancelarNfse(db, await carregar(), String(corpo.motivo ?? ""), userId);
        return json({ ok: true, ...r });
      }
      default:
        throw new HttpError(400, "ação inválida");
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
