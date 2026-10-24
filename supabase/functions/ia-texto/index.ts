// Texto para o cliente com IA (Ficha 360 → "Responder no WhatsApp" → "Escrever com IA"): junta o que o ERP sabe do
// cliente (últimos pedidos, contas em aberto, OS em andamento) e o Claude escreve a mensagem (ver _shared/ia-texto.ts).
// Só escreve: quem manda confere e envia. Confere o "IA desligada" e grava o uso.
// POST { cliente_id, pedido, mensagem_cliente?, tom? } -> { texto, avisos, modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, mensagemPedidoRecusado, registrarIa } from "../_shared/ia-controle.ts";
import {
  ESQUEMA_TEXTO, INSTRUCOES_TEXTO, LIMITE_MENSAGEM_CLIENTE, LIMITE_PEDIDO_TEXTO, montarPedidoTexto, normalizarTexto, TONS,
  type ContextoTexto, type Tom,
} from "../_shared/ia-texto.ts";

const MODELO = "claude-opus-5-5";
type Db = ReturnType<typeof adminClient>;
const hojeBR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dataBR = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : null);

async function contexto(db: Db, clienteId: string, hoje: string): Promise<ContextoTexto> {
  const { data: c, error } = await db.from("clientes").select("nome, nome_fantasia, tipo_pessoa, municipio").eq("id", clienteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new HttpError(404, "Cliente não encontrado.");
  const [ped, cr, os] = await Promise.all([
    db.from("pedidos").select("numero, status, valor_total, created_at, codigo_rastreio").eq("cliente_id", clienteId).is("excluida_em", null)
      .neq("status", "cancelado").order("created_at", { ascending: false }).limit(5),
    db.from("contas_receber").select("descricao, valor, valor_pago, vencimento").eq("cliente_id", clienteId).eq("status", "aberto")
      .order("vencimento", { ascending: true }).limit(8),
    db.from("ordens_servico").select("numero, equipamento, status, previsao").eq("cliente_id", clienteId).not("status", "in", "(entregue,cancelada)")
      .order("created_at", { ascending: false }).limit(5),
  ]);
  for (const r of [ped, cr, os]) if (r.error) throw new Error(r.error.message);
  const pf = c.tipo_pessoa === "PF" || c.tipo_pessoa === "fisica";
  return {
    cliente: { nome: pf ? c.nome : (c.nome_fantasia?.trim() || c.nome), pessoa_fisica: pf, cidade: c.municipio },
    pedidos: (ped.data ?? []).map((p: any) => ({ numero: p.numero, status: p.status, total: p.valor_total != null ? Number(p.valor_total) : null, data: dataBR(p.created_at)!, rastreio: p.codigo_rastreio?.trim() || null })),
    contas: (cr.data ?? []).map((x: any) => ({
      descricao: x.descricao, valor: Math.round((Number(x.valor) - Number(x.valor_pago || 0)) * 100) / 100,
      vencimento: dataBR(x.vencimento), vencida: !!x.vencimento && x.vencimento < hoje,
    })).filter((x) => x.valor > 0),
    os: (os.data ?? []).map((o: any) => ({ numero: o.numero, equipamento: o.equipamento, status: o.status, previsao: dataBR(o.previsao) })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let userId: string | null = null;
  let uso: { acao: string; resumo: string } | null = null;
  try {
    ({ userId } = await requireErpUser(req, ["vendas", "financeiro", "tecnico"]));
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");
    const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : "";
    const pedido = typeof body.pedido === "string" ? body.pedido.trim().slice(0, LIMITE_PEDIDO_TEXTO) : "";
    const msgCliente = typeof body.mensagem_cliente === "string" ? body.mensagem_cliente.trim().slice(0, LIMITE_MENSAGEM_CLIENTE) : "";
    const tom: Tom = TONS.includes(body.tom) ? body.tom : "cordial";
    if (!clienteId) throw new HttpError(400, "Escolha o cliente.");
    if (pedido.length < 4) throw new HttpError(400, "Escreva o que você quer falar para o cliente.");
    await conferirIaLigada(db);
    uso = { acao: tom, resumo: pedido.slice(0, 120) };

    const hoje = hojeBR();
    const ctx = await contexto(db, clienteId, hoje);
    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 3000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_TEXTO as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_TEXTO, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: montarPedidoTexto(pedido, msgCliente || null, tom, ctx, dataBR(hoje)!) }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, mensagemPedidoRecusado(e.message));
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis escrever isso: escreva à mão.");
    if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
    const bruto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let lido: Record<string, unknown>;
    try { lido = JSON.parse(bruto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const r = normalizarTexto(lido);
    if (!r.texto) throw new HttpError(502, "A IA não escreveu a mensagem: tente de novo.");
    await registrarIa(db, userId, { funcao: "ia-texto", ...uso, modelo: resposta.model, ok: true });
    return json({ ...r, modelo: resposta.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (uso) await registrarIa(db, userId, { funcao: "ia-texto", ...uso, ok: false, erro: msg });
    return json({ error: msg }, e instanceof HttpError ? e.status : 500);
  }
});
