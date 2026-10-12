// WhatsApp oficial (API da Meta, Cloud API): régua de cobrança sem clique manual e respostas dos clientes.
//  GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…        → confirmação do webhook pela Meta
//  POST { object: "whatsapp_business_account", entry }                  → avisos da Meta (assinados): situação das mensagens e respostas
//  POST { acao: "status" }                                (vendas/financeiro) → configuração (sem segredos) e endereço do webhook
//  POST { acao: "configurar", numero_id, waba_id, token?, app_secret? }  (admin) → confere na Meta e guarda (segredos no cofre)
//  POST { acao: "automatico", ligado }                    (financeiro) → liga/desliga o envio automático da régua
//  POST { acao: "modelos" }                               (financeiro) → manda para aprovação os modelos novos/alterados e atualiza a situação
//  POST { acao: "enviar" }                                (agendamento ou financeiro) → manda a fila
//  POST { acao: "responder", telefone, texto }            (vendas/financeiro) → resposta livre (até 24 h depois da mensagem do cliente)
//  POST { acao: "teste", telefone }                       (admin) → modelo hello_world da Meta, para conferir o número
// Deploy com --no-verify-jwt: a Meta e o agendamento não mandam login de usuário; o resto confere aqui dentro.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { pixCopiaECola } from "../_shared/cobranca.ts";
import { EXEMPLOS_WHATSAPP, modeloDaMensagem, nomeModelo, parametro, preencherModelo, valoresCobranca } from "../_shared/whatsapp-modelos.ts";

