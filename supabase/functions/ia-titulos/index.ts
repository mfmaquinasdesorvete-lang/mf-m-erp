// IA analisa as contas a pagar antes da aprovação (Aprovações → "Analisar com IA"): junta os fatos de cada conta em
// revisão (ver _shared/ia-titulos.ts), pede o parecer ao Claude e grava em ia_pareceres_pagar para quem aprova ver.
// Só sugere: a aprovação continua em revisar_contas. Confere o "IA desligada" e grava o uso.
// POST { refazer?: boolean } -> { analisadas, puladas, restantes, modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, mensagemPedidoRecusado, registrarIa } from "../_shared/ia-controle.ts";
import {
  ESQUEMA_TITULOS, INSTRUCOES_TITULOS, montarFatos, montarPedidoTitulos, normalizarTitulos, type ContaAnalise, type Fatos,
} from "../_shared/ia-titulos.ts";

const MODELO = "claude-opus-5-5";
const POR_VEZ = 30;
const hojeBR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const CAMPOS = "id, descricao, valor, vencimento, categoria, fornecedor_id, documento, linha_digitavel, nfe_recebida_id, recorrente_id, status, conta_origem_id";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let userId: string | null = null;
  let uso: { acao: string; resumo: string } | null = null;
  try {
    ({ userId } = await requireErpUser(req, ["financeiro"]));
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");
    await conferirIaLigada(db);
    const hoje = hojeBR();

    const { data: abertas, error } = await db.from("contas_pagar").select(CAMPOS)
      .in("revisao", ["em_revisao", "devolvido"]).eq("status", "aberto").order("vencimento").limit(300);
    if (error) throw new Error(error.message);
    const { data: feitos } = await db.from("ia_pareceres_pagar").select("conta_id, valor, vencimento").in("conta_id", (abertas ?? []).map((c) => c.id));
    const jaTem = new Map((feitos ?? []).map((p: any) => [p.conta_id, p]));
    // sem "refazer", só as contas sem parecer ou que mudaram de valor ou vencimento depois da análise
    const fila = ((abertas ?? []) as ContaAnalise[]).filter((c) => {
      const p = jaTem.get(c.id);
      return body.refazer === true || !p || Number(p.valor) !== Number(c.valor) || p.vencimento !== c.vencimento;
    });
    const vez = fila.slice(0, POR_VEZ);
    if (!vez.length) return json({ analisadas: 0, puladas: (abertas ?? []).length, restantes: 0 });
    uso = { acao: "analisar", resumo: `Analisar ${vez.length} contas a pagar em revisão` };

    const fornIds = [...new Set(vez.map((c) => c.fornecedor_id).filter(Boolean))] as string[];
    const notaIds = [...new Set(vez.map((c) => c.nfe_recebida_id).filter(Boolean))] as string[];
    const menor = somarDias(vez[0].vencimento.slice(0, 10), -40), maior = somarDias(vez[vez.length - 1].vencimento.slice(0, 10), 40);
    const [forn, notas, hist, outras, docs] = await Promise.all([
      fornIds.length ? db.from("fornecedores").select("id, nome, bloqueado, bloqueio_motivo").in("id", fornIds) : Promise.resolve({ data: [], error: null }),
      notaIds.length ? db.from("nfe_recebidas").select("id, valor_total, emitente_nome").in("id", notaIds) : Promise.resolve({ data: [], error: null }),
      fornIds.length ? db.from("contas_pagar").select("fornecedor_id, valor, valor_pago, data_pagamento").in("fornecedor_id", fornIds).eq("status", "pago")
        .order("data_pagamento", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
      db.from("contas_pagar").select(CAMPOS).neq("status", "cancelado").gte("vencimento", menor).lte("vencimento", maior).limit(2000),
      db.from("documentos").select("entidade_id").eq("entidade", "conta_pagar").in("entidade_id", vez.map((c) => c.id)),
    ]);
    for (const r of [forn, notas, hist, outras, docs]) if (r.error) throw new Error(r.error.message);
    const fornDe = new Map((forn.data ?? []).map((f: any) => [f.id, f]));
    const notaDe = new Map((notas.data ?? []).map((n: any) => [n.id, n]));
    const anexos = new Set((docs.data ?? []).map((d: any) => d.entidade_id));

    const porCodigo = new Map<string, ContaAnalise>();
    const fatos: Fatos[] = vez.map((c, i) => {
      const codigo = `C${i + 1}`;
      porCodigo.set(codigo, c);
      const f = c.fornecedor_id ? fornDe.get(c.fornecedor_id) : null;
      const n = c.nfe_recebida_id ? notaDe.get(c.nfe_recebida_id) : null;
      const historico = (hist.data ?? []).filter((h: any) => c.fornecedor_id && h.fornecedor_id === c.fornecedor_id)
        .slice(0, 12).map((h: any) => ({ valor: Number(h.valor_pago ?? h.valor) || 0, data: h.data_pagamento ?? "" })).filter((h) => h.data);
      return montarFatos(codigo, c, {
        hoje, fornecedor: f?.nome ?? c.descricao, bloqueio: f?.bloqueado ? (f.bloqueio_motivo || "bloqueado") : null, anexo: anexos.has(c.id),
        nota: n ? { numero: null, valor: Number(n.valor_total) || 0, emitente: n.emitente_nome ?? null } : null,
        historico, outras: (outras.data ?? []) as ContaAnalise[],
      });
    });

    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_TITULOS as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_TITULOS, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: montarPedidoTitulos(fatos, hoje) }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, mensagemPedidoRecusado(e.message));
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis analisar essas contas.");
    if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
    const bruto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let lido: Record<string, unknown>;
    try { lido = JSON.parse(bruto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const pareceres = normalizarTitulos(lido, new Set(porCodigo.keys()));
    const linhas = pareceres.map((p) => {
      const c = porCodigo.get(p.codigo)!;
      return { conta_id: c.id, sinal: p.sinal, motivo: p.motivo, valor: c.valor, vencimento: c.vencimento, criado_por: userId, modelo: resposta.model, criado_em: new Date().toISOString() };
    });
    if (linhas.length) {
      const { error: e2 } = await db.from("ia_pareceres_pagar").upsert(linhas, { onConflict: "conta_id" });
      if (e2) throw new Error(e2.message);
    }
    const n = (s: string) => pareceres.filter((p) => p.sinal === s).length;
    await registrarIa(db, userId, { funcao: "ia-titulos", ...uso, resumo: `${uso.resumo} → ${n("ok")} ok, ${n("atencao")} atenção, ${n("conferir")} conferir`, modelo: resposta.model, ok: true });
    return json({ analisadas: linhas.length, puladas: (abertas ?? []).length - fila.length, restantes: fila.length - vez.length, modelo: resposta.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (uso) await registrarIa(db, userId, { funcao: "ia-titulos", ...uso, ok: false, erro: msg });
    return json({ error: msg }, e instanceof HttpError ? e.status : 500);
  }
});
