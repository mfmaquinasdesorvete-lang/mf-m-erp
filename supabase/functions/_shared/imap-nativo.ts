// Cliente IMAP mínimo sobre a conexão TLS nativa do Deno (Deno.connectTls), para o que a caixa de e-mail do ERP
// precisa: entrar, abrir a INBOX, buscar mensagens inteiras por UID ou por posição e sair. A biblioteca ImapFlow
// perde a conexão logo depois do TLS no runtime das Edge Functions ("Unexpected close"); a conexão nativa funciona.

export type Conexao = { read(p: Uint8Array): Promise<number | null>; write(p: Uint8Array): Promise<number>; close(): void };
export type Abrir = (host: string, porta: number) => Promise<Conexao>;

export type Resposta = { status: "OK" | "NO" | "BAD"; texto: string; linhas: { linha: string; literais: Uint8Array[] }[] };
export type Mensagem = { uid: number; source: Uint8Array };

export class ErroImap extends Error {
  code: string;
  authenticationFailed?: boolean;
  responseText?: string;
  constructor(mensagem: string, code: string, extra: { authenticationFailed?: boolean; responseText?: string } = {}) {
    super(mensagem);
    this.code = code;
    Object.assign(this, extra);
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const abrirTls: Abrir = (host, porta) => Deno.connectTls({ hostname: host, port: porta });

/** Texto entre aspas como o IMAP pede (só para ASCII sem quebra de linha). */
const aspas = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const base64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };

export class ImapNativo {
  private conn: Conexao | null = null;
  private buf = new Uint8Array(0);
  private seq = 0;
  capacidades = new Set<string>();
  caixa = { exists: 0, uidValidity: 0 };

  constructor(private host: string, private porta: number, private abrir: Abrir = abrirTls, private timeoutMs = 30_000) {}

  /** Lê o próximo pedaço da conexão (null quando o servidor fechou). */
  private async pedaco(): Promise<Uint8Array | null> {
    const p = new Uint8Array(64 * 1024);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const n = await Promise.race([
      this.conn!.read(p),
      new Promise<never>((_, r) => { timer = setTimeout(() => r(new ErroImap(`o servidor ${this.host} parou de responder`, "ETIMEDOUT")), this.timeoutMs); }),
    ]).finally(() => clearTimeout(timer));
    return n === null ? null : p.subarray(0, n);
  }

  private async ler(): Promise<boolean> {
    const p = await this.pedaco();
    if (!p) return false;
    const novo = new Uint8Array(this.buf.length + p.length);
    novo.set(this.buf);
    novo.set(p, this.buf.length);
    this.buf = novo;
    return true;
  }

  /** Os próximos `tam` bytes (o conteúdo de um literal), sem copiar o buffer inteiro a cada pedaço. */
  private async lerBytes(tam: number): Promise<Uint8Array> {
    const out = new Uint8Array(tam);
    let n = Math.min(tam, this.buf.length);
    out.set(this.buf.subarray(0, n));
    this.buf = this.buf.subarray(n);
    while (n < tam) {
      const p = await this.pedaco();
      if (!p) throw new ErroImap("Unexpected close", "ClosedByServer");
      const usar = Math.min(p.length, tam - n);
      out.set(p.subarray(0, usar), n);
      n += usar;
      if (usar < p.length) this.buf = p.slice(usar);
    }
    return out;
  }

  /** Uma linha da resposta (sem o CRLF) e os literais {n} que vêm dentro dela. */
  private async proximaLinha(): Promise<{ linha: string; literais: Uint8Array[] }> {
    let linha = "";
    const literais: Uint8Array[] = [];
    let desde = 0;
    for (;;) {
      let fim = -1;
      for (let i = desde; i + 1 < this.buf.length; i++) if (this.buf[i] === 13 && this.buf[i + 1] === 10) { fim = i; break; }
      if (fim < 0) {
        desde = Math.max(0, this.buf.length - 1);
        if (!(await this.ler())) throw new ErroImap("Unexpected close", "ClosedByServer");
        continue;
      }
      const parte = dec.decode(this.buf.subarray(0, fim));
      this.buf = this.buf.subarray(fim + 2);
      desde = 0;
      const lit = parte.match(/\{(\d+)\+?\}$/);
      if (!lit) return { linha: linha + parte, literais };
      literais.push(await this.lerBytes(Number(lit[1])));
      linha += parte + "\u0000"; // marca onde estava o literal
    }
  }

  private async escrever(texto: string) {
    const dados = enc.encode(texto);
    let enviado = 0;
    while (enviado < dados.length) enviado += await this.conn!.write(dados.subarray(enviado));
  }

