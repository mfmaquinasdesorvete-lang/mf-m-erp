// Envio de e-mail: pela API do Resend (https://resend.com) quando os secrets existem, ou pelo SMTP da
// conta de e-mail cadastrada no ERP (Caixa de e-mail), sem precisar de secret.
// Secrets do Resend: RESEND_API_KEY e EMAIL_REMETENTE (ex.: "MF Máquinas <avisos@mfmaquinas.com.br>",
// com o domínio verificado no Resend).
import nodemailer from "npm:nodemailer@6.9.16";
import { adminClient } from "./supabase.ts";

export type Email = {
  para: string; assunto: string; html: string; texto: string;
  responderPara?: string | null; descadastro?: string; idempotencia?: string;
  anexos?: { nome: string; base64: string }[];
};

export const resendConfigurado = () => !!(Deno.env.get("RESEND_API_KEY") && Deno.env.get("EMAIL_REMETENTE"));

/** Conta de e-mail do ERP que pode enviar (ativa e com SMTP); prefere a do comercial. */
export async function contaSmtp() {
  const { data } = await adminClient().from("email_contas").select("id, nome, email, smtp_host, smtp_porta, usuario, senha, papeis")
    .eq("ativo", true).not("smtp_host", "is", null).order("created_at");
  const contas = (data ?? []).filter((c: any) => String(c.smtp_host ?? "").trim());
  return contas.find((c: any) => (c.papeis ?? []).includes("vendas")) ?? contas[0] ?? null;
}

/** Há algum meio de enviar (Resend ou conta SMTP)? */
export async function envioConfigurado() {
  return resendConfigurado() || !!(await contaSmtp());
}

export async function enviarEmail(m: Email) {
  if (resendConfigurado()) return await enviarResend(m);
  const conta = await contaSmtp();
  if (!conta) {
    throw new Error("para enviar e-mails, ligue a caixa de e-mail da empresa (com servidor de envio SMTP) em Configurações → Caixa de e-mail → \"Ligar uma caixa de e-mail\", " +
      "ou defina os secrets RESEND_API_KEY e EMAIL_REMETENTE no Supabase");
  }
  const porta = Number(conta.smtp_porta) || 465;
  const t = nodemailer.createTransport({ host: conta.smtp_host, port: porta, secure: porta === 465, auth: { user: conta.usuario, pass: conta.senha } });
  try {
    const r = await t.sendMail({
      from: `${conta.nome} <${conta.email}>`, to: m.para, subject: m.assunto, html: m.html, text: m.texto,
      replyTo: m.responderPara || undefined,
      headers: m.descadastro ? { "List-Unsubscribe": `<${m.descadastro}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
      attachments: m.anexos?.map((a) => ({ filename: a.nome, content: a.base64, encoding: "base64" })),
    });
    return { id: String(r.messageId ?? "") };
  } catch (e) {
    throw new Error(`e-mail (conta ${conta.email}): ${(e as Error).message}`);
  }
}

async function enviarResend(m: Email) {
  const chave = Deno.env.get("RESEND_API_KEY")!;
  const de = Deno.env.get("EMAIL_REMETENTE")!;
  const headers: Record<string, string> = {};
  if (m.descadastro) {
    headers["List-Unsubscribe"] = `<${m.descadastro}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      ...(m.idempotencia ? { "Idempotency-Key": m.idempotencia } : {}),
    },
    body: JSON.stringify({
      from: de,
      to: [m.para],
      subject: m.assunto,
      html: m.html,
      text: m.texto,
      reply_to: m.responderPara || undefined,
      headers,
      ...(m.anexos?.length ? { attachments: m.anexos.map((a) => ({ filename: a.nome, content: a.base64 })) } : {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`e-mail: ${j.message ?? j.error ?? r.statusText}`);
  return j as { id: string };
}
