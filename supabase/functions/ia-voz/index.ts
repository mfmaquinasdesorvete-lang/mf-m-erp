// Anotar por voz (botão do microfone no ERP): recebe o texto que o celular transcreveu, o Claude entende o tipo e as
// pistas (ver _shared/ia-voz.ts) e a função procura no ERP os registros que combinam (OS da vídeo chamada, envio da
// coleta, OP, compra, cliente, teste do giga, pessoa da equipe). Só entende: quem falou escolhe o registro e confirma,
// e a anotação é gravada pelo banco (anotar_por_voz). A chave fica no secret ANTHROPIC_API_KEY do Supabase.
// POST { fala } -> { entendido, candidatos: Candidato[], pessoas: { id, nome }[], modelo }
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { conferirIaLigada, registrarIa } from "../_shared/ia-controle.ts";
import { ESQUEMA_VOZ, INSTRUCOES_VOZ, LIMITE_FALA, montarPedidoVoz, normalizarVoz, termosBusca, type EntendidoVoz } from "../_shared/ia-voz.ts";

const MODELO = "claude-opus-5-5";
type Db = ReturnType<typeof adminClient>;
type Candidato = { tabela: string; id: string; rotulo: string; detalhe: string | null; link: string; valor: number | null };

const nomeDe = (c: { nome?: string | null; nome_fantasia?: string | null } | null | undefined) =>
  [c?.nome_fantasia, c?.nome].filter(Boolean).join(" · ") || "—";
const unicos = <T extends { id: string }>(l: T[]) => [...new Map(l.map((x) => [x.id, x])).values()];

/** ids de clientes (ou fornecedores) pelo nome falado: o nome inteiro e depois a palavra mais longa. */
async function idsPorNome(db: Db, tabela: "clientes" | "fornecedores", nome: string | null) {
  for (const t of termosBusca(nome)) {
    const { data } = await db.from(tabela).select("id").or(`nome.ilike.%${t}%,nome_fantasia.ilike.%${t}%`).limit(20);
    if (data?.length) return data.map((r: { id: string }) => r.id);
  }
  return [];
}

