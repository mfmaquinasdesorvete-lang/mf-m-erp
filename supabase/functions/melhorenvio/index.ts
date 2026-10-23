// Melhor Envio: cotação em várias transportadoras de uma vez. O token fica só nos secrets do Supabase
// (MELHORENVIO_TOKEN; MELHORENVIO_CONTATO = e-mail para o User-Agent; MELHORENVIO_SANDBOX = 1 para testar no sandbox).
// POST { acao: "testar" }           -> confere o token e diz em nome de quem está a conta
// POST { acao: "cotar", envio_id }  -> serviços com valor e prazo para os volumes do envio (não compra etiqueta)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { BASE_ME, corpoCalculoMe, faltaParaCotarMe, lerCalculoMe, mensagemMe } from "../_shared/melhorenvio.ts";

async function chamar(caminho: string, token: string, init: RequestInit = {}) {
  const base = Deno.env.get("MELHORENVIO_SANDBOX") === "1" ? BASE_ME.sandbox : BASE_ME.producao;
  const contato = Deno.env.get("MELHORENVIO_CONTATO") ?? "sem e-mail";
  const r = await fetch(`${base}${caminho}`, {
    ...init, signal: AbortSignal.timeout(25_000),
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "User-Agent": `ERP Line (${contato})` },
  });
  const texto = await r.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { message: texto.slice(0, 200) }; }
  if (r.status === 401) throw new HttpError(401, "O Melhor Envio recusou o token. Gere um novo no painel (Integrações → Permissões de acesso) e troque o secret MELHORENVIO_TOKEN.");
  if (r.status >= 400) throw new HttpError(502, `Melhor Envio: ${mensagemMe(corpo) ?? `HTTP ${r.status}`}`);
  return corpo;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req, ["vendas", "financeiro", "expedicao"]);
    const body = await req.json().catch(() => ({}));
    const token = Deno.env.get("MELHORENVIO_TOKEN");
    if (!token) throw new HttpError(400, "Falta o secret MELHORENVIO_TOKEN no Supabase (Edge Functions → Secrets). Gere o token no painel do Melhor Envio: Integrações → Permissões de acesso.");

    if (body.acao === "testar") {
      const eu = (await chamar("/api/v2/me", token)) as Record<string, unknown> | null;
      const nome = [eu?.firstname, eu?.lastname].filter(Boolean).join(" ") || "conta sem nome";
      return json({ ok: true, conta: nome, sandbox: Deno.env.get("MELHORENVIO_SANDBOX") === "1" });
    }

    if (body.acao === "cotar") {
      const db = adminClient();
      const { data: envio } = await db.from("envios").select("id, unidade_id, cep_origem, cep_destino, valor_mercadoria, volumes").eq("id", body.envio_id).maybeSingle();
      if (!envio) throw new HttpError(404, "envio não encontrado");
      const { data: un } = await db.from("unidades").select("cep").eq("id", envio.unidade_id).maybeSingle();
      const dados = { ...envio, cep_origem: envio.cep_origem || un?.cep };
      const falta = faltaParaCotarMe(dados);
      if (falta.length) throw new HttpError(400, `Para cotar no Melhor Envio falta: ${falta.join(", ")}. Complete e salve o envio.`);
      const r = lerCalculoMe(await chamar("/api/v2/me/shipment/calculate", token, { method: "POST", body: JSON.stringify(corpoCalculoMe(dados)) }));
      if ("erro" in r) throw new HttpError(502, `Melhor Envio: ${r.erro}`);
      return json({ ok: true, ...r });
    }

    throw new HttpError(400, "ação desconhecida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
