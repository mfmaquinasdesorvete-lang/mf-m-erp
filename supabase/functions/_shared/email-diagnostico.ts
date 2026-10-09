// Caixa de e-mail: qual provedor atende o domínio (pelo registro MX), os servidores certos de cada um e o motivo,
// em português, de uma conexão recusada (senha, servidor, porta ou SSL). Código puro: usado pela Edge Function
// e pela tela Configurações → Caixa de e-mail.

export type Provedor = {
  id: string; nome: string; imap: string; imap_porta: number; smtp: string; smtp_porta: number;
  /** O que fazer para a senha funcionar (senha de app etc.). */
  dica: string;
};

const SENHA_DA_CAIXA = "Use a senha da conta de e-mail (a mesma do webmail), não a senha do painel do provedor.";

export const PROVEDORES: Provedor[] = [
  { id: "google", nome: "Google (Gmail / Google Workspace)", imap: "imap.gmail.com", imap_porta: 993, smtp: "smtp.gmail.com", smtp_porta: 465,
    dica: "O Google não aceita a senha normal: ligue a verificação em duas etapas na conta e crie uma senha de app em myaccount.google.com/apppasswords (16 letras). Use essa senha aqui." },
  { id: "microsoft", nome: "Microsoft (Outlook / Hotmail / 365)", imap: "outlook.office365.com", imap_porta: 993, smtp: "smtp.office365.com", smtp_porta: 587,
    dica: "A Microsoft desligou o acesso por senha (IMAP/SMTP) nas contas Outlook, Hotmail e 365. Ligue uma caixa de outro provedor (Gmail com senha de app ou Hostinger)." },
  { id: "hostinger", nome: "Hostinger", imap: "imap.hostinger.com", imap_porta: 993, smtp: "smtp.hostinger.com", smtp_porta: 465,
    dica: `${SENHA_DA_CAIXA} Na Hostinger: hPanel → E-mails → Contas de e-mail → Alterar senha.` },
  { id: "titan", nome: "Titan (e-mail da Hostinger)", imap: "imap.titan.email", imap_porta: 993, smtp: "smtp.titan.email", smtp_porta: 465, dica: SENHA_DA_CAIXA },
  { id: "zoho", nome: "Zoho Mail", imap: "imap.zoho.com", imap_porta: 993, smtp: "smtp.zoho.com", smtp_porta: 465,
    dica: "No Zoho, ligue o acesso IMAP (Configurações → Contas de e-mail → IMAP) e, se tiver verificação em duas etapas, use uma senha de aplicativo." },
  { id: "locaweb", nome: "Locaweb", imap: "email-ssl.com.br", imap_porta: 993, smtp: "email-ssl.com.br", smtp_porta: 465, dica: SENHA_DA_CAIXA },
  { id: "yahoo", nome: "Yahoo", imap: "imap.mail.yahoo.com", imap_porta: 993, smtp: "smtp.mail.yahoo.com", smtp_porta: 465,
    dica: "O Yahoo não aceita a senha normal: crie uma senha de app em Segurança da conta e use essa senha aqui." },
];

const por = (id: string) => PROVEDORES.find((p) => p.id === id)!;

/** Pelo que vem depois do @ (sem consultar a internet): só os e-mails gratuitos conhecidos. */
export function provedorPorDominio(dominio: string): Provedor | null {
  const d = dominio.trim().toLowerCase();
  if (/^(gmail|googlemail)\.com$/.test(d)) return por("google");
  if (/^(outlook|hotmail|live|msn)\.com(\.br)?$/.test(d)) return por("microsoft");
  if (/^yahoo\.com(\.br)?$/.test(d) || /^ymail\.com$/.test(d)) return por("yahoo");
  return null;
}

/** Pelo registro MX do domínio (quem recebe os e-mails de @empresa.com.br). */
export function provedorPorMx(mx: string[]): Provedor | null {
  const t = mx.map((m) => m.toLowerCase().replace(/\.$/, "")).join(" ");
  if (/google\.com|googlemail\.com/.test(t)) return por("google");
  if (/outlook\.com|office365|microsoft/.test(t)) return por("microsoft");
  if (/titan\.email/.test(t)) return por("titan");
  if (/hostinger/.test(t)) return por("hostinger");
  if (/zoho\./.test(t)) return por("zoho");
  if (/locaweb|email-ssl\.com\.br/.test(t)) return por("locaweb");
  if (/yahoodns|yahoo\.com/.test(t)) return por("yahoo");
  return null;
}

/** O servidor digitado é do provedor do domínio? (imap.gmail.com para Google, etc.) */
export function servidorDoProvedor(p: Provedor, host: string) {
  const h = host.trim().toLowerCase();
  const base = (s: string) => s.split(".").slice(-2).join(".");
  return h === p.imap || h === p.smtp || base(h) === base(p.imap) || base(h) === base(p.smtp);
}

