// Resumo de documentos com IA (anexos → "Resumir com IA"): lê o documento com o login de quem pediu (só resume o que a
// pessoa já pode abrir), manda o PDF ou a foto ao Claude (ver _shared/ia-resumo.ts) e guarda em ia_resumos_documentos.
// Documentos de funcionários e pessoais nunca vão. Confere o "IA desligada" e grava o uso.
// POST { documento_id } -> { resumo, modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, mensagemPedidoRecusado, registrarIa } from "../_shared/ia-controle.ts";
import { ESQUEMA_RESUMO, INSTRUCOES_RESUMO, LIMITE_RESUMO, normalizarResumo, podeResumir } from "../_shared/ia-resumo.ts";

const MODELO = "claude-opus-5-5";

function base64De(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let userId: string | null = null;
  let uso: { acao: string; resumo: string } | null = null;
  try {
    ({ userId } = await requireErpUser(req));
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");
    const id = typeof body.documento_id === "string" ? body.documento_id : "";
    if (!id) throw new HttpError(400, "Escolha o documento.");

    // com o login de quem pediu: a regra de cada tipo de documento vale aqui também
    const eu = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false },
    });
    const { data: d, error } = await eu.from("documentos").select("id, entidade, nome, caminho, tipo, tamanho").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!d) throw new HttpError(404, "Documento não encontrado (ou você não tem acesso a ele).");
    if (!podeResumir(d)) {
      throw new HttpError(400, d.entidade === "funcionario" || !d.entidade ? "Documentos de funcionários não vão para a IA." : "A IA resume só PDF e fotos (JPG, PNG, WEBP) de até 20 MB, e não resume documentos de funcionários nem pessoais.");
    }
    await conferirIaLigada(db);
    uso = { acao: "resumir", resumo: `Resumir ${d.nome}` };

    const { data: arq, error: e2 } = await eu.storage.from("documentos").download(d.caminho);
    if (e2 || !arq) throw new HttpError(404, "Não deu para abrir o arquivo do documento.");
    const bytes = new Uint8Array(await arq.arrayBuffer());
    if (bytes.length > LIMITE_RESUMO) throw new HttpError(400, "Arquivo maior que 20 MB.");
    const b64 = base64De(bytes);
    const bloco: Anthropic.Beta.BetaContentBlockParam = d.tipo === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: d.tipo as "image/png", data: b64 } };

    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_RESUMO as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_RESUMO, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [bloco, { type: "text", text: `Resuma este documento (${d.nome}).` }] }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, mensagemPedidoRecusado(e.message));
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis resumir este documento.");
    if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
    const bruto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let lido: Record<string, unknown>;
    try { lido = JSON.parse(bruto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const resumo = normalizarResumo(lido);
    const { error: e3 } = await db.from("ia_resumos_documentos").upsert(
      { documento_id: d.id, resumo, criado_por: userId, modelo: resposta.model, criado_em: new Date().toISOString() }, { onConflict: "documento_id" });
    if (e3) throw new Error(e3.message);
    await registrarIa(db, userId, { funcao: "ia-resumo", ...uso, resumo: `${uso.resumo} → ${resumo.tipo_documento}`, modelo: resposta.model, ok: true });
    return json({ resumo, modelo: resposta.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (uso) await registrarIa(db, userId, { funcao: "ia-resumo", ...uso, ok: false, erro: msg });
    return json({ error: msg }, e instanceof HttpError ? e.status : 500);
  }
});
