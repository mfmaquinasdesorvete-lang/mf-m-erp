// Leitura do extrato bancário em OFX (Unicred, Nubank e a maioria dos bancos).
// Usado na tela (src/lib/extrato.ts) e no servidor (extrato que chega por e-mail): sem nada do Deno nem do navegador.
// Cada linha ganha um identificador estável, para o mesmo lançamento não entrar duas vezes ao importar de novo.

export type LinhaExtrato = { data: string; valor: number; descricao: string; documento?: string; identificador: string };
export type ResultadoOfx = {
  formato: "ofx";
  linhas: LinhaExtrato[];
  saldoFinal: number | null;
  saldoData: string | null;
  banco: string | null;
  conta: string | null;
};

/** O que o ERP fez com cada OFX que chegou por e-mail (coluna emails.extratos; ver extrato-email.ts). */
export type ExtratoEmail = {
  indice: number; nome: string; status: "importado" | "aguardando" | "erro"; motivo?: string;
  conta_id?: string | null; conta?: string | null; periodo?: [string, string];
  novas?: number; repetidas?: number; conciliadas?: number;
};

/** Texto do arquivo respeitando a codificação (bancos brasileiros ainda usam Windows-1252). */
export function decodificarExtrato(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 400));
  const declarado = /CHARSET:\s*1252|encoding="(windows-1252|iso-8859-1)"/i.test(inicio);
  if (declarado) return new TextDecoder("windows-1252").decode(bytes);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8.replace(/^\uFEFF/, "");
}

export const ehTextoOfx = (texto: string) => /<OFX>|OFXHEADER/i.test(texto);

const tag = (bloco: string, nome: string) => {
  const m = bloco.match(new RegExp(`<${nome}>\\s*([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
};
const dataOfx = (v: string) => (/^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : "");

export function numero(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/R\$|\s/g, "");
  if (!s) return NaN;
  const negativo = /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/[()]/g, "").replace(/-$/, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return negativo ? -Math.abs(n) : n;
}

export function lerOfx(texto: string): ResultadoOfx {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  const vistos = new Map<string, number>();
  const linhas: LinhaExtrato[] = [];
  for (const b of blocos) {
    const data = dataOfx(tag(b, "DTPOSTED"));
    const valor = Math.round(numero(tag(b, "TRNAMT")) * 100) / 100;
    if (!data || !Number.isFinite(valor) || valor === 0) continue;
    const nome = tag(b, "NAME"), memo = tag(b, "MEMO");
    const descricao = [nome, memo && memo !== nome ? memo : ""].filter(Boolean).join(" · ") || tag(b, "TRNTYPE");
    // alguns bancos repetem o FITID em lançamentos diferentes: numera as repetições
    const base = tag(b, "FITID") || `${data}|${valor}|${descricao}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    linhas.push({ data, valor, descricao, documento: tag(b, "CHECKNUM") || tag(b, "REFNUM") || undefined, identificador: n > 1 ? `${base}#${n}` : base });
  }
  const saldo = texto.match(/<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i)?.[0] ?? "";
  const saldoFinal = saldo ? numero(tag(saldo, "BALAMT")) : NaN;
  return {
    formato: "ofx", linhas,
    saldoFinal: Number.isFinite(saldoFinal) ? Math.round(saldoFinal * 100) / 100 : null,
    saldoData: saldo ? dataOfx(tag(saldo, "DTASOF")) || null : null,
    banco: tag(texto, "BANKID") || tag(texto, "ORG") || null,
    conta: tag(texto, "ACCTID") || null,
  };
}
