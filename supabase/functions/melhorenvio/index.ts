// Melhor Envio: cotação em várias transportadoras de uma vez. O token fica só nos secrets do Supabase
// (MELHORENVIO_TOKEN; MELHORENVIO_CONTATO = e-mail para o User-Agent; MELHORENVIO_SANDBOX = 1 para testar no sandbox).
// POST { acao: "testar" }           -> confere o token e diz em nome de quem está a conta
// POST { acao: "cotar", envio_id }  -> serviços com valor e prazo para os volumes do envio (não compra etiqueta)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { faltaParaCotarMe } from "../_shared/melhorenvio.ts";
import { chamarMe, cotarMe, sandboxMe } from "../_shared/melhorenvio-api.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req, ["vendas", "financeiro", "expedicao"]);
    const body = await req.json().catch(() => ({}));

    if (body.acao === "testar") {
      const eu = (await chamarMe("/api/v2/me")) as Record<string, unknown> | null;
      const nome = [eu?.firstname, eu?.lastname].filter(Boolean).join(" ") || "conta sem nome";
      return json({ ok: true, conta: nome, sandbox: sandboxMe() });
    }

    if (body.acao === "cotar") {
      const db = adminClient();
      const { data: envio } = await db.from("envios").select("id, unidade_id, cep_origem, cep_destino, valor_mercadoria, volumes").eq("id", body.envio_id).maybeSingle();
      if (!envio) throw new HttpError(404, "envio não encontrado");
      const { data: un } = await db.from("unidades").select("cep").eq("id", envio.unidade_id).maybeSingle();
      const dados = { ...envio, cep_origem: envio.cep_origem || un?.cep };
      const falta = faltaParaCotarMe(dados);
      if (falta.length) throw new HttpError(400, `Para cotar no Melhor Envio falta: ${falta.join(", ")}. Complete e salve o envio.`);
      return json({ ok: true, ...(await cotarMe(dados)) });
    }

    throw new HttpError(400, "ação desconhecida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
