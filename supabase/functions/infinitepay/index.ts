// Link de pagamento da InfinitePay (Pix ou cartão).
//  POST { acao: "criar", conta_id }               → link de uma conta a receber          (usuário do ERP: financeiro ou vendas)
//  POST { acao: "criar_pedido", pedido_id }       → link do que falta pagar do pedido    (usuário do ERP: financeiro ou vendas)
//  POST { acao: "pagar_proposta", token }         → "Pagar agora" na página da proposta  (sem login: venda aprovada por Pix ou cartão)
//  POST { acao: "pagar_conta", token, conta_id }  → botão da área do cliente             (sem login: conta por Pix/cartão ou vencida)
//       todas devolvem { id, url, reaproveitado }
//  POST { order_nsu, transaction_nsu, invoice_slug, ... }   (aviso da InfinitePay, sem login)
//       → confere o pagamento direto na InfinitePay e, se aprovado, dá baixa (confirmar_cobranca_link).
// Deploy com --no-verify-jwt: a InfinitePay e o cliente não mandam login; a criação pelo ERP confere o usuário aqui dentro.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { centavos, type ClienteLink, conferirPagamento, criarLinkInfinitePay, lerAviso, pedidoLink } from "../_shared/infinitepay.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VENDA_APROVADA = ["aprovado", "faturado", "entregue"];
const MEIOS_LINK = ["pix", "cartao"];
const CLIENTE = "cliente:clientes(nome, email, whatsapp, telefone)";

type Alvo = { contaId: string | null; pedidoId: string | null; unidadeId: string | null; descricao: string; valor: number; cliente: ClienteLink | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "corpo inválido" }, 400);
  const db = adminClient();
  try {
    if (body.acao === "criar") {
      const { userId } = await requireErpUser(req, ["financeiro", "vendas"]);
      return json(await criarLink(db, await alvoConta(db, String(body.conta_id ?? "")), userId));
    }
    if (body.acao === "criar_pedido") {
      const { userId } = await requireErpUser(req, ["financeiro", "vendas"]);
      return json(await criarLink(db, await alvoPedido(db, String(body.pedido_id ?? "")), userId));
    }
    if (body.acao === "pagar_proposta") return json(await pagarProposta(db, String(body.token ?? "")));
    if (body.acao === "pagar_conta") return json(await pagarConta(db, String(body.token ?? ""), String(body.conta_id ?? "")));
    if ("order_nsu" in body) return await aviso(db, body);
    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof HttpError ? e.status : 500);
  }
});

const um = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function alvoConta(db: SupabaseClient, contaId: string): Promise<Alvo> {
  if (!UUID.test(contaId)) throw new HttpError(400, "conta inválida");
  const { data: c } = await db.from("contas_receber").select(`id, descricao, valor, status, unidade_id, ${CLIENTE}`).eq("id", contaId).maybeSingle();
  if (!c) throw new HttpError(404, "conta não encontrada");
  if (c.status !== "aberto") throw new HttpError(400, "esta conta não está em aberto");
  return { contaId: c.id, pedidoId: null, unidadeId: c.unidade_id, descricao: c.descricao, valor: Number(c.valor), cliente: um(c.cliente) };
}

