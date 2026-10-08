// Caixa de entrada: lê a caixa por IMAP e responde por SMTP (contas em public.email_contas).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { ImapFlow } from "npm:imapflow@1.0.171";
import { simpleParser } from "npm:mailparser@3.7.2";
import nodemailer from "npm:nodemailer@6.9.16";

export type Conta = {
  id: string; nome: string; email: string; imap_host: string; imap_porta: number; smtp_host: string | null; smtp_porta: number;
  usuario: string; senha: string; papeis: string[]; ultimo_uid: number; uid_validade: number | null;
};

const LOTE = 50;

export function imap(c: Pick<Conta, "imap_host" | "imap_porta" | "usuario" | "senha">) {
  return new ImapFlow({
    host: c.imap_host, port: Number(c.imap_porta) || 993, secure: Number(c.imap_porta) !== 143,
    auth: { user: c.usuario, pass: c.senha }, logger: false, emitLogs: false,
  });
}

/** Testa o acesso (usado ao salvar a conta). */
export async function testarConta(c: Pick<Conta, "imap_host" | "imap_porta" | "usuario" | "senha">) {
  const cli = imap(c);
  await cli.connect();
  await cli.logout();
}

const ehNfe = (nome: string, conteudo: Uint8Array) =>
  /\.xml$/i.test(nome) && new TextDecoder().decode(conteudo.slice(0, 4000)).includes("infNFe");

/** Busca os e-mails novos de uma conta e grava em public.emails. Devolve quantos chegaram. */
export async function sincronizarConta(db: SupabaseClient, conta: Conta) {
  const cli = imap(conta);
  let novos = 0;
  const resumo: { de: string; assunto: string }[] = [];
  try {
    await cli.connect();
    const lock = await cli.getMailboxLock("INBOX");
    try {
      const caixa = cli.mailbox as { uidValidity: bigint | number; exists: number };
      const validade = Number(caixa.uidValidity);
      let ultimo = Number(conta.ultimo_uid) || 0;
      if (conta.uid_validade && Number(conta.uid_validade) !== validade) ultimo = 0; // a caixa foi recriada no servidor
      const primeiraVez = ultimo === 0;
      if (!caixa.exists) {
        await db.from("email_contas").update({ uid_validade: validade, sincronizado_em: new Date().toISOString(), erro: null }).eq("id", conta.id);
        return 0;
      }
      const intervalo = primeiraVez ? `${Math.max(1, caixa.exists - LOTE + 1)}:*` : `${ultimo + 1}:*`;
      const mensagens: { uid: number; source: Uint8Array }[] = [];
      for await (const m of cli.fetch(intervalo, { uid: true, source: true }, { uid: !primeiraVez })) {
        if (m.uid > ultimo && m.source) mensagens.push({ uid: m.uid, source: m.source as Uint8Array });
        if (mensagens.length >= LOTE) break;
      }

      // clientes e fornecedores pelo e-mail do remetente
      const [{ data: clientes }, { data: fornecedores }] = await Promise.all([
        db.from("clientes").select("id, email").not("email", "is", null),
        db.from("fornecedores").select("id, email").not("email", "is", null),
      ]);
      const porEmail = (lista: { id: string; email: string }[] | null, e: string) =>
        (lista ?? []).find((x) => x.email?.trim().toLowerCase() === e)?.id ?? null;

      for (const m of mensagens) {
        const p = await simpleParser(m.source);
        const de = p.from?.value?.[0];
        const deEmail = (de?.address ?? "").toLowerCase();
        const texto = (p.text ?? "").slice(0, 100_000);
        type Anexo = { indice: number; nome: string; tipo: string; tamanho: number; nfe: boolean };
        const anexos: Anexo[] = (p.attachments ?? []).map((a: any, i: number): Anexo => ({
          indice: i, nome: a.filename ?? `anexo-${i + 1}`, tipo: a.contentType, tamanho: a.size,
          nfe: ehNfe(a.filename ?? "", a.content as Uint8Array),
        })).filter((a: Anexo) => a.tipo !== "application/pkcs7-signature");
        const enderecos = (v: unknown) => [v].flat().filter(Boolean).map((x: any) => x.text).join(", ") || null;
        const { error } = await db.from("emails").upsert({
          conta_id: conta.id, uid: m.uid, message_id: p.messageId ?? null,
          de_nome: de?.name || null, de_email: deEmail || null, para: enderecos(p.to), cc: enderecos(p.cc),
          assunto: (p.subject ?? "(sem assunto)").slice(0, 500), data: (p.date ?? new Date()).toISOString(),
          previa: texto.replace(/\s+/g, " ").trim().slice(0, 220), texto, html: typeof p.html === "string" ? p.html.slice(0, 400_000) : null,
          anexos, cliente_id: porEmail(clientes, deEmail), fornecedor_id: porEmail(fornecedores, deEmail),
        }, { onConflict: "conta_id,uid", ignoreDuplicates: true });
        if (!error) {
          novos++;
          resumo.push({ de: de?.name || deEmail, assunto: p.subject ?? "" });
        }
        ultimo = Math.max(ultimo, m.uid);
      }

      await db.from("email_contas").update({
        ultimo_uid: ultimo, uid_validade: validade, sincronizado_em: new Date().toISOString(), erro: null,
      }).eq("id", conta.id);

      if (novos && !primeiraVez) {
        await db.rpc("notificar", {
          p_tipo: "email", p_titulo: novos === 1 ? `Novo e-mail em ${conta.nome}` : `${novos} e-mails novos em ${conta.nome}`,
          p_texto: resumo.slice(-2).map((r) => `${r.de}: ${r.assunto}`).join(" · ").slice(0, 300), p_link: "/email", p_papeis: conta.papeis,
        });
      }
    } finally {
      lock.release();
    }
    await cli.logout();
  } catch (e) {
    await db.from("email_contas").update({ erro: (e as Error).message.slice(0, 300) }).eq("id", conta.id);
    try { await cli.logout(); } catch { /* já desconectado */ }
    throw e;
  }
  return novos;
}

/** Baixa um anexo de um e-mail já sincronizado. */
export async function baixarAnexo(conta: Conta, uid: number, indice: number) {
  const cli = imap(conta);
  await cli.connect();
  const lock = await cli.getMailboxLock("INBOX");
  try {
    const m = await cli.fetchOne(String(uid), { source: true }, { uid: true });
    if (!m || !m.source) throw new Error("e-mail não encontrado no servidor (pode ter sido apagado)");
    const p = await simpleParser(m.source as Uint8Array);
    const a = (p.attachments ?? [])[indice];
    if (!a) throw new Error("anexo não encontrado");
    return { nome: a.filename ?? `anexo-${indice + 1}`, tipo: a.contentType, conteudo: a.content as Uint8Array };
  } finally {
    lock.release();
    await cli.logout();
  }
}

/** Envia (ou responde) pelo SMTP da própria conta, para a resposta sair do mesmo endereço. */
export async function enviarPelaConta(conta: Conta, m: { para: string; assunto: string; texto: string; responderA?: string | null }) {
  if (!conta.smtp_host) throw new Error(`a conta ${conta.nome} não tem servidor de envio (SMTP) configurado`);
  const porta = Number(conta.smtp_porta) || 465;
  const t = nodemailer.createTransport({ host: conta.smtp_host, port: porta, secure: porta === 465, auth: { user: conta.usuario, pass: conta.senha } });
  await t.sendMail({
    from: `${conta.nome} <${conta.email}>`, to: m.para, subject: m.assunto, text: m.texto,
    ...(m.responderA ? { inReplyTo: m.responderA, references: m.responderA } : {}),
  });
}
