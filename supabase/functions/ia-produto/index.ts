// Auto-Fill e Elaborator do cadastro de produto (Produtos → editar → "Preencher com IA"): o Claude lê o nome, os campos
// já preenchidos, a foto e o PDF do fornecedor e devolve as sugestões (ver _shared/ia-produto.ts). Só sugere: quem
// cadastra marca o que quer usar e salva o produto. A chave fica no secret ANTHROPIC_API_KEY do Supabase.
// POST { produto, foto_caminho?, imagem?: { tipo, base64 }, documento?: { nome, base64 } } -> { sugestao, modelo }
// POST { acao: "situacao" }                                                               -> { configurada }
// POST { acao: "itens", itens: ItemIA[] } (Conferir itens das notas, até 25)              -> { itens: SugestaoItemIA[], modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import {
  ESQUEMA_SUGESTAO, INSTRUCOES, LIMITE_ARQUIVO, montarPedido, normalizarSugestao, TIPOS_IMAGEM, type ProdutoEntrada, type SugestaoIA,
} from "../_shared/ia-produto.ts";
import { ESQUEMA_ITENS, INSTRUCOES_ITENS, LIMITE_ITENS, montarPedidoItens, normalizarItens, type ItemIA } from "../_shared/ia-itens.ts";

const MODELO = "claude-opus-5-5";
type TipoImagem = (typeof TIPOS_IMAGEM)[number];

/** base64 → tamanho em bytes (sem decodificar). */
const tamanho = (b64: string) => Math.floor((b64.length * 3) / 4);

function base64De(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Foto principal do produto guardada no ERP (bucket produtos-fotos). */
async function fotoGuardada(db: ReturnType<typeof adminClient>, caminho: string) {
  if (/^https?:/i.test(caminho) || caminho.includes("..")) return null;
  const { data, error } = await db.storage.from("produtos-fotos").download(caminho);
  if (error || !data) return null;
  const tipo = data.type as TipoImagem;
  if (!TIPOS_IMAGEM.includes(tipo) || data.size > LIMITE_ARQUIVO) return null;
  return { tipo, base64: base64De(new Uint8Array(await data.arrayBuffer())) };
}

/** Uma pergunta ao Claude com resposta no formato do esquema; erros da API viram mensagens em português. */
async function perguntar<T>(chave: string, instrucoes: string, esquema: unknown, conteudo: Anthropic.Beta.BetaContentBlockParam[], recusa: string) {
  const client = new Anthropic({ apiKey: chave });
  let resposta: Anthropic.Beta.BetaMessage;
  try {
    resposta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: esquema as Record<string, unknown> } },
      system: [{ type: "text", text: instrucoes, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: conteudo }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `A IA não aceitou o pedido: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
    throw e;
  }
  if (resposta.stop_reason === "refusal") throw new HttpError(422, recusa);
  if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
  const texto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try { return { bruta: JSON.parse(texto) as T, modelo: resposta.model }; }
  catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req);
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (body.acao === "situacao") return json({ configurada: !!chave });
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");

    if (body.acao === "itens") {
      const itens = (Array.isArray(body.itens) ? body.itens : []).slice(0, LIMITE_ITENS) as ItemIA[];
      if (!itens.length) throw new HttpError(400, "Nenhum item para conferir.");
      const r = await perguntar<{ itens?: [] }>(chave, INSTRUCOES_ITENS, ESQUEMA_ITENS, [{ type: "text", text: montarPedidoItens(itens) }],
        "A IA não quis responder sobre estes itens: confira à mão.");
      return json({ itens: normalizarItens(r.bruta, itens), modelo: r.modelo });
    }

    const produto = body.produto as ProdutoEntrada | undefined;
    if (!produto?.descricao || String(produto.descricao).trim().length < 2) throw new HttpError(400, "Escreva o nome do produto primeiro.");

    const db = adminClient();
    const { data: cats } = await db.from("categorias_produto").select("nome").eq("ativo", true).order("nome");
    const categorias = (cats ?? []).map((c: { nome: string }) => c.nome);

    let imagem: { tipo: TipoImagem; base64: string } | null = null;
    if (body.imagem?.base64) {
      if (!TIPOS_IMAGEM.includes(body.imagem.tipo)) throw new HttpError(400, "A foto precisa ser JPG, PNG, WEBP ou GIF.");
      if (tamanho(body.imagem.base64) > LIMITE_ARQUIVO) throw new HttpError(400, "Foto maior que 8 MB.");
      imagem = { tipo: body.imagem.tipo, base64: body.imagem.base64 };
    } else if (typeof body.foto_caminho === "string" && body.foto_caminho) {
      imagem = await fotoGuardada(db, body.foto_caminho);
    }
    const documento = body.documento?.base64 ? { nome: String(body.documento.nome ?? "documento.pdf").slice(0, 120), base64: String(body.documento.base64) } : null;
    if (documento && tamanho(documento.base64) > LIMITE_ARQUIVO) throw new HttpError(400, "PDF maior que 8 MB.");

    const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (imagem) conteudo.push({ type: "image", source: { type: "base64", media_type: imagem.tipo, data: imagem.base64 } });
    if (documento) conteudo.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: documento.base64 }, title: documento.nome });
    conteudo.push({ type: "text", text: montarPedido(produto, categorias, { temFoto: !!imagem, temDocumento: !!documento, nomeDocumento: documento?.nome }) });

    const r = await perguntar<Partial<SugestaoIA>>(chave, INSTRUCOES, ESQUEMA_SUGESTAO, conteudo,
      "A IA não quis responder sobre este produto. Preencha à mão ou tente sem o arquivo.");
    return json({ sugestao: normalizarSugestao(r.bruta, categorias), modelo: r.modelo, foto_usada: !!imagem, documento_usado: !!documento });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
