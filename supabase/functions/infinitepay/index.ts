// Link de pagamento da InfinitePay (Pix ou cartão) para contas a receber.
//  POST { acao: "criar", conta_id }  → { id, url, reaproveitado }   (usuário do ERP: financeiro ou vendas)
//  POST { order_nsu, transaction_nsu, invoice_slug, ... }           (aviso da InfinitePay, sem login)
//       → confere o pagamento direto na InfinitePay e, se aprovado, dá baixa (confirmar_cobranca_link).
// Deploy com --no-verify-jwt: a InfinitePay não manda login; a criação confere o usuário aqui dentro.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { centavos, conferirPagamento, criarLinkInfinitePay, lerAviso, pedidoLink } from "../_shared/infinitepay.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "corpo inválido" }, 400);
  const db = adminClient();
  try {
    if (body.acao === "criar") {
      const { userId } = await requireErpUser(req, ["financeiro", "vendas"]);
      return json(await criar(db, String(body.conta_id ?? ""), userId));
    }
    if ("order_nsu" in body) return await aviso(db, body);
    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof HttpError ? e.status : 500);
  }
});

async function criar(db: SupabaseClient, contaId: string, userId: string) {
  if (!UUID.test(contaId)) throw new HttpError(400, "conta inválida");
  const { data: c } = await db.from("contas_receber")
    .select("id, descricao, valor, status, unidade_id, cliente:clientes(nome, email, whatsapp, telefone)").eq("id", contaId).maybeSingle();
  if (!c) throw new HttpError(404, "conta não encontrada");
  if (c.status !== "aberto") throw new HttpError(400, "esta conta não está em aberto");

  const campos = "id, nome, infinitepay_tag";
  let { data: u } = c.unidade_id ? await db.from("unidades").select(campos).eq("id", c.unidade_id).maybeSingle() : { data: null };
  if (!u) ({ data: u } = await db.from("unidades").select(campos).eq("matriz", true).limit(1).maybeSingle());
  if (!u?.infinitepay_tag) throw new HttpError(400, `Cadastre a InfiniteTag da ${u?.nome ?? "unidade"} em Configurações → Unidades.`);

  // já tem link aberto com o mesmo valor e a mesma conta InfinitePay: manda o mesmo
  const { data: abertos } = await db.from("cobrancas_link").select("id, url, valor, handle").eq("conta_receber_id", c.id).eq("status", "aberto");
  const igual = abertos?.find((l) => l.url && l.handle === u.infinitepay_tag && Number(l.valor) === Number(c.valor));
  if (igual) return { id: igual.id, url: igual.url, reaproveitado: true };
  if (abertos?.length) await db.from("cobrancas_link").update({ status: "descartado" }).in("id", abertos.map((l) => l.id));

  const { data: novo, error } = await db.from("cobrancas_link")
    .insert({ conta_receber_id: c.id, unidade_id: u.id, handle: u.infinitepay_tag, descricao: c.descricao, valor: c.valor, criado_por: userId })
    .select("id").single();
  if (error || !novo) throw new Error(error?.message ?? "não foi possível registrar o link");
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
  try {
    const url = await criarLinkInfinitePay(pedidoLink({
      handle: u.infinitepay_tag, id: novo.id, descricao: c.descricao, valor: Number(c.valor), cliente,
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
