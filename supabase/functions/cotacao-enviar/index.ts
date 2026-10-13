// Envia o pedido de cotação por e-mail aos fornecedores: cada um recebe o seu link para responder os preços
// online (/cotacao/<código>), sem login. Marca como enviada com o login de quem mandou.
// POST { cotacao_id, fornecedores?: string[] (ids de cotacao_fornecedores; vazio = todos os pendentes), mensagem? }
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { enviarEmail } from "../_shared/email.ts";
import { enderecoSite } from "../_shared/site.ts";
import { createClient } from "npm:@supabase/supabase-js@2.86.0";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// cor da marca (Configurações) como fundo de texto branco: só #rrggbb, escurecida até o contraste 4,5:1
function corLegivel(hex: string | null | undefined) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim()) ?? ["", "0ea5e9"];
  let rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const contraste = () => 1.05 / (0.2126 * lum(rgb[0]) + 0.7152 * lum(rgb[1]) + 0.0722 * lum(rgb[2]) + 0.05);
  for (let i = 0; i < 40 && contraste() < 4.5; i++) rgb = rgb.map((v) => Math.floor(v * 0.95));
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req, ["financeiro", "tecnico"]);
    const { cotacao_id, fornecedores, mensagem } = await req.json();
    const db = adminClient();
    const { data: c } = await db.from("cotacoes").select("*").eq("id", cotacao_id).single();
    if (!c) throw new HttpError(404, "cotação não encontrada");
    if (c.status === "encerrada" || c.status === "cancelada") throw new HttpError(400, "esta cotação já foi encerrada");
    let q = db.from("cotacao_fornecedores").select("id, token, email, status, fornecedor:fornecedores(nome, nome_fantasia, email)").eq("cotacao_id", cotacao_id);
    if (Array.isArray(fornecedores) && fornecedores.length) q = q.in("id", fornecedores);
    const { data: lista } = await q;
    const alvos = (lista ?? []).filter((x: any) => (Array.isArray(fornecedores) && fornecedores.length) || x.status === "pendente");
    if (!alvos.length) throw new HttpError(400, "nenhum fornecedor para enviar");
    const { count: nItens } = await db.from("cotacao_itens").select("id", { count: "exact", head: true }).eq("cotacao_id", cotacao_id);

    const { data: cfg } = await db.from("configuracoes").select("nome_fantasia, razao_social, whatsapp, email, proposta_cor, site_url").eq("id", 1).single();
    const empresa = cfg?.nome_fantasia || cfg?.razao_social || "MF Máquinas";
    const cor = corLegivel(cfg?.proposta_cor);
    const site = enderecoSite(cfg?.site_url);
    if (!site) throw new HttpError(500, "informe o Endereço do site em Configurações (ex.: https://erp.myfrost.ai)");
    const prazo = c.prazo_resposta ? new Date(c.prazo_resposta + "T12:00:00").toLocaleDateString("pt-BR") : "";

    const enviados: string[] = [], semEmail: string[] = [], falhas: string[] = [];
    for (const x of alvos as any[]) {
      const nome = x.fornecedor?.nome_fantasia || x.fornecedor?.nome || "fornecedor";
      const para = String(x.email || x.fornecedor?.email || "").split(/[;,\s]+/).find((e: string) => EMAIL.test(e));
      if (!para) { semEmail.push(nome); continue; }
      const link = `${site}/cotacao/${x.token}`;
      const corpo = mensagem || `Gostaríamos de receber o seu orçamento para ${nItens ?? "os"} ${nItens === 1 ? "item" : "itens"} da cotação nº ${c.numero}.`;
      const texto = [`Olá, ${nome}!`, "", corpo, "", `Informe os preços e o prazo por este link (não precisa de login): ${link}`,
        prazo ? `Prazo para resposta: ${prazo}.` : "", "", empresa].join("\n");
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
        <div style="background:${cor};color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${esc(empresa)} · cotação nº ${c.numero}</div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:22px;border-radius:0 0 12px 12px">
          <p>Olá, ${esc(nome)}!</p>
          <p>${esc(corpo).replace(/\n/g, "<br>")}</p>
          <p style="text-align:center;margin:26px 0"><a href="${link}" style="background:${cor};color:#fff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:bold;display:inline-block">Informar os preços</a></p>
          ${prazo ? `<p style="color:#64748b;font-size:13px">Prazo para resposta: ${prazo}. Não precisa de login: é só abrir o link.</p>` : ""}
          <p style="color:#64748b;font-size:13px">${esc(empresa)}${cfg?.whatsapp ? ` · WhatsApp ${esc(cfg.whatsapp)}` : ""}</p>
        </div></div>`;
      try {
        await enviarEmail({ para, assunto: `Cotação nº ${c.numero} - ${empresa}`, html, texto, responderPara: cfg?.email || null, idempotencia: `cotacao-${x.id}-${Date.now()}` });
        enviados.push(x.id);
      } catch (e) {
        falhas.push(`${nome}: ${(e as Error).message}`);
      }
    }
    if (enviados.length) {
      const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false } });
      const { error } = await comoUsuario.rpc("cotacao_marcar_enviada", { p_ids: enviados });
      if (error) throw new HttpError(400, error.message);
    }
    if (!enviados.length && falhas.length) throw new HttpError(502, falhas[0]);
    return json({ ok: true, enviados: enviados.length, sem_email: semEmail, falhas });
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500);
  }
});
