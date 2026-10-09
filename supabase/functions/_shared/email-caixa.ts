// Caixa de entrada: lê a caixa por IMAP e responde por SMTP (contas em public.email_contas).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { simpleParser } from "npm:mailparser@3.7.2";
import nodemailer from "npm:nodemailer@6.9.16";
import tls from "node:tls";
import { Buffer } from "node:buffer";
import { ErroImap, ImapNativo } from "./imap-nativo.ts";

export type Conta = {
  id: string; nome: string; email: string; imap_host: string; imap_porta: number; smtp_host: string | null; smtp_porta: number;
  usuario: string; senha: string; papeis: string[]; ultimo_uid: number; uid_validade: number | null;
};

const LOTE = 50;

/** Leitura da caixa por IMAP com SSL (porta 993). A ImapFlow perde a conexão com a Hostinger no runtime do Supabase. */
export function imap(c: Pick<Conta, "imap_host" | "imap_porta">) {
  const porta = Number(c.imap_porta) || 993;
  if (porta === 143) throw new ErroImap("a porta 143 (sem SSL) não é aceita: use a 993", "ETLS");
  return new ImapNativo(c.imap_host, porta);
}

/** Testa a leitura (IMAP), usado ao salvar a conta. */
export async function testarConta(c: Pick<Conta, "imap_host" | "imap_porta" | "usuario" | "senha">) {
  const cli = imap(c);
  try {
    await cli.conectar();
    await cli.entrar(c.usuario, c.senha);
  } finally {
    await cli.sair();
  }
}

export function smtp(c: Pick<Conta, "smtp_host" | "smtp_porta" | "usuario" | "senha">) {
  const porta = Number(c.smtp_porta) || 465;
  return nodemailer.createTransport({
    host: c.smtp_host!, port: porta, secure: porta === 465, auth: { user: c.usuario, pass: c.senha },
    connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 30_000,
  });
}

/** Testa o envio (SMTP): conecta e faz login, sem mandar nada. */
export async function testarSmtp(c: Pick<Conta, "smtp_host" | "smtp_porta" | "usuario" | "senha">) {
  const t = smtp(c);
  try { await t.verify(); } finally { t.close(); }
}