/** O servidor do ERP (Supabase) bloqueia as portas 25 e 587; o envio sai pela 465 (SSL). */
export const portaSmtpBloqueada = (porta: number) => porta === 25 || porta === 587;

type ErroConexao = { message?: string; code?: string; responseText?: string; response?: string; authenticationFailed?: boolean; serverResponseCode?: string; responseCode?: number };

/** Resposta do servidor (sem quebras de linha), para mostrar junto da explicação. */
function respostaDoServidor(e: ErroConexao) {
  return String(e.responseText ?? e.response ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

/**
 * Explica por que a conexão falhou, já dizendo o que fazer. `etapa` é "imap" (ler os e-mails) ou "smtp" (enviar).
 * `provedor` é o do domínio do e-mail (pelo MX), quando conhecido.
 */
export function explicarErroEmail(err: unknown, ctx: { etapa: "imap" | "smtp"; host: string; porta: number; provedor?: Provedor | null }) {
  const e = (err ?? {}) as ErroConexao;
  const msg = String(e.message ?? err ?? "");
  const resp = respostaDoServidor(e);
  const tudo = `${msg} ${resp} ${e.code ?? ""} ${e.serverResponseCode ?? ""}`;
  const o = ctx.etapa === "imap" ? "servidor de entrada (IMAP)" : "servidor de envio (SMTP)";
  const p = ctx.provedor;
  const certo = p ? (ctx.etapa === "imap" ? `${p.imap}, porta ${p.imap_porta}` : `${p.smtp}, porta ${p.smtp_porta === 587 ? 465 : p.smtp_porta}`) : "";
  // o domínio é de um provedor e o servidor digitado é de outro: é a causa mais comum
  const outroServidor = p && ctx.host && !servidorDoProvedor(p, ctx.host)
    ? `O e-mail é do ${p.nome}, mas o ${o} informado é ${ctx.host}. Use ${certo}.` : "";

  let motivo: string;
  if (e.authenticationFailed || /AUTHENTICATIONFAILED|AUTHENTICATE failed|Invalid credentials|LOGIN failed|authentication failed|Username and Password not accepted|\b535\b|\bEAUTH\b|incorrect password|invalid login/i.test(tudo)) {
    if (/Application-specific password required|\b534\b.*5\.7\.9/i.test(tudo)) motivo = "O Google exige uma senha de app para esta conta.";
    else if (/Web login required|5\.7\.14|log in via your web browser/i.test(tudo)) motivo = "O Google bloqueou o acesso por segurança: entre no Gmail pelo navegador uma vez e use uma senha de app.";
    else motivo = "O servidor recusou o usuário ou a senha.";
    motivo += ` ${p?.dica ?? SENHA_DA_CAIXA}`;
  } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|failed to lookup|Name or service not known|dns error|No address associated/i.test(tudo)) {
    motivo = `O ${o} "${ctx.host}" não existe. Confira o endereço${certo ? ` (o certo é ${certo})` : ""}.`;
  } else if (ctx.etapa === "smtp" && portaSmtpBloqueada(ctx.porta)) {
    motivo = `A porta ${ctx.porta} é bloqueada no servidor do ERP. Use a porta 465 (SSL) para o envio.`;
  } else if (/ECONNREFUSED|Connection refused/i.test(tudo)) {
    motivo = `O ${o} ${ctx.host} recusou a conexão na porta ${ctx.porta}. ${ctx.etapa === "imap" ? "A leitura com SSL usa a porta 993." : "O envio com SSL usa a porta 465."}`;
  } else if (/wrong version number|InvalidContentType|ssl3_get_record|unknown protocol|tls|ssl|certificate|handshake/i.test(tudo)) {
    motivo = `A conexão segura (SSL) com ${ctx.host}:${ctx.porta} falhou. ${ctx.etapa === "imap" ? "Use a porta 993." : "Use a porta 465."}`;
  } else if (/ETIMEDOUT|ETIMEOUT|timed? ?out|Greeting never received|ESOCKET|ECONNRESET|connection closed|Unexpected close/i.test(tudo)) {
    motivo = `O ${o} ${ctx.host} não respondeu na porta ${ctx.porta}. Confira o endereço e a porta (${ctx.etapa === "imap" ? "993" : "465"} com SSL).`;
  } else {
    motivo = `Não foi possível conectar ao ${o} ${ctx.host}:${ctx.porta}.`;
  }
  const detalhe = resp || (msg && msg !== "Command failed" ? msg.slice(0, 180) : "");
  return [outroServidor, motivo, detalhe ? `Resposta do servidor: ${detalhe}` : ""].filter(Boolean).join(" ");
}