const VERSAO = Deno.env.get("WHATSAPP_API_VERSAO") ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${VERSAO}`;
type Segredos = { whatsapp_token?: string; whatsapp_app_secret?: string; whatsapp_verify_token?: string };
type Config = { whatsapp_api_ativo: boolean; whatsapp_numero_id: string | null; whatsapp_waba_id: string | null; whatsapp_numero: string | null;
  whatsapp_nome: string | null; nome_fantasia: string | null; razao_social: string | null };

class ErroMeta extends Error {
  constructor(public status: number, public codigo: number | null, message: string) { super(message); }
}

async function meta<T>(token: string, metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`${GRAPH}${caminho}`, {
    method: metodo, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = j?.error;
    throw new ErroMeta(r.status, e?.code ?? null, `Meta (${r.status}${e?.code ? ` · ${e.code}` : ""}): ${e?.error_user_msg || e?.error_data?.details || e?.message || "erro"}`);
  }
  return j as T;
}

const segredos = async (db: SupabaseClient): Promise<Segredos> => ((await db.rpc("whatsapp_segredos")).data ?? {}) as Segredos;
const config = async (db: SupabaseClient): Promise<Config> =>
  (await db.from("configuracoes").select("whatsapp_api_ativo, whatsapp_numero_id, whatsapp_waba_id, whatsapp_numero, whatsapp_nome, nome_fantasia, razao_social").eq("id", 1).single()).data as Config;
const urlWebhook = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();

  // a Meta confirma o webhook com GET (código combinado na configuração)
  if (req.method === "GET") {
    const u = new URL(req.url);
    const seg = await segredos(db);
    if (u.searchParams.get("hub.mode") === "subscribe" && seg.whatsapp_verify_token && u.searchParams.get("hub.verify_token") === seg.whatsapp_verify_token) {
      return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json({ error: "use POST" }, 405);

  const bruto = await req.text();
  let body: Record<string, any>;
  try { body = JSON.parse(bruto); } catch { return json({ error: "corpo inválido" }, 400); }

  try {
    if (body.object === "whatsapp_business_account") return json(await avisoMeta(db, req, bruto, body));

    const agendamento = body.acao === "enviar" && await chamadaDoAgendamento(req);
    if (body.acao === "configurar" || body.acao === "teste") await requireErpUser(req, []);
    else if (["automatico", "modelos", "enviar"].includes(body.acao) && !agendamento) await requireErpUser(req, ["financeiro"]);
    else if (!agendamento) await requireErpUser(req, ["vendas", "financeiro"]);

    if (body.acao === "status") return json(await status(db, req));
    if (body.acao === "configurar") return json(await configurar(db, body));

    const [cfg, seg] = await Promise.all([config(db), segredos(db)]);
    if (!cfg.whatsapp_numero_id || !seg.whatsapp_token) throw new HttpError(400, "Configure o WhatsApp oficial primeiro (Financeiro → Cobrança).");
    if (body.acao === "automatico") {
      await db.from("configuracoes").update({ whatsapp_api_ativo: body.ligado === true }).eq("id", 1);
      return json({ ok: true, ativo: body.ligado === true });
    }
    if (body.acao === "modelos") return json(await modelos(db, cfg, seg.whatsapp_token));
    if (body.acao === "enviar") return json(await enviarFila(db, cfg, seg.whatsapp_token));
    if (body.acao === "responder") {
      const r = await responder(db, String(body.telefone ?? ""), String(body.texto ?? ""));
      await enviarFila(db, cfg, seg.whatsapp_token); // sai na hora
      const { data: m } = await db.from("whatsapp_mensagens").select("status, erro").eq("id", r.id).single();
      if (m?.status === "erro") throw new HttpError(400, m.erro ?? "a Meta não aceitou a mensagem");
      return json({ ok: true });
    }
    if (body.acao === "teste") return json(await teste(db, cfg, seg.whatsapp_token, String(body.telefone ?? "")));
    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof HttpError ? e.status : 500);
  }
});

async function status(db: SupabaseClient, req: Request) {
  const [cfg, seg] = await Promise.all([config(db), segredos(db)]);
  // código do webhook só para o administrador (é quem cola na Meta)
  let admin = false;
  try { await requireErpUser(req, []); admin = true; } catch { /* não é admin */ }
  return {
    configurado: !!(cfg.whatsapp_numero_id && seg.whatsapp_token), ativo: cfg.whatsapp_api_ativo, numero: cfg.whatsapp_numero, nome: cfg.whatsapp_nome,
    numero_id: cfg.whatsapp_numero_id, waba_id: cfg.whatsapp_waba_id, assinatura: !!seg.whatsapp_app_secret,
    webhook: urlWebhook(), verify_token: admin ? seg.whatsapp_verify_token ?? null : null,
  };
}

async function configurar(db: SupabaseClient, b: Record<string, any>) {
  const numeroId = String(b.numero_id ?? "").replace(/\D/g, ""), wabaId = String(b.waba_id ?? "").replace(/\D/g, "");
  if (!numeroId || !wabaId) throw new HttpError(400, "Informe o ID do número de telefone e o ID da conta do WhatsApp Business.");
  const seg = await segredos(db);
  const token = String(b.token ?? "").trim() || seg.whatsapp_token;
  const appSecret = String(b.app_secret ?? "").trim() || seg.whatsapp_app_secret;
  if (!token) throw new HttpError(400, "Informe o token de acesso (usuário do sistema) da Meta.");
  if (!appSecret) throw new HttpError(400, "Informe a chave secreta do app (Meta → Configurações do app → Básico).");

  const fone = await meta<{ display_phone_number?: string; verified_name?: string }>(token, "GET", `/${numeroId}?fields=display_phone_number,verified_name`)
    .catch((e) => { throw new HttpError(400, `O número não confere: ${(e as Error).message}`); });
  await meta(token, "GET", `/${wabaId}/message_templates?limit=1`)
    .catch((e) => { throw new HttpError(400, `A conta do WhatsApp Business não confere (ou o token não tem a permissão whatsapp_business_management): ${(e as Error).message}`); });
  // o app passa a receber os avisos desta conta (situação das mensagens e respostas)
  const inscrito = await meta(token, "POST", `/${wabaId}/subscribed_apps`).then(() => true).catch(() => false);

  for (const [nome, valor] of [["whatsapp_token", token], ["whatsapp_app_secret", appSecret]] as const) {
    const { error } = await db.rpc("whatsapp_guardar_segredo", { p_nome: nome, p_valor: valor });
    if (error) throw new Error(error.message);
  }
  if (!seg.whatsapp_verify_token) await db.rpc("whatsapp_guardar_segredo", { p_nome: "whatsapp_verify_token", p_valor: crypto.randomUUID().replace(/-/g, "") });
  await db.from("configuracoes").update({
    whatsapp_numero_id: numeroId, whatsapp_waba_id: wabaId, whatsapp_numero: fone.display_phone_number ?? null, whatsapp_nome: fone.verified_name ?? null,
  }).eq("id", 1);
  const novo = await segredos(db);
  return { ok: true, numero: fone.display_phone_number ?? null, nome: fone.verified_name ?? null, webhook: urlWebhook(), verify_token: novo.whatsapp_verify_token, inscrito };
}

/** Manda para aprovação o modelo de cada etapa com WhatsApp (novo ou com texto mudado) e atualiza a situação de todos. */
async function modelos(db: SupabaseClient, cfg: Config, token: string) {
  if (!cfg.whatsapp_waba_id) throw new HttpError(400, "Falta o ID da conta do WhatsApp Business.");
  const { data: etapas } = await db.from("regua_cobranca").select("*").eq("canal_whatsapp", true);
  let enviados = 0;
  const erros: string[] = [];
  for (const e of etapas ?? []) {
    if (e.wa_modelo && e.wa_mensagem_base === e.mensagem && e.wa_status !== "REJECTED") continue;
    const { texto, variaveis } = modeloDaMensagem(e.mensagem);
    const nome = nomeModelo(e, texto);
    const corpo = {
      name: nome, language: "pt_BR", category: "UTILITY",
      components: [{ type: "BODY", text: texto, ...(variaveis.length ? { example: { body_text: [variaveis.map((v) => EXEMPLOS_WHATSAPP[v] ?? v)] } } : {}) }],
    };
    const base = { wa_modelo: nome, wa_texto: texto, wa_variaveis: variaveis, wa_mensagem_base: e.mensagem };
    try {
      const r = await meta<{ status?: string }>(token, "POST", `/${cfg.whatsapp_waba_id}/message_templates`, corpo);
      await db.from("regua_cobranca").update({ ...base, wa_status: r.status ?? "PENDING", wa_erro: null }).eq("id", e.id);
      enviados++;
    } catch (er) {
      const msg = (er as Error).message;
      // mesmo texto já enviado antes (nome igual): só passa a usar
      if (/already exists|já existe|2388024/i.test(msg)) await db.from("regua_cobranca").update({ ...base, wa_erro: null }).eq("id", e.id);
      else { await db.from("regua_cobranca").update({ wa_erro: msg }).eq("id", e.id); erros.push(`${e.nome}: ${msg}`); }
    }
  }
  // situação de todos os modelos do ERP na Meta
  const lista = await meta<{ data: { name: string; status: string; rejected_reason?: string }[] }>(token, "GET",
    `/${cfg.whatsapp_waba_id}/message_templates?fields=name,status,rejected_reason&limit=200`);
  const porNome = new Map((lista.data ?? []).map((t) => [t.name, t]));
  const { data: atuais } = await db.from("regua_cobranca").select("id, wa_modelo").not("wa_modelo", "is", null);
  for (const e of atuais ?? []) {
    const t = porNome.get(e.wa_modelo);
    if (!t) continue;
    await db.from("regua_cobranca").update({
      wa_status: t.status, wa_erro: t.status === "REJECTED" ? `Recusado pela Meta${t.rejected_reason && t.rejected_reason !== "NONE" ? ` (${t.rejected_reason})` : ""}: ajuste o texto e envie de novo.` : null,
    }).eq("id", e.id);
  }
  return { ok: true, enviados, erros };
}

const permanente = (e: unknown) => e instanceof ErroMeta && e.status >= 400 && e.status < 500 && e.status !== 429;

async function enviarFila(db: SupabaseClient, cfg: Config, token: string) {
  const { data: fila } = await db.from("whatsapp_mensagens").select("*").eq("status", "pendente").eq("direcao", "saida").order("created_at").limit(40);
  let enviadas = 0, erros = 0;
  const empresa = cfg.nome_fantasia || cfg.razao_social;
  for (const m of fila ?? []) {
    // trava a mensagem (dois envios ao mesmo tempo não mandam duas vezes)
    const { data: trava } = await db.from("whatsapp_mensagens").update({ status: "enviando", tentativas: m.tentativas + 1, atualizado_em: new Date().toISOString() })
      .eq("id", m.id).eq("status", "pendente").select("id").maybeSingle();
    if (!trava) continue;
    try {
      let corpo: Record<string, unknown>;
      let texto: string | null = m.texto;
      if (m.etapa_id) {
        const { data: e } = await db.from("regua_cobranca").select("evento, wa_modelo, wa_texto, wa_variaveis").eq("id", m.etapa_id).single();
        const { data: conta } = await db.from("contas_receber").select("status").eq("id", m.conta_receber_id).maybeSingle();
        // lembrete de conta que foi paga (ou cancelada) antes de sair: não manda
        if (e?.evento !== "pagamento" && conta?.status !== "aberto") {
          await db.from("whatsapp_mensagens").update({ status: "erro", erro: "Não enviada: a conta já foi paga ou cancelada.", atualizado_em: new Date().toISOString() }).eq("id", m.id);
          continue;
        }
        const { data: d } = await db.rpc("dados_cobranca", { p_conta: m.conta_receber_id, p_etapa: m.etapa_id });
        const { data: cli } = await db.from("clientes").select("nome, nome_fantasia").eq("id", m.cliente_id).maybeSingle();
        const pix = d?.pix?.chave ? pixCopiaECola({ chave: String(d.pix.chave), nome: String(d.pix.nome ?? ""), cidade: String(d.pix.cidade ?? ""),
          valor: Number(d.valor ?? 0), txid: `MF${String(d.conta_id ?? "").replace(/-/g, "").slice(0, 20)}` }) : null;
        const valores = valoresCobranca({ ...(d ?? {}), cliente: cli?.nome_fantasia?.trim() || cli?.nome }, empresa, pix);
        const parametros = (e?.wa_variaveis ?? []).map((v: string) => valores[v] ?? parametro(null));
        corpo = {
          messaging_product: "whatsapp", to: m.telefone, type: "template",
          template: { name: m.modelo ?? e?.wa_modelo, language: { code: "pt_BR" },
            components: parametros.length ? [{ type: "body", parameters: parametros.map((t: string) => ({ type: "text", text: t })) }] : [] },
        };
        texto = e?.wa_texto ? preencherModelo(e.wa_texto, parametros) : texto;
      } else if (m.modelo) {
        corpo = { messaging_product: "whatsapp", to: m.telefone, type: "template", template: { name: m.modelo, language: { code: m.modelo === "hello_world" ? "en_US" : "pt_BR" } } };
      } else {
        corpo = { messaging_product: "whatsapp", to: m.telefone, type: "text", text: { body: m.texto ?? "", preview_url: true } };
      }
      const r = await meta<{ messages?: { id: string }[] }>(token, "POST", `/${cfg.whatsapp_numero_id}/messages`, corpo);
      if (texto !== m.texto) await db.from("whatsapp_mensagens").update({ texto }).eq("id", m.id);
      await db.rpc("whatsapp_enviado", { p_id: m.id, p_wamid: r.messages?.[0]?.id ?? null });
      enviadas++;
    } catch (er) {
      const final = permanente(er) || m.tentativas + 1 >= 3;
      await db.from("whatsapp_mensagens").update({ status: final ? "erro" : "pendente", erro: (er as Error).message, atualizado_em: new Date().toISOString() }).eq("id", m.id);
      erros++;
    }
  }
  return { ok: true, enviadas, erros };
}

async function responder(db: SupabaseClient, telefone: string, texto: string) {
  telefone = telefone.replace(/\D/g, "");
  texto = texto.trim();
  if (!telefone || !texto) throw new HttpError(400, "Escreva a mensagem.");
  if (texto.length > 4000) throw new HttpError(400, "Mensagem muito longa (até 4.000 caracteres).");
  const { data: ultima } = await db.from("whatsapp_mensagens").select("cliente_id, created_at").eq("telefone", telefone).eq("direcao", "entrada")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!ultima || Date.now() - new Date(ultima.created_at).getTime() > 24 * 3600_000) {
    throw new HttpError(400, "Passou de 24 horas da última mensagem do cliente: a Meta só deixa mandar modelo aprovado. Use o WhatsApp do celular.");
  }
  const { data, error } = await db.from("whatsapp_mensagens").insert({ direcao: "saida", telefone, cliente_id: ultima.cliente_id, texto, status: "pendente" }).select("id").single();
  if (error) throw new Error(error.message);
  return { ok: true, id: data.id };
}

async function teste(db: SupabaseClient, cfg: Config, token: string, telefone: string) {
  const fone = telefone.replace(/\D/g, "");
  const to = /^\d{10,11}$/.test(fone) ? `55${fone}` : fone;
  if (!/^55\d{10,11}$/.test(to)) throw new HttpError(400, "Telefone inválido (DDD + número).");
  const r = await meta<{ messages?: { id: string }[] }>(token, "POST", `/${cfg.whatsapp_numero_id}/messages`, {
    messaging_product: "whatsapp", to, type: "template", template: { name: "hello_world", language: { code: "en_US" } },
  });
  await db.from("whatsapp_mensagens").insert({ direcao: "saida", telefone: to, modelo: "hello_world", texto: "Mensagem de teste (hello_world)",
    status: "enviado", wamid: r.messages?.[0]?.id ?? null, enviado_em: new Date().toISOString() });
  return { ok: true };
}

const ORDEM = ["pendente", "enviando", "enviado", "entregue", "lido"];
const SITUACAO: Record<string, string> = { sent: "enviado", delivered: "entregue", read: "lido", failed: "erro" };

async function assinaturaValida(req: Request, bruto: string, segredo: string) {
  const recebida = req.headers.get("x-hub-signature-256") ?? "";
  if (!recebida.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(bruto)));
  const esperada = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  const dada = recebida.slice(7);
  if (dada.length !== esperada.length) return false;
  let dif = 0;
  for (let i = 0; i < dada.length; i++) dif |= dada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return dif === 0;
}

async function avisoMeta(db: SupabaseClient, req: Request, bruto: string, body: Record<string, any>) {
  const seg = await segredos(db);
  // sem a chave do app não dá para conferir quem mandou: ignora
  if (!seg.whatsapp_app_secret || !(await assinaturaValida(req, bruto, seg.whatsapp_app_secret))) {
    throw new HttpError(401, "assinatura inválida");
  }
  let situacoes = 0, recebidas = 0;
  for (const entrada of body.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const v = mudanca.value ?? {};
      for (const s of v.statuses ?? []) {
        const nova = SITUACAO[s.status];
        if (!nova || !s.id) continue;
        const { data: m } = await db.from("whatsapp_mensagens").select("id, status").eq("wamid", s.id).maybeSingle();
        if (!m) continue;
        // avisos chegam fora de ordem: só avança (lido não volta a entregue); erro vale sempre
        if (nova !== "erro" && ORDEM.indexOf(nova) <= ORDEM.indexOf(m.status)) continue;
        const erro = nova === "erro" ? (s.errors?.[0]?.error_data?.details || s.errors?.[0]?.title || "a Meta não entregou") : null;
        await db.from("whatsapp_mensagens").update({ status: nova, erro, atualizado_em: new Date().toISOString() }).eq("id", m.id);
        situacoes++;
      }
      const nomes = new Map<string, string>((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
      for (const msg of v.messages ?? []) {
        const texto = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title
          ?? (msg.type ? `[${msg.type === "image" ? "foto" : msg.type === "audio" ? "áudio" : msg.type === "document" ? "documento" : msg.type}]` : "");
        const { error } = await db.rpc("whatsapp_receber", { p_telefone: String(msg.from ?? ""), p_texto: texto, p_wamid: String(msg.id ?? ""), p_nome: nomes.get(msg.from) ?? null });
        if (!error) recebidas++;
      }
    }
  }
  return { ok: true, situacoes, recebidas };
}
