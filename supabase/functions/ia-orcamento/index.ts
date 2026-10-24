// Orçamento com IA (Vendas → novo pedido → "Montar com IA"): lê o pedido do cliente (conversa colada ou ditada), acha os
// produtos no catálogo vendável (ver _shared/ia-orcamento.ts) e procura o cliente no cadastro (CPF/CNPJ, telefone ou nome).
// Só sugere: o vendedor confere, os itens entram com o preço da tabela do pedido e ele salva. Confere o "IA desligada" e grava o uso.
// POST { texto } -> { cliente, clientes: { id, nome, codigo, cidade, motivo }[], itens, nao_achados, pagamento, observacao, modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, mensagemPedidoRecusado, registrarIa } from "../_shared/ia-controle.ts";
import {
  ESQUEMA_ORCAMENTO, INSTRUCOES_ORCAMENTO, LIMITE_TEXTO_ORCAMENTO, montarCatalogo, montarPedidoOrcamento, normalizarOrcamento,
  type ClienteFalado, type ProdutoCatalogo,
} from "../_shared/ia-orcamento.ts";

const MODELO = "claude-opus-5-5";
type Db = ReturnType<typeof adminClient>;
type Achado = { id: string; nome: string; codigo: number | null; cidade: string | null; motivo: string };

/** Clientes que podem ser o do pedido: mesmo CPF/CNPJ, mesmo telefone (últimos 8 dígitos) ou nome parecido. */
async function acharCliente(db: Db, c: ClienteFalado): Promise<Achado[]> {
  const achados = new Map<string, Achado>();
  const pega = (l: any[] | null, motivo: string) => (l ?? []).forEach((x) => {
    if (!achados.has(x.id)) achados.set(x.id, { id: x.id, nome: x.nome_fantasia || x.nome, codigo: x.codigo ?? null, cidade: x.municipio ?? null, motivo });
  });
  const sel = "id, nome, nome_fantasia, codigo, municipio";
  const base = () => db.from("clientes").select(sel).is("arquivado_em", null).limit(4);
  if (c.cpf_cnpj && c.cpf_cnpj.length >= 11) pega((await base().eq("cpf_cnpj", c.cpf_cnpj)).data, "mesmo CPF/CNPJ");
  const fim = (c.telefone ?? "").slice(-8);
  if (fim.length === 8) pega((await base().or(`whatsapp.ilike.%${fim}%,telefone.ilike.%${fim}%`)).data, "mesmo telefone");
  // nome: sem os caracteres que quebram o filtro; tenta o nome inteiro e depois a palavra mais longa
  const nome = (c.nome ?? "").replace(/[,()%*"\\.]/g, " ").replace(/\s+/g, " ").trim();
  if (achados.size === 0 && nome.length >= 3) {
    pega((await base().or(`nome.ilike.%${nome}%,nome_fantasia.ilike.%${nome}%`)).data, "nome parecido");
    const palavra = nome.split(" ").filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0];
    if (achados.size === 0 && palavra) pega((await base().or(`nome.ilike.%${palavra}%,nome_fantasia.ilike.%${palavra}%`)).data, "nome parecido");
  }
  return [...achados.values()].slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let userId: string | null = null;
  let uso: { acao: string; resumo: string } | null = null;
  try {
    ({ userId } = await requireErpUser(req, ["vendas", "financeiro"]));
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");
    const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, LIMITE_TEXTO_ORCAMENTO) : "";
    if (texto.length < 6) throw new HttpError(400, "Cole a conversa do cliente ou escreva o que ele quer.");
    await conferirIaLigada(db);
    uso = { acao: "orcamento", resumo: texto.slice(0, 120) };

    const { data: prods, error } = await db.from("produtos").select("id, sku, descricao, modelo, tipo")
      .eq("ativo", true).or("vendavel.is.null,vendavel.eq.true").order("descricao").limit(1500);
    if (error) throw new Error(error.message);
    const { texto: catalogo, codigos } = montarCatalogo((prods ?? []) as ProdutoCatalogo[]);

    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_ORCAMENTO as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_ORCAMENTO, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: montarPedidoOrcamento(texto, catalogo) }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, mensagemPedidoRecusado(e.message));
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis ler isso: monte o orçamento à mão.");
    if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
    const bruto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let lido: Record<string, unknown>;
    try { lido = JSON.parse(bruto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const r = normalizarOrcamento(lido, codigos);
    const clientes = await acharCliente(db, r.cliente);
    await registrarIa(db, userId, { funcao: "ia-orcamento", ...uso, resumo: `${uso.resumo} → ${r.itens.length} itens`, modelo: resposta.model, ok: true });
    return json({ ...r, clientes, modelo: resposta.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (uso) await registrarIa(db, userId, { funcao: "ia-orcamento", ...uso, ok: false, erro: msg });
    return json({ error: msg }, e instanceof HttpError ? e.status : 500);
  }
});
