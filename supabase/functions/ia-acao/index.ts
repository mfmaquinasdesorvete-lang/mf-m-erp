// IA aciona ações do ERP com aprovação (Perguntar à IA → "⚡ Pedir uma ação"): o Claude diz QUAL ação e com que dados
// (ver _shared/ia-acao.ts) e a função procura, com o login de quem pediu, as contas em aberto ou o cliente. Não grava
// nada: a tela abre a ação de sempre já preenchida e só faz depois do Confirmar de quem pode. Confere o "IA desligada".
// POST { pedido } -> { proposta, contas: [...], clientes: [...], modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, mensagemPedidoRecusado, registrarIa } from "../_shared/ia-controle.ts";
import { ESQUEMA_ACAO, INSTRUCOES_ACAO, LIMITE_PEDIDO_ACAO, limparNome, normalizarAcao, ordenarContas } from "../_shared/ia-acao.ts";

const MODELO = "claude-opus-5-5";
const hojeBR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  let userId: string | null = null;
  let uso: { acao: string; resumo: string } | null = null;
  try {
    ({ userId } = await requireErpUser(req));
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");
    const pedido = typeof body.pedido === "string" ? body.pedido.replace(/\s+/g, " ").trim().slice(0, LIMITE_PEDIDO_ACAO) : "";
    if (pedido.length < 6) throw new HttpError(400, "Escreva o que quer fazer, por exemplo: recebi R$ 500 da Gelato Nobre no Pix hoje.");
    await conferirIaLigada(admin);
    uso = { acao: "preparar", resumo: pedido.slice(0, 120) };

    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_ACAO as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_ACAO, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Hoje é ${hojeBR()}.\nPedido: """${pedido}"""` }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, mensagemPedidoRecusado(e.message));
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis preparar isso.");
    const bruto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let lido: Record<string, unknown>;
    try { lido = JSON.parse(bruto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const proposta = normalizarAcao(lido, pedido);

    // a procura roda com o login de quem pediu: cada um só acha o que já pode ver
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false },
    });
    const nome = proposta.quem ? limparNome(proposta.quem) : "";
    let contas: unknown[] = [];
    let clientes: unknown[] = [];
    if ((proposta.acao === "baixa_receber" || proposta.acao === "baixa_pagar") && nome.length >= 2) {
      const receber = proposta.acao === "baixa_receber";
      const { data: pessoas } = await db.from(receber ? "clientes" : "fornecedores").select("id, nome, nome_fantasia")
        .or(`nome.ilike.%${nome}%,nome_fantasia.ilike.%${nome}%`).limit(20);
      const ids = (pessoas ?? []).map((p: any) => p.id);
      const nomeDe = new Map((pessoas ?? []).map((p: any) => [p.id, p.nome_fantasia || p.nome]));
      let q = db.from(receber ? "contas_receber" : "contas_pagar").select("*").eq("status", "aberto");
      q = ids.length ? q.or(`${receber ? "cliente_id" : "fornecedor_id"}.in.(${ids.join(",")}),descricao.ilike.%${nome}%`) : q.ilike("descricao", `%${nome}%`);
      const { data, error } = await q.order("vencimento").limit(30);
      if (error) throw new Error(error.message);
      contas = ordenarContas((data ?? []).map((c: any) => ({ ...c, quem: nomeDe.get(receber ? c.cliente_id : c.fornecedor_id) ?? null })), proposta.valor).slice(0, 8);
    }
    if (proposta.acao === "mensagem" && nome.length >= 2) {
      const { data } = await db.from("clientes").select("id, nome, nome_fantasia, whatsapp, telefone, portal_link, portal_token, tipo_pessoa, municipio, uf")
        .is("arquivado_em", null).or(`nome.ilike.%${nome}%,nome_fantasia.ilike.%${nome}%`).limit(6);
      clientes = data ?? [];
    }
    await registrarIa(admin, userId, { funcao: "ia-acao", ...uso, resumo: `${uso.resumo} → ${proposta.acao}`, modelo: resposta.model, ok: true });
    return json({ proposta, contas, clientes, modelo: resposta.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (uso) await registrarIa(admin, userId, { funcao: "ia-acao", ...uso, ok: false, erro: msg });
    return json({ error: msg }, e instanceof HttpError ? e.status : 500);
  }
});
