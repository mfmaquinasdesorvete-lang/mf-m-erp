// Busca nos documentos com IA (Documentos → "Achar pelo assunto"): lista os anexos com o login de quem pergunta (só o
// que a pessoa já pode ver), junta onde estão anexados e o resumo da IA, e o Claude aponta os que respondem à busca
// (ver _shared/ia-busca-docs.ts). Funcionários e pessoais nunca entram. Confere o "IA desligada" e grava o uso.
// POST { pergunta } -> { achados: { id, motivo }[], modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, mensagemPedidoRecusado, registrarIa } from "../_shared/ia-controle.ts";
import { ENTIDADES_RESUMO } from "../_shared/ia-resumo.ts";
import {
  ESQUEMA_BUSCA_DOCS, INSTRUCOES_BUSCA_DOCS, LIMITE_PERGUNTA_DOCS, montarListaDocs, normalizarBuscaDocs, type DocBusca,
} from "../_shared/ia-busca-docs.ts";

const MODELO = "claude-opus-5-5";
const ONDE: Record<string, string> = {
  pedido: "Pedido", os: "OS", cliente: "Cliente", fornecedor: "Fornecedor", produto: "Produto", conta_receber: "Conta a receber",
  conta_pagar: "Conta a pagar", nfe_recebida: "NF de fornecedor", pedido_compra: "Pedido de compra", equipamento: "Máquina vendida",
  geral: "Empresa", fechamento: "Fechamento do contador", my_frost: "My Frost (empresa anterior)",
};

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
    const pergunta = typeof body.pergunta === "string" ? body.pergunta.trim().slice(0, LIMITE_PERGUNTA_DOCS) : "";
    if (pergunta.length < 3) throw new HttpError(400, "Escreva o que você procura.");
    await conferirIaLigada(db);
    uso = { acao: "buscar", resumo: pergunta.slice(0, 120) };

    const eu = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false },
    });
    const { data: docs, error } = await eu.from("documentos").select("id, nome, entidade, entidade_id, descricao, pasta, created_at")
      .in("entidade", [...ENTIDADES_RESUMO]).order("created_at", { ascending: false }).limit(800);
    if (error) throw new Error(error.message);
    const lista = (docs ?? []) as (DocBusca & { entidade_id: string | null })[];
    if (!lista.length) return json({ achados: [] });

    // onde está anexado: nome do cliente/fornecedor e número do pedido/OS (com o login de quem pergunta)
    const ids = (e: string) => [...new Set(lista.filter((d) => d.entidade === e && d.entidade_id).map((d) => d.entidade_id!))];
    const [cli, forn, ped, os, res] = await Promise.all([
      ids("cliente").length ? eu.from("clientes").select("id, nome, nome_fantasia").in("id", ids("cliente")) : Promise.resolve({ data: [] }),
      ids("fornecedor").length ? eu.from("fornecedores").select("id, nome").in("id", ids("fornecedor")) : Promise.resolve({ data: [] }),
      ids("pedido").length ? eu.from("pedidos").select("id, numero").in("id", ids("pedido")) : Promise.resolve({ data: [] }),
      ids("os").length ? eu.from("ordens_servico").select("id, numero").in("id", ids("os")) : Promise.resolve({ data: [] }),
      eu.from("ia_resumos_documentos").select("documento_id, resumo").in("documento_id", lista.map((d) => d.id)),
    ]);
    const nomes = new Map<string, string>();
    (cli.data ?? []).forEach((c: any) => nomes.set(c.id, `Cliente ${c.nome_fantasia || c.nome}`));
    (forn.data ?? []).forEach((f: any) => nomes.set(f.id, `Fornecedor ${f.nome}`));
    (ped.data ?? []).forEach((p: any) => nomes.set(p.id, `Pedido ${p.numero}`));
    (os.data ?? []).forEach((o: any) => nomes.set(o.id, `OS ${o.numero}`));
    const resumos = new Map((res.data ?? []).map((r: any) => [r.documento_id, r.resumo]));
    const { texto, codigos } = montarListaDocs(lista.map((d) => ({
      ...d, onde: (d.entidade_id && nomes.get(d.entidade_id)) || ONDE[d.entidade] || d.entidade, resumo: resumos.get(d.id) ?? null,
    })));

    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_BUSCA_DOCS as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_BUSCA_DOCS, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Procura:\n"""${pergunta}"""\n\nDocumentos:\n${texto}` }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, mensagemPedidoRecusado(e.message));
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis fazer essa busca.");
    const bruto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let lido: Record<string, unknown>;
    try { lido = JSON.parse(bruto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const achados = normalizarBuscaDocs(lido, codigos);
    await registrarIa(db, userId, { funcao: "ia-busca-docs", ...uso, resumo: `${uso.resumo} → ${achados.length} achados`, modelo: resposta.model, ok: true });
    return json({ achados, modelo: resposta.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (uso) await registrarIa(db, userId, { funcao: "ia-busca-docs", ...uso, ok: false, erro: msg });
    return json({ error: msg }, e instanceof HttpError ? e.status : 500);
  }
});