/** Servidores que recebem os e-mails do domínio (registro MX); vazio se não der para consultar. */
export async function mxDoDominio(dominio: string): Promise<string[]> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dominio)) return [];
  try {
    const r = await Deno.resolveDns(dominio, "MX");
    return r.map((x) => x.exchange);
  } catch { /* sem DNS no runtime: tenta pelo DNS do Google */ }
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(dominio)}&type=MX`, { signal: AbortSignal.timeout(4000) });
    const j = await res.json();
    return (j.Answer ?? []).map((a: { data: string }) => String(a.data).split(" ").pop() ?? "");
  } catch { return []; }
}

const ehNfe = (nome: string, conteudo: Uint8Array) =>
  /\.xml$/i.test(nome) && new TextDecoder().decode(conteudo.slice(0, 4000)).includes("infNFe");

/** Busca os e-mails novos de uma conta e grava em public.emails. Devolve quantos chegaram. */
export async function sincronizarConta(db: SupabaseClient, conta: Conta) {
  const cli = imap(conta);
  let novos = 0;
  const resumo: { de: string; assunto: string }[] = [];
  try {
    await cli.conectar();
    await cli.entrar(conta.usuario, conta.senha);
    const caixa = await cli.abrirCaixa("INBOX");
    const validade = caixa.uidValidity;
    let ultimo = Number(conta.ultimo_uid) || 0;
    if (conta.uid_validade && Number(conta.uid_validade) !== validade) ultimo = 0; // a caixa foi recriada no servidor
    const primeiraVez = ultimo === 0;
    if (!caixa.exists) {
      await db.from("email_contas").update({ uid_validade: validade, sincronizado_em: new Date().toISOString(), erro: null }).eq("id", conta.id);
      await cli.sair();
      return 0;
    }
    // primeira vez: os últimos LOTE e-mails; depois: os próximos LOTE UIDs depois do último lido
    const lidos = primeiraVez
      ? await cli.buscar(`${Math.max(1, caixa.exists - LOTE + 1)}:*`, false)
      : await (async () => {
        const uids = (await cli.uidsDesde(ultimo + 1)).slice(0, LOTE);
        return uids.length ? await cli.buscar(uids.join(","), true) : [];
      })();
    const mensagens = lidos.filter((m) => m.uid > ultimo).sort((a, b) => a.uid - b.uid).slice(0, LOTE);
    await cli.sair();

    // clientes e fornecedores pelo e-mail do remetente
    const [{ data: clientes }, { data: fornecedores }] = await Promise.all([
      db.from("clientes").select("id, email").not("email", "is", null),
      db.from("fornecedores").select("id, email").not("email", "is", null),
    ]);
    const porEmail = (lista: { id: string; email: string }[] | null, e: string) =>
      (lista ?? []).find((x) => x.email?.trim().toLowerCase() === e)?.id ?? null;

    for (const m of mensagens) {
      const p = await simpleParser(Buffer.from(m.source));
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
  } catch (e) {
    await db.from("email_contas").update({ erro: (e as Error).message.slice(0, 300) }).eq("id", conta.id);
    cli.fechar();
    throw e;
  }
  return novos;
}

/** Baixa um anexo de um e-mail já sincronizado. */
export async function baixarAnexo(conta: Conta, uid: number, indice: number) {
  const cli = imap(conta);
  let m;
  try {
    await cli.conectar();
    await cli.entrar(conta.usuario, conta.senha);
    await cli.abrirCaixa("INBOX");
    [m] = await cli.buscar(String(uid), true);
  } finally {
    await cli.sair();
  }
  if (!m) throw new Error("e-mail não encontrado no servidor (pode ter sido apagado)");
  const p = await simpleParser(Buffer.from(m.source));
  const a = (p.attachments ?? [])[indice];
  if (!a) throw new Error("anexo não encontrado");
  return { nome: a.filename ?? `anexo-${indice + 1}`, tipo: a.contentType, conteudo: a.content as Uint8Array };
}

/** Envia (ou responde) pelo SMTP da própria conta, para a resposta sair do mesmo endereço. */
export async function enviarPelaConta(conta: Conta, m: { para: string; assunto: string; texto: string; responderA?: string | null }) {
  if (!conta.smtp_host) throw new Error(`a conta ${conta.nome} não tem servidor de envio (SMTP) configurado`);
  const t = smtp(conta);
  await t.sendMail({
    from: `${conta.nome} <${conta.email}>`, to: m.para, subject: m.assunto, text: m.texto,
    ...(m.responderA ? { inReplyTo: m.responderA, references: m.responderA } : {}),
  });
}

/** Diagnóstico de rede (sem login): abre a conexão segura com o servidor e lê a saudação, pelo Deno e pelo node:tls. */
export async function sondarServidor(host: string, porta: number) {
  const ate = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error(`sem resposta em ${ms} ms`)), ms))]);
  const deno = await (async () => {
    const t0 = Date.now();
    let conn: Deno.TlsConn | null = null;
    try {
      conn = await ate(Deno.connectTls({ hostname: host, port: porta }), 10_000);
      const buf = new Uint8Array(512);
      const n = await ate(conn.read(buf), 10_000);
      return { ok: n !== null && n > 0, saudacao: n ? new TextDecoder().decode(buf.subarray(0, n)).split("\r\n")[0].slice(0, 120) : "(fechou sem enviar nada)", ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, erro: String((e as Error).message).slice(0, 200), ms: Date.now() - t0 };
    } finally { try { conn?.close(); } catch { /* já fechada */ } }
  })();
  const node = await new Promise<Record<string, unknown>>((resolve) => {
    const t0 = Date.now();
    const eventos: string[] = [];
    let fim = false;
    const acabar = (r: Record<string, unknown>) => { if (fim) return; fim = true; clearTimeout(timer); try { s.destroy(); } catch { /* ok */ } resolve({ ...r, eventos, ms: Date.now() - t0 }); };
    const s = tls.connect({ host, port: porta, servername: host }, () => eventos.push("secureConnect"));
    const timer = setTimeout(() => acabar({ ok: false, erro: "sem saudação em 10 s" }), 10_000);
    s.on("data", (d: Uint8Array) => acabar({ ok: true, saudacao: new TextDecoder().decode(d).split("\r\n")[0].slice(0, 120) }));
    for (const ev of ["end", "close", "timeout"]) s.on(ev, () => { eventos.push(ev); if (ev !== "timeout") acabar({ ok: false, erro: `conexão terminou (${ev})` }); });
    s.on("error", (e: Error) => acabar({ ok: false, erro: e.message.slice(0, 200) }));
  });
  // como o ERP usa a conexão (leitura IMAP / envio nodemailer), com um usuário inexistente: o esperado é "senha recusada"
  const biblioteca = await (async () => {
    const t0 = Date.now();
    const falso = { usuario: "diagnostico-erp@example.com", senha: "senha-invalida-diagnostico" };
    try {
      if (porta === 993) await testarConta({ imap_host: host, imap_porta: porta, ...falso });
      else await testarSmtp({ smtp_host: host, smtp_porta: porta, ...falso });
      return { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      const x = e as { code?: string; message?: string; authenticationFailed?: boolean; responseText?: string; response?: string };
      return { ok: false, code: x.code ?? null, auth: x.authenticationFailed ?? null, erro: String(x.message ?? e).slice(0, 160),
        resposta: String(x.responseText ?? x.response ?? "").slice(0, 160), ms: Date.now() - t0 };
    }
  })();
  return { host, porta, deno, node, biblioteca };
}
