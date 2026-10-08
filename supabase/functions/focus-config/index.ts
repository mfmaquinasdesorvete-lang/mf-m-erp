// Configura os gatilhos (webhooks) da Focus NFe apontando para a função focus-webhook.
// POST { acao: "status" }     -> lista os gatilhos cadastrados para o CNPJ
// POST { acao: "registrar" }  -> cadastra os gatilhos "nfe" e "nfe_recebida" (se faltarem)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { focusJson, focusProducao } from "../_shared/focusnfe.ts";

const EVENTOS = ["nfe", "nfe_recebida"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await requireErpUser(req, []);
    const { acao } = await req.json();
    const db = adminClient();
    const { data: unidades } = await db.from("unidades").select("cnpj").eq("ativo", true);
    const cnpjs = (unidades ?? []).map((u: any) => onlyDigits(u.cnpj)).filter((c: string) => c.length === 14);
    if (!cnpjs.length) throw new HttpError(400, "preencha o CNPJ das unidades em Configurações → Unidades");

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/focus-webhook`;
    const listar = async () => {
      const hooks = await focusJson<any[]>(`/v2/hooks`);
      return (Array.isArray(hooks) ? hooks : []).filter((h) => cnpjs.includes(onlyDigits(h.cnpj)) && h.url === url);
    };

    if (acao === "status") {
      const hooks = await listar();
      // um evento só conta como ativo se estiver registrado para todas as unidades
      const eventos = EVENTOS.filter((e) => cnpjs.every((c) => hooks.some((h) => h.event === e && onlyDigits(h.cnpj) === c)));
      return json({ ok: true, ambiente: focusProducao() ? "producao" : "homologacao", eventos });
    }

    if (acao === "registrar") {
      const token = Deno.env.get("FOCUS_WEBHOOK_TOKEN");
      if (!token) throw new HttpError(500, "defina o secret FOCUS_WEBHOOK_TOKEN no Supabase");
      const existentes = await listar();
      const criados: string[] = [];
      for (const cnpj of cnpjs) {
        for (const event of EVENTOS.filter((e) => !existentes.some((h) => h.event === e && onlyDigits(h.cnpj) === cnpj))) {
          const r = await focusJson(`/v2/hooks`, {
            method: "POST",
            body: JSON.stringify({ cnpj, event, url, authorization: token }),
          });
          if (r?.erros || r?.codigo) throw new HttpError(422, r.mensagem || `falha ao criar gatilho ${event} (${cnpj})`);
          criados.push(`${event}:${cnpj}`);
        }
      }
      return json({ ok: true, criados, eventos: EVENTOS });
    }

    throw new HttpError(400, "ação inválida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