async function candidatos(db: Db, e: EntendidoVoz): Promise<Candidato[]> {
  const clientes = e.cliente ? await idsPorNome(db, "clientes", e.cliente) : [];

  if (e.tipo === "pagamento_video" || e.tipo === "conserto") {
    const sel = "id, numero, status, atendimento, video_pago_em, valor_mao_obra, equipamento, numero_serie, created_at, cliente:clientes(nome, nome_fantasia)";
    let q = db.from("ordens_servico").select(sel).is("excluida_em", null).order("created_at", { ascending: false }).limit(8);
    if (e.numero_os) q = q.eq("numero", e.numero_os);
    else if (clientes.length) q = q.in("cliente_id", clientes);
    else if (e.numero_serie) q = q.ilike("numero_serie", `%${e.numero_serie}%`);
    else if (e.tipo === "pagamento_video") q = q.eq("atendimento", "video").is("video_pago_em", null);
    else q = q.limit(0);
    const { data } = await q;
    const os = (data ?? []) as any[];
    // vídeo esperando o Pix primeiro
    os.sort((a, b) => Number(b.atendimento === "video" && !b.video_pago_em) - Number(a.atendimento === "video" && !a.video_pago_em));
    const lista: Candidato[] = os.map((o) => ({
      tabela: "ordens_servico", id: o.id, rotulo: `OS #${o.numero} · ${nomeDe(o.cliente)}`,
      detalhe: [o.atendimento === "video" ? (o.video_pago_em ? "vídeo já paga" : "vídeo esperando o Pix") : null, o.equipamento, o.numero_serie && `NS ${o.numero_serie}`, o.status].filter(Boolean).join(" · ") || null,
      link: "/assistencia", valor: o.valor_mao_obra ? Number(o.valor_mao_obra) : null,
    }));
    // máquina chegando para conserto sem OS aberta: anota no cliente
    if (e.tipo === "conserto" && clientes.length) {
      const { data: cs } = await db.from("clientes").select("id, nome, nome_fantasia, municipio, uf").in("id", clientes.slice(0, 5));
      lista.push(...(cs ?? []).map((c: any) => ({
        tabela: "clientes", id: c.id, rotulo: `Cliente ${nomeDe(c)}`, detalhe: [c.municipio, c.uf].filter(Boolean).join("/") || "ainda sem OS", link: "/assistencia", valor: null,
      })));
    }
    return lista;
  }

  if (e.tipo === "coleta") {
    const sel = "id, numero, status, transportadora_nome, coleta_prevista, coletado_em, created_at, pedido:pedidos(numero), cliente:clientes(nome, nome_fantasia)";
    let q = db.from("envios").select(sel).order("created_at", { ascending: false }).limit(8);
    if (e.numero_pedido) {
      const { data: ps } = await db.from("pedidos").select("id").eq("numero", e.numero_pedido).limit(5);
      q = q.in("pedido_id", (ps ?? []).map((p: { id: string }) => p.id));
    } else if (clientes.length) q = q.in("cliente_id", clientes);
    else q = q.is("coletado_em", null);
    if (!e.numero_pedido && e.transportadora) {
      const t = termosBusca(e.transportadora)[0];
      if (t) q = q.ilike("transportadora_nome", `%${t}%`);
    }
    const { data } = await q;
    return ((data ?? []) as any[]).map((v) => ({
      tabela: "envios", id: v.id, rotulo: `Envio #${v.numero}${v.pedido?.numero ? ` · pedido ${v.pedido.numero}` : ""} · ${nomeDe(v.cliente)}`,
      detalhe: [v.transportadora_nome, v.coletado_em ? "já marcado como coletado" : v.coleta_prevista ? `coleta prevista ${String(v.coleta_prevista).slice(0, 10).split("-").reverse().join("/")}` : null, v.status].filter(Boolean).join(" · ") || null,
      link: "/fretes", valor: null,
    }));
  }

  if (e.tipo === "etapa_montagem") {
    const sel = "id, numero, status, numeros_serie, created_at, produto:produtos(descricao), pedido:pedidos(numero, cliente_id)";
    let q = db.from("ordens_producao").select(sel).is("excluida_em", null).order("created_at", { ascending: false }).limit(8);
    if (e.numero_op) q = q.eq("numero", e.numero_op);
    else if (e.numero_serie) q = q.ilike("numeros_serie", `%${e.numero_serie}%`);
    else if (e.numero_pedido) {
      const { data: ps } = await db.from("pedidos").select("id").eq("numero", e.numero_pedido).limit(5);
      q = q.in("pedido_id", (ps ?? []).map((p: { id: string }) => p.id));
    } else q = q.not("status", "in", "(concluida,cancelada)");
    const { data } = await q;
    return ((data ?? []) as any[]).map((o) => ({
      tabela: "ordens_producao", id: o.id, rotulo: `OP #${o.numero} · ${o.produto?.descricao ?? "máquina"}`,
      detalhe: [o.pedido?.numero && `pedido ${o.pedido.numero}`, o.numeros_serie && `NS ${o.numeros_serie}`, o.status].filter(Boolean).join(" · ") || null,
      link: "/producao", valor: null,
    }));
  }

  if (e.tipo === "material_recebido") {
    const fornecedores = e.fornecedor ? await idsPorNome(db, "fornecedores", e.fornecedor) : [];
    const sel = "id, numero, status, previsao_entrega, valor_total, recebido_em, created_at, fornecedor:fornecedores(nome, nome_fantasia)";
    let q = db.from("pedidos_compra").select(sel).is("excluida_em", null).order("created_at", { ascending: false }).limit(8);
    if (e.numero_pedido) q = q.eq("numero", e.numero_pedido);
    else if (fornecedores.length) q = q.in("fornecedor_id", fornecedores);
    else q = q.is("recebido_em", null);
    const { data } = await q;
    return ((data ?? []) as any[]).map((p) => ({
      tabela: "pedidos_compra", id: p.id, rotulo: `Compra #${p.numero} · ${nomeDe(p.fornecedor)}`,
      detalhe: [p.recebido_em ? "já recebida" : p.previsao_entrega && `previsão ${String(p.previsao_entrega).split("-").reverse().join("/")}`, p.status].filter(Boolean).join(" · ") || null,
      link: "/compras", valor: p.valor_total ? Number(p.valor_total) : null,
    }));
  }

  if (e.tipo === "giga_ok" && e.numero_serie) {
    const { data } = await db.from("testes_giga").select("id, numero, numero_serie, resultado, testado_em, operador_nome")
      .is("anulado_em", null).ilike("numero_serie", `%${e.numero_serie}%`).order("testado_em", { ascending: false }).limit(5);
    return ((data ?? []) as any[]).map((t) => ({
      tabela: "testes_giga", id: t.id, rotulo: `Teste do giga #${t.numero} · NS ${t.numero_serie}`,
      detalhe: [t.resultado, t.operador_nome, t.testado_em && new Date(t.testado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })].filter(Boolean).join(" · ") || null,
      link: "/teste-giga", valor: null,
    }));
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let userId: string | null = null;
  let uso: { acao: string; resumo: string } | null = null; // o que vai para o registro da IA
  try {
    ({ userId } = await requireErpUser(req));
    const body = await req.json().catch(() => ({}));
    const chave = Deno.env.get("ANTHROPIC_API_KEY");
    if (body.acao === "situacao") {
      const { data: c } = await db.from("configuracoes").select("ia_ligada").eq("id", 1).maybeSingle();
      return json({ configurada: !!chave, ligada: c?.ia_ligada !== false });
    }
    if (!chave) throw new HttpError(503, "IA não configurada: cadastre o secret ANTHROPIC_API_KEY no Supabase (Edge Functions → Secrets).");
    await conferirIaLigada(db);
    const fala = String(body.fala ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_FALA);
    if (fala.length < 4) throw new HttpError(400, "Não deu para ouvir: fale de novo.");
    uso = { acao: "entender_fala", resumo: fala };

    const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    const client = new Anthropic({ apiKey: chave });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_VOZ as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: INSTRUCOES_VOZ, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: montarPedidoVoz(fala, hoje) }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "A chave da IA (ANTHROPIC_API_KEY) foi recusada: confira o secret no Supabase.");
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "A IA está ocupada agora: tente de novo em um minuto.");
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `A IA não aceitou o pedido: ${e.message}`);
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `A IA não respondeu (erro ${e.status}): tente de novo.`);
      throw e;
    }
    if (resposta.stop_reason === "refusal") throw new HttpError(422, "A IA não quis anotar isso: escreva a anotação à mão.");
    if (resposta.stop_reason === "max_tokens") throw new HttpError(502, "A resposta da IA ficou incompleta: tente de novo.");
    const texto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let bruta: Record<string, unknown>;
    try { bruta = JSON.parse(texto); } catch { throw new HttpError(502, "A resposta da IA veio num formato inesperado: tente de novo."); }
    const entendido = normalizarVoz(bruta, fala);

    const lista = unicos(await candidatos(db, entendido)).slice(0, 8);
    // lembrete: a pessoa da equipe citada (as outras ficam para escolher na tela)
    const { data: equipe } = await db.from("usuarios_erp").select("user_id, nome").eq("ativo", true).neq("papel", "representante").order("nome");
    const pessoas = (equipe ?? []).map((u: { user_id: string; nome: string }) => ({ id: u.user_id, nome: u.nome }));
    await registrarIa(db, userId, { funcao: "ia-voz", ...uso, resumo: `${entendido.tipo}: ${fala}`, modelo: resposta.model, ok: true });
    return json({ entendido, candidatos: lista, pessoas, modelo: resposta.model });
  } catch (e) {
    if (uso) await registrarIa(db, userId, { funcao: "ia-voz", ...uso, ok: false, erro: (e as Error).message });
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