  /** Manda um comando e junta as respostas até a linha com a etiqueta. */
  async comando(cmd: string): Promise<Resposta> {
    const tag = `A${++this.seq}`;
    await this.escrever(`${tag} ${cmd}\r\n`);
    const linhas: Resposta["linhas"] = [];
    for (;;) {
      const l = await this.proximaLinha();
      if (l.linha.startsWith(`${tag} `)) {
        const [, status, texto] = l.linha.match(/^\S+ (OK|NO|BAD)\s?(.*)$/) ?? [null, "BAD", l.linha];
        return { status: status as Resposta["status"], texto, linhas };
      }
      linhas.push(l);
    }
  }

  async conectar() {
    try {
      this.conn = await this.abrir(this.host, this.porta);
    } catch (e) {
      const m = (e as Error).message;
      throw new ErroImap(m, /refused/i.test(m) ? "ECONNREFUSED" : /lookup|dns|resolve|not known/i.test(m) ? "ENOTFOUND" : /certificate|tls|handshake/i.test(m) ? "ETLS" : "ESOCKET");
    }
    const saudacao = await this.proximaLinha();
    if (!/^\* (OK|PREAUTH)/i.test(saudacao.linha)) throw new ErroImap(`saudação inesperada: ${saudacao.linha.slice(0, 120)}`, "InvalidGreeting", { responseText: saudacao.linha });
    this.lerCapacidades(saudacao.linha);
    if (!this.capacidades.size) {
      const r = await this.comando("CAPABILITY");
      for (const l of r.linhas) this.lerCapacidades(l.linha);
    }
  }

  private lerCapacidades(linha: string) {
    const m = linha.match(/\[CAPABILITY ([^\]]+)\]/i) ?? linha.match(/^\* CAPABILITY (.+)$/i);
    if (m) this.capacidades = new Set(m[1].toUpperCase().split(/\s+/));
  }

  async entrar(usuario: string, senha: string) {
    const r = this.capacidades.has("AUTH=PLAIN") && this.capacidades.has("SASL-IR")
      ? await this.comando(`AUTHENTICATE PLAIN ${base64(enc.encode(`\u0000${usuario}\u0000${senha}`))}`)
      : /^[\x20-\x7e]*$/.test(usuario + senha)
        ? await this.comando(`LOGIN ${aspas(usuario)} ${aspas(senha)}`)
        : await this.comando(`AUTHENTICATE PLAIN ${base64(enc.encode(`\u0000${usuario}\u0000${senha}`))}`);
    if (r.status !== "OK") throw new ErroImap("Authentication failed", "AUTHENTICATIONFAILED", { authenticationFailed: true, responseText: r.texto });
  }

  async abrirCaixa(nome = "INBOX") {
    const r = await this.comando(`SELECT ${aspas(nome)}`);
    if (r.status !== "OK") throw new ErroImap(`não consegui abrir a caixa ${nome}: ${r.texto}`, "SelectFailed", { responseText: r.texto });
    for (const { linha } of r.linhas) {
      const ex = linha.match(/^\* (\d+) EXISTS/i);
      if (ex) this.caixa.exists = Number(ex[1]);
      const uv = linha.match(/\[UIDVALIDITY (\d+)\]/i);
      if (uv) this.caixa.uidValidity = Number(uv[1]);
    }
    return this.caixa;
  }

  /** UIDs a partir de um número (em ordem), para buscar os e-mails novos aos poucos. */
  async uidsDesde(uid: number): Promise<number[]> {
    const r = await this.comando(`UID SEARCH UID ${Math.max(1, uid)}:*`);
    if (r.status !== "OK") throw new ErroImap(`não consegui listar os e-mails: ${r.texto}`, "SearchFailed", { responseText: r.texto });
    const uids = r.linhas.filter((l) => /^\* SEARCH/i.test(l.linha)).flatMap((l) => l.linha.replace(/^\* SEARCH/i, "").trim().split(/\s+/))
      .map(Number).filter((n) => n >= uid);
    return [...new Set(uids)].sort((a, b) => a - b);
  }

  /** Mensagens inteiras (o e-mail original) de um intervalo, por UID ou pela posição na caixa. */
  async buscar(intervalo: string, porUid: boolean): Promise<Mensagem[]> {
    const r = await this.comando(`${porUid ? "UID " : ""}FETCH ${intervalo} (UID BODY.PEEK[])`);
    if (r.status !== "OK") throw new ErroImap(`não consegui buscar os e-mails: ${r.texto}`, "FetchFailed", { responseText: r.texto });
    const out: Mensagem[] = [];
    for (const { linha, literais } of r.linhas) {
      if (!/^\* \d+ FETCH/i.test(linha) || !literais.length) continue;
      const uid = Number(linha.match(/UID (\d+)/i)?.[1] ?? 0);
      if (uid) out.push({ uid, source: literais[literais.length - 1] });
    }
    return out;
  }

  async sair() {
    try { if (this.conn) await this.comando("LOGOUT"); } catch { /* já fechada */ }
    this.fechar();
  }

  fechar() {
    try { this.conn?.close(); } catch { /* já fechada */ }
    this.conn = null;
  }
}