/** O que falta pagar do pedido: todas as parcelas em aberto (com uma só, o link fica ligado também à conta). */
async function alvoPedido(db: SupabaseClient, pedidoId: string): Promise<Alvo> {
  if (!UUID.test(pedidoId)) throw new HttpError(400, "pedido inválido");
  const { data: p } = await db.from("pedidos").select(`id, numero, status, unidade_id, ${CLIENTE}`).eq("id", pedidoId).maybeSingle();
  if (!p) throw new HttpError(404, "pedido não encontrado");
  if (!VENDA_APROVADA.includes(p.status)) throw new HttpError(400, "Aprove a venda antes de gerar o link de pagamento.");
  const { data: contas } = await db.from("contas_receber").select("id, valor").eq("pedido_id", p.id).eq("status", "aberto");
  if (!contas?.length) throw new HttpError(400, "Este pedido não tem parcela em aberto: já está pago.");
  const valor = Math.round(contas.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100;
  return {
    contaId: contas.length === 1 ? contas[0].id : null, pedidoId: p.id, unidadeId: p.unidade_id,
    descricao: `Pedido #${p.numero}${contas.length > 1 ? ` (${contas.length} parcelas)` : ""}`, valor, cliente: um(p.cliente),
  };
}

/** Página da proposta: só venda aprovada por Pix ou cartão, com o link ligado nas configurações
 *  (as outras formas o vendedor combina com o cliente). */
async function pagarProposta(db: SupabaseClient, token: string) {
  if (!UUID.test(token)) throw new HttpError(400, "link inválido");
  const { data: p } = await db.from("pedidos").select("id, forma_pagamento, proposta_status").eq("proposta_token", token).maybeSingle();
  if (!p?.proposta_status) throw new HttpError(404, "proposta não encontrada");
  if (!MEIOS_LINK.includes(p.forma_pagamento ?? "")) throw new HttpError(400, "Esta venda não é paga por link: fale com o vendedor.");
  const { data: cfg } = await db.from("configuracoes").select("link_pagamento_ao_aprovar").eq("id", 1).maybeSingle();
  if (cfg?.link_pagamento_ao_aprovar === false) throw new HttpError(400, "O pagamento pelo link está desligado: fale com o vendedor.");
  return criarLink(db, await alvoPedido(db, p.id), null);
}

/** Área do cliente: conta do próprio cliente, em aberto, por Pix/cartão ou já vencida. */
async function pagarConta(db: SupabaseClient, token: string, contaId: string) {
  if (!UUID.test(token) || !UUID.test(contaId)) throw new HttpError(400, "link inválido");
  const { data: cli } = await db.from("clientes").select("id").eq("portal_token", token).maybeSingle();
  if (!cli) throw new HttpError(404, "link não encontrado");
  const { data: c } = await db.from("contas_receber").select("id, forma_pagamento, vencimento").eq("id", contaId).eq("cliente_id", cli.id).maybeSingle();
  if (!c) throw new HttpError(404, "conta não encontrada");
  if (!MEIOS_LINK.includes(c.forma_pagamento ?? "") && !(c.vencimento < hojeSP())) {
    throw new HttpError(400, "Esta conta não é paga por link: use o Pix ou fale com a gente.");
  }
  return criarLink(db, await alvoConta(db, c.id), null);
}

async function criarLink(db: SupabaseClient, a: Alvo, userId: string | null) {
  const campos = "id, nome, infinitepay_tag";
  let { data: u } = a.unidadeId ? await db.from("unidades").select(campos).eq("id", a.unidadeId).maybeSingle() : { data: null };
  if (!u) ({ data: u } = await db.from("unidades").select(campos).eq("matriz", true).limit(1).maybeSingle());
  if (!u?.infinitepay_tag) throw new HttpError(400, `Cadastre a InfiniteTag da ${u?.nome ?? "unidade"} em Configurações → Unidades.`);

  // já tem link aberto para o mesmo alvo, com o mesmo valor e a mesma conta InfinitePay: manda o mesmo
  const filtro = a.pedidoId
    ? [`pedido_id.eq.${a.pedidoId}`, ...(a.contaId ? [`conta_receber_id.eq.${a.contaId}`] : [])].join(",")
    : `conta_receber_id.eq.${a.contaId}`;
  const { data: abertos } = await db.from("cobrancas_link").select("id, url, valor, handle, conta_receber_id").eq("status", "aberto").or(filtro);
  const igual = abertos?.find((l) => l.url && l.handle === u.infinitepay_tag && Number(l.valor) === a.valor && (l.conta_receber_id ?? null) === a.contaId);
  if (igual) return { id: igual.id, url: igual.url, reaproveitado: true };
  if (abertos?.length) await db.from("cobrancas_link").update({ status: "descartado" }).in("id", abertos.map((l) => l.id));

  const { data: novo, error } = await db.from("cobrancas_link")
    .insert({ conta_receber_id: a.contaId, pedido_id: a.pedidoId, unidade_id: u.id, handle: u.infinitepay_tag, descricao: a.descricao, valor: a.valor, criado_por: userId })
    .select("id").single();
  if (error || !novo) throw new Error(error?.message ?? "não foi possível registrar o link");
  try {
    const url = await criarLinkInfinitePay(pedidoLink({
      handle: u.infinitepay_tag, id: novo.id, descricao: a.descricao, valor: a.valor, cliente: a.cliente,
      avisoUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/infinitepay`,
    }));
    await db.from("cobrancas_link").update({ url }).eq("id", novo.id);
    return { id: novo.id, url, reaproveitado: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("cobrancas_link").update({ status: "erro", erro: msg }).eq("id", novo.id);
    throw new HttpError(502, msg);
  }
}

async function aviso(db: SupabaseClient, body: Record<string, unknown>) {
  const a = lerAviso(body);
  // pedidos que não são do ERP (ex.: links criados no app): responde 200 para a InfinitePay não insistir
  if (!a) return json({ ok: true, ignorado: "pedido de fora do ERP" });
  const { data: l } = await db.from("cobrancas_link").select("id, handle, status, valor").eq("id", a.id).maybeSingle();
  if (!l) return json({ ok: true, ignorado: "link não encontrado" });
  if (l.status === "pago") return json({ ok: true, ja_registrado: true });
  if (!a.nsu || !a.slug) return json({ error: "aviso sem número da transação" }, 400);

  // o aviso não vem assinado: só vale o que a InfinitePay confirmar
  const ok = await conferirPagamento({ handle: l.handle, id: l.id, nsu: a.nsu, slug: a.slug });
  const esperado = centavos(Number(l.valor));
  if (!ok.pago || (ok.valor !== null && ok.valor < esperado)) {
    await db.from("cobrancas_link").update({
      aviso: body, erro: ok.pago ? "A InfinitePay confirmou um valor menor que o do link: confira antes de dar baixa." : "Aviso recebido, mas a InfinitePay ainda não confirma o pagamento.",
    }).eq("id", l.id);
    return json({ error: "pagamento não confirmado" }, 400);
  }
  const { data: r, error } = await db.rpc("confirmar_cobranca_link", {
    p_id: l.id, p_nsu: a.nsu, p_slug: a.slug, p_metodo: ok.metodo ?? a.metodo, p_parcelas: ok.parcelas ?? a.parcelas,
    p_valor_pago: (ok.pagoValor ?? a.pago ?? esperado) / 100, p_recibo: a.recibo, p_aviso: body,
  });
  if (error) throw new Error(error.message);
  return json({ ok: true, resultado: r });
}
