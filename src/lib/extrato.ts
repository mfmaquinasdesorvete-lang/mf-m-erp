// Leitura do extrato bancário: OFX (Unicred, Nubank e a maioria dos bancos) e CSV (InfinitePay e outros).
// Cada linha ganha um identificador estável, para o mesmo lançamento não entrar duas vezes ao importar de novo.

export type LinhaExtrato = { data: string; valor: number; descricao: string; documento?: string; identificador: string };
export type ResultadoExtrato = {
  formato: "ofx" | "csv";
  linhas: LinhaExtrato[];
  saldoFinal?: number | null;
  saldoData?: string | null;
  banco?: string | null;
  conta?: string | null;
  /** só CSV: cabeçalho e o mapeamento das colunas usado (pode ser trocado na tela) */
  csv?: { cabecalho: string[]; registros: string[][]; mapa: MapaCsv };
};
export type MapaCsv = { data: number; valor: number; entrada: number; saida: number; tipo: number; descricao: number[] };

/** Texto do arquivo respeitando a codificação (bancos brasileiros ainda usam Windows-1252). */
export async function lerTexto(arquivo: File): Promise<string> {
  const buf = await arquivo.arrayBuffer();
  const inicio = new TextDecoder("latin1").decode(buf.slice(0, 400));
  const declarado = /CHARSET:\s*1252|encoding="(windows-1252|iso-8859-1)"/i.test(inicio);
  if (declarado) return new TextDecoder("windows-1252").decode(buf);
  const utf8 = new TextDecoder("utf-8").decode(buf);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8.replace(/^﻿/, "");
}

export async function lerExtrato(arquivo: File): Promise<ResultadoExtrato> {
  const texto = await lerTexto(arquivo);
  if (/<OFX>|OFXHEADER/i.test(texto)) return lerOfx(texto);
  return lerCsv(texto);
}

/* ------------------------------------ OFX ------------------------------------ */

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

export function lerOfx(texto: string): ResultadoExtrato {
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

/* ------------------------------------ CSV ------------------------------------ */

function separarCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = [";", "\t", ","].map((s) => [s, primeira.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo.trim()); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo.trim()); campo = "";
      if (linha.some((x) => x)) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo.trim());
  if (linha.some((x) => x)) linhas.push(linha);
  return linhas;
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function dataCsv(v: string): string {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

/** Descobre as colunas pelo nome do cabeçalho (data, valor ou entrada/saída, tipo, descrição). */
export function adivinharMapa(cab: string[]): MapaCsv {
  const h = cab.map(sem);
  const achar = (...nomes: string[]) => h.findIndex((x) => nomes.some((n) => x === n)) >= 0
    ? h.findIndex((x) => nomes.some((n) => x === n))
    : h.findIndex((x) => nomes.some((n) => x.includes(n)));
  const data = achar("data", "data do lancamento", "data lancamento", "date");
  const entrada = h.findIndex((x) => /^(entrada|credito|creditos|valor credito)/.test(x));
  const saida = h.findIndex((x) => /^(saida|debito|debitos|valor debito)/.test(x));
  const valor = entrada >= 0 && saida >= 0 ? -1 : achar("valor liquido", "valor (r$)", "valor", "amount", "montante");
  const tipo = h.findIndex((x) => /^(tipo|natureza|operacao|c\/d|d\/c)/.test(x));
  const descricao = h.map((x, i) => (/(descri|historico|nome|detalhe|identifica|estabelecimento|memo|favorecido|pagador)/.test(x) ? i : -1)).filter((i) => i >= 0 && i !== tipo);
  return { data, valor, entrada, saida, tipo, descricao };
}

export function linhasCsv(registros: string[][], mapa: MapaCsv): LinhaExtrato[] {
  const vistos = new Map<string, number>();
  const out: LinhaExtrato[] = [];
  for (const r of registros) {
    const data = mapa.data >= 0 ? dataCsv(r[mapa.data] ?? "") : "";
    let valor = NaN;
    if (mapa.valor >= 0) valor = numero(r[mapa.valor]);
    else if (mapa.entrada >= 0 || mapa.saida >= 0) {
      const e = mapa.entrada >= 0 ? numero(r[mapa.entrada]) : NaN, s = mapa.saida >= 0 ? numero(r[mapa.saida]) : NaN;
      valor = (Number.isFinite(e) ? Math.abs(e) : 0) - (Number.isFinite(s) ? Math.abs(s) : 0);
    }
    // coluna "tipo" com valores sem sinal (Débito/Saída/Pagamento → negativo)
    if (mapa.tipo >= 0 && Number.isFinite(valor) && valor > 0 && /(debito|saida|pagamento|enviad|transferencia enviada|tarifa|^d$)/.test(sem(r[mapa.tipo] ?? ""))) valor = -valor;
    valor = Math.round(valor * 100) / 100;
    if (!data || !Number.isFinite(valor) || valor === 0) continue;
    const descricao = [mapa.tipo >= 0 ? r[mapa.tipo] : "", ...mapa.descricao.map((i) => r[i])].filter(Boolean).join(" · ").slice(0, 300);
    const base = `${data}|${valor.toFixed(2)}|${sem(descricao)}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    out.push({ data, valor, descricao, identificador: `csv-${hash(base)}-${n}` });
  }
  return out;
}

export function lerCsv(texto: string): ResultadoExtrato {
  const todas = separarCsv(texto);
  // pula linhas de apresentação até o cabeçalho (a primeira que tem "data")
  const iCab = Math.max(0, todas.slice(0, 15).findIndex((l) => l.some((c) => /^data/.test(sem(c)))));
  const cabecalho = todas[iCab] ?? [];
  const registros = todas.slice(iCab + 1);
  const mapa = adivinharMapa(cabecalho);
  return { formato: "csv", linhas: linhasCsv(registros, mapa), csv: { cabecalho, registros, mapa } };
}

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
