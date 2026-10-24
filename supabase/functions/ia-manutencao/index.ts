// Dúvidas de manutenção (Assistência → "Dúvida de manutenção", só a equipe): junta o que o ERP tem — dicas conferidas,
// OS parecidas, peças cadastradas e a máquina escolhida — e o Claude responde (ver _shared/ia-manutencao.ts), sempre
// com "confirme com o técnico". Confere o interruptor da IA e grava o uso. A chave fica no secret ANTHROPIC_API_KEY.
// POST { duvida, produto_id? } -> { resposta, modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, mensagemPedidoRecusado, registrarIa } from "../_shared/ia-controle.ts";
import {
  ESQUEMA_MANUTENCAO, INSTRUCOES_MANUTENCAO, LIMITE_DUVIDA, montarPedidoManutencao, normalizarManutencao, palavrasChave, type ContextoManutencao,
} from "../_shared/ia-manutencao.ts";

const MODELO = "claude-opus-5-5";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Db = ReturnType<typeof adminClient>;
const ou = (campos: string[], termos: string[]) => termos.flatMap((t) => campos.map((c) => `${c}.ilike.%${t}%`)).join(",");

async function contexto(db: Db, duvida: string, produtoId: string | null): Promise<ContextoManutencao> {
  const termos = palavrasChave(duvida);
  const [maq, dicas, os, pecas] = await Promise.all([
    produtoId ? db.from("produtos").select("descricao, dicas_manutencao").eq("id", produtoId).maybeSingle() : Promise.resolve({ data: null }),
    (() => {
      let q = db.from("manutencao_dicas").select("id, defeito, solucao, modelo, produto_id").eq("ativo", true).order("criado_em", { ascending: false }).limit(8);
      if (termos.length) q = q.or([ou(["defeito", "solucao", "modelo"], termos), produtoId ? `produto_id.eq.${produtoId}` : ""].filter(Boolean).join(","));
      else if (produtoId) q = q.eq("produto_id", produtoId);
      return q;
    })(),
    termos.length
      ? db.from("ordens_servico").select("numero, equipamento, defeito_relatado, diagnostico, solucao").is("excluida_em", null)
        .or(ou(["defeito_relatado", "diagnostico", "solucao", "equipamento"], termos)).order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
    termos.length
      ? db.from("produtos").select("sku, descricao, estoque_atual").eq("ativo", true).in("tipo", ["peca", "insumo"]).or(ou(["descricao"], termos)).limit(15)
      : Promise.resolve({ data: [] }),
  ]);
  return {
    maquina: maq.data ? { descricao: (maq.data as any).descricao, dicas: (maq.data as any).dicas_manutencao } : null,
    dicas: ((dicas.data ?? []) as any[]).map((d) => ({ id: d.id, defeito: d.defeito, solucao: d.solucao, modelo: d.modelo })),
    os: ((os.data ?? []) as any[]).map((o) => ({ numero: o.numero, equipamento: o.equipamento, defeito: o.defeito_relatado, diagnostico: o.diagnostico, solucao: o.solucao })),
    pecas: ((pecas.data ?? []) as any[]).map((p) => ({ sku: p.sku, descricao: p.descricao, estoque: p.estoque_atual == null ? null : Number(p.estoque_atual) })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let userId: string | null = null;
  let uso: { acao: string; resumo: string } | null = null;
  try {
    // só a equipe (quem vende, atende, conserta, expede ou compra; o administrador sempre)
    ({ userId } = await requireErpUser(req, ["tecnico", "vendas", "financeiro", "expedicao", "compras"]));
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");
    const duvida = String(body.duvida ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_DUVIDA);
    if (duvida.length < 6) throw new HttpError(400, "Descreva o defeito: o que a máquina faz, quando começou, qual modelo.");
    const produtoId = typeof body.produto_id === "string" && UUID.test(body.produto_id) ? body.produto_id : null;
    await conferirIaLigada(db);
    uso = { acao: "duvida", resumo: duvida };

    const ctx = await contexto(db, duvida, produtoId);
    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA_MANUTENCAO as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_MANUTENCAO, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: montarPedidoManutencao(duvida, ctx) }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, mensagemPedidoRecusado(e.message));
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis responder essa dúvida: fale com o técnico.");
    if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
    const texto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let bruta: Record<string, unknown>;
    try { bruta = JSON.parse(texto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const r = normalizarManutencao(bruta, ctx.pecas.map((p) => p.sku ?? ""));
    await registrarIa(db, userId, { funcao: "ia-manutencao", ...uso, modelo: resposta.model, ok: true });
    return json({ resposta: r, usados: { dicas: ctx.dicas.length, os: ctx.os.length, pecas: ctx.pecas.length }, modelo: resposta.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (uso) await registrarIa(db, userId, { funcao: "ia-manutencao", ...uso, ok: false, erro: msg });
    return json({ error: msg }, e instanceof HttpError ? e.status : 500);
  }
});
