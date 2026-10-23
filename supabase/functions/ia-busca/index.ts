// Perguntar à IA (Buscar do menu): recebe a pergunta em português, o Claude devolve o que procurar e com quais filtros
// (ver _shared/ia-busca.ts) e a função busca com o login de quem perguntou, então cada pessoa só vê o que já pode ver.
// A IA não escreve SQL nem grava nada. A chave fica no secret ANTHROPIC_API_KEY do Supabase.
// POST { pergunta } -> { filtros, etiquetas, resultados: Achado[], modelo }   ·   POST { acao: "situacao" } -> { configurada }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { HttpError, requireErpUser } from "../_shared/supabase.ts";
import { ESQUEMA_BUSCA, etiquetasBusca, INSTRUCOES_BUSCA, LIMITE_PERGUNTA, montarPedidoBusca, normalizarBusca } from "../_shared/ia-busca.ts";
import { buscar, hojeISO } from "../_shared/ia-busca-consulta.ts";

const MODELO = "claude-opus-5-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req);
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (body.acao === "situacao") return json({ configurada: !!chave });
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");
    const pergunta = String(body.pergunta ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_PERGUNTA);
    if (pergunta.length < 4) throw new HttpError(400, "Escreva a pergunta, por exemplo: máquinas vendidas em SP com a preventiva vencida.");

    const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_BUSCA as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_BUSCA, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: montarPedidoBusca(pergunta, `${hoje} (${hojeISO()})`) }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `A IA não aceitou o pedido: ${e.message}`);
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis responder essa pergunta: use a busca comum.");
    if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
    const texto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let bruta: Record<string, unknown>;
    try { bruta = JSON.parse(texto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const filtros = normalizarBusca(bruta, pergunta);

    // a busca roda com o login de quem perguntou: as regras de acesso do banco valem como em qualquer tela
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false },
    });
    const resultados = await buscar(db, filtros);
    return json({ filtros, etiquetas: etiquetasBusca(filtros), resultados, modelo: resposta.model });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const msg = (e as { message?: string })?.message ?? String(e);
    return json({ error: msg }, status);
  }
});
