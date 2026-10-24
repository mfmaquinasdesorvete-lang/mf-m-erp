// Cadastro de cliente com IA (Clientes → novo → "Preencher com IA"): lê a conversa do WhatsApp colada e/ou a foto do
// cartão de visita (ver _shared/ia-cliente.ts) e procura cadastros parecidos (mesmo CPF/CNPJ, telefone ou e-mail),
// para não cadastrar repetido. Só sugere: quem cadastra escolhe o que usar e salva. Confere o "IA desligada" e grava o uso.
// POST { texto?, imagem?: { tipo, base64 } } -> { dados, avisos, repetidos: { id, nome, codigo, motivo }[], modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, mensagemPedidoRecusado, registrarIa } from "../_shared/ia-controle.ts";
import {
  digitos, ESQUEMA_CLIENTE, INSTRUCOES_CLIENTE, LIMITE_TEXTO_CLIENTE, montarPedidoCliente, normalizarCliente, TIPOS_IMAGEM_CLIENTE, type DadosClienteIA,
} from "../_shared/ia-cliente.ts";

const MODELO = "claude-opus-5-5";
const LIMITE_FOTO = 6 * 1024 * 1024;
type Db = ReturnType<typeof adminClient>;
type Repetido = { id: string; nome: string; codigo: number | null; motivo: string };

/** Cadastros parecidos: mesmo CPF/CNPJ, mesmo telefone (pelos últimos 8 dígitos) ou mesmo e-mail. */
async function repetidos(db: Db, d: DadosClienteIA): Promise<Repetido[]> {
  const achados = new Map<string, Repetido>();
  const pega = (l: any[] | null, motivo: string) => (l ?? []).forEach((c) => {
    if (!achados.has(c.id)) achados.set(c.id, { id: c.id, nome: c.nome_fantasia || c.nome, codigo: c.codigo ?? null, motivo });
  });
  const sel = "id, nome, nome_fantasia, codigo";
  if (d.cpf_cnpj) pega((await db.from("clientes").select(sel).eq("cpf_cnpj", d.cpf_cnpj).is("arquivado_em", null).limit(3)).data, "mesmo CPF/CNPJ");
  for (const f of [d.whatsapp, d.telefone].filter(Boolean) as string[]) {
    const fim = digitos(f).slice(-8);
    if (fim.length === 8) pega((await db.from("clientes").select(sel).or(`whatsapp.ilike.%${fim}%,telefone.ilike.%${fim}%`).is("arquivado_em", null).limit(3)).data, "mesmo telefone");
  }
  if (d.email) pega((await db.from("clientes").select(sel).ilike("email", d.email).is("arquivado_em", null).limit(3)).data, "mesmo e-mail");
  return [...achados.values()].slice(0, 5);
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
    const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, LIMITE_TEXTO_CLIENTE) : "";
    const img = body.imagem && typeof body.imagem.base64 === "string" ? body.imagem : null;
    if (img && !TIPOS_IMAGEM_CLIENTE.includes(img.tipo)) throw new HttpError(400, "A foto precisa ser JPG, PNG, WEBP ou GIF.");
    if (img && img.base64.length * 0.75 > LIMITE_FOTO) throw new HttpError(400, "Foto maior que 6 MB: tire outra mais perto do cartão.");
    if (texto.length < 8 && !img) throw new HttpError(400, "Cole a conversa do WhatsApp ou mande a foto do cartão de visita.");
    await conferirIaLigada(db);
    uso = { acao: img ? "cartao" : "conversa", resumo: img ? "Foto do cartão de visita" : texto.slice(0, 120) };

    const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (img) conteudo.push({ type: "image", source: { type: "base64", media_type: img.tipo, data: img.base64 } });
    conteudo.push({ type: "text", text: montarPedidoCliente(texto || null) });
    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_CLIENTE as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_CLIENTE, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: conteudo }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, mensagemPedidoRecusado(e.message));
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis ler isso: preencha à mão.");
    if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
    const bruto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let lido: Record<string, unknown>;
    try { lido = JSON.parse(bruto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const { dados, avisos } = normalizarCliente(lido);
    const rep = await repetidos(db, dados);
    await registrarIa(db, userId, { funcao: "ia-cliente", ...uso, resumo: `${uso.resumo} → ${dados.nome_fantasia || dados.nome || "sem nome"}`, modelo: resposta.model, ok: true });
    return json({ dados, avisos, repetidos: rep, modelo: resposta.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (uso) await registrarIa(db, userId, { funcao: "ia-cliente", ...uso, ok: false, erro: msg });
    return json({ error: msg }, e instanceof HttpError ? e.status : 500);
  }
});
