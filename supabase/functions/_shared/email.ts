// Envio de e-mail pela API do Resend (https://resend.com).
// Secrets: RESEND_API_KEY e EMAIL_REMETENTE (ex.: "MF Máquinas <avisos@mfmaquinas.com.br>",
// com o domínio verificado no Resend).
export async function enviarEmail(m: {
  para: string; assunto: string; html: string; texto: string;
  responderPara?: string | null; descadastro?: string; idempotencia?: string;
  anexos?: { nome: string; base64: string }[];
}) {
  const chave = Deno.env.get("RESEND_API_KEY");
  const de = Deno.env.get("EMAIL_REMETENTE");
  if (!chave || !de) throw new Error("defina os secrets RESEND_API_KEY e EMAIL_REMETENTE no Supabase");
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
