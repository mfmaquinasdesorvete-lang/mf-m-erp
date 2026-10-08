// Envia a proposta comercial por e-mail: link para o cliente ver e aprovar/recusar, com o PDF anexado.
// POST { pedido_id, para?, mensagem?, pdf_base64? }
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { enviarEmail } from "../_shared/email.ts";
import { createClient } from "npm:@supabase/supabase-js@2.86.0";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req, ["vendas"]);
    const { pedido_id, para, mensagem, pdf_base64 } = await req.json();
    const db = adminClient();
    const { data: p } = await db.from("pedidos").select("*, cliente:clientes(nome, email), vend:vendedores(nome, email)").eq("id", pedido_id).single();
    if (!p) throw new HttpError(404, "pedido não encontrado");
    const destino = String(para || p.cliente?.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) throw new HttpError(400, "informe o e-mail do cliente");
    if (pdf_base64 && pdf_base64.length > 8_000_000) throw new HttpError(400, "PDF grande demais");

    // marca como enviada com o login de quem enviou (confere papel e situação do pedido)
    const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false } });
    const { data: token, error } = await comoUsuario.rpc("marcar_proposta_enviada", { p_pedido: pedido_id });
    if (error) throw new HttpError(400, error.message);

    const { data: cfg } = await db.from("configuracoes").select("nome_fantasia, razao_social, whatsapp, email, proposta_titulo, proposta_cor, validade_orcamento_dias").eq("id", 1).single();
    const { data: atual } = await db.from("pedidos").select("proposta_validade").eq("id", pedido_id).single();
    const empresa = cfg?.nome_fantasia || cfg?.razao_social || "MF Máquinas";
    const site = (Deno.env.get("ERP_SITE_URL") ?? "").replace(/\/$/, "");
    if (!site) throw new HttpError(500, "defina o secret ERP_SITE_URL (ex.: https://erp.myfrost.ai)");
    const link = `${site}/proposta/${token}`;
    const cor = cfg?.proposta_cor ?? "#0EA5E9";
    const validade = atual?.proposta_validade ? new Date(atual.proposta_validade + "T12:00:00").toLocaleDateString("pt-BR") : "";
    const nome = (p.cliente?.nome ?? "").split(" ")[0];
    const titulo = `${cfg?.proposta_titulo ?? "Proposta comercial"} nº ${p.numero} - ${empresa}`;
    const texto = [
      `Olá ${nome}!`, "", mensagem || `Segue a nossa proposta nº ${p.numero}, no valor de ${brl(p.valor_total)}.`, "",
      `Veja os detalhes e aprove com um clique: ${link}`, validade ? `Válida até ${validade}.` : "", "", empresa,
    ].join("\n");
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
      <div style="background:${cor};color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${esc(empresa)}</div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:22px;border-radius:0 0 12px 12px">
        <p>Olá ${esc(nome)}!</p>
        <p>${esc(mensagem || `Segue a nossa proposta nº ${p.numero}, no valor de ${brl(p.valor_total)}.`).replace(/\n/g, "<br>")}</p>
        <p style="text-align:center;margin:26px 0"><a href="${link}" style="background:${cor};color:#fff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:bold;display:inline-block">Ver e aprovar a proposta</a></p>
        ${validade ? `<p style="color:#64748b;font-size:13px">Proposta válida até ${validade}. O PDF vai em anexo.</p>` : ""}
        <p style="color:#64748b;font-size:13px">${esc(p.vend?.nome ?? p.vendedor ?? "")}${cfg?.whatsapp ? ` · WhatsApp ${esc(cfg.whatsapp)}` : ""}</p>
      </div></div>`;
    await enviarEmail({
      para: destino, assunto: titulo, html, texto, responderPara: p.vend?.email || cfg?.email || null, idempotencia: `proposta-${pedido_id}-${Date.now()}`,
      anexos: pdf_base64 ? [{ nome: `proposta-${p.numero}.pdf`, base64: pdf_base64 }] : [],
    });
    return json({ ok: true, link, para: destino });
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500);
  }
});
