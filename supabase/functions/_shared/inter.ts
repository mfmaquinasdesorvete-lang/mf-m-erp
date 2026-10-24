// Banco Inter (API PJ): conexão com o certificado do app (mTLS), token, saldo e extrato completo.
// O app é criado no Internet Banking do Inter (Soluções para sua empresa → Nova integração) com a permissão de
// extrato; de lá saem o Client ID, o Client Secret e o zip com o certificado (.crt) e a chave (.key).
import { X509Certificate } from "node:crypto";
import type { LinhaExtrato } from "./extrato-ofx.ts";

const BASE = "https://cdpj.partners.bancointer.com.br";
export const ESCOPO_EXTRATO = "extrato.read";

export type ChavesInter = { client_id: string; client_secret: string; cert: string; key: string };
export type TransacaoInter = {
  idTransacao?: string; dataEntrada?: string; dataTransacao?: string; dataInclusao?: string; tipoTransacao?: string;
  tipoOperacao?: string; valor?: string | number; titulo?: string; descricao?: string; detalhes?: Record<string, unknown> | null;
};

export class ErroInter extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const texto = (v: unknown) => (v == null ? "" : String(v).trim());

/** Confere os arquivos do certificado antes de mandar ao Inter; devolve a validade do certificado. */
export function conferirCertificado(cert: string, key: string) {
  if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(cert)) {
    throw new ErroInter(400, "O certificado não é um arquivo .crt válido: use o arquivo que termina em .crt do zip baixado no Inter.");
  }
  if (/ENCRYPTED/.test(key)) throw new ErroInter(400, "A chave está protegida por senha: use o arquivo .key que veio no zip do Inter, sem alterar.");
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new ErroInter(400, "A chave não é um arquivo .key válido: use o arquivo que termina em .key do zip baixado no Inter.");
  }
  try {
    const x = new X509Certificate(cert);
    return { validade: new Date(x.validTo).toISOString() };
  } catch {
    throw new ErroInter(400, "Não consegui ler o certificado (.crt). Baixe de novo o zip do app no Inter.");
  }
}

/** Mensagem em português para cada recusa do Inter. */
function explicar(status: number, corpo: Record<string, unknown>, etapa: "token" | "consulta", boleto = false, pix = false, pagBoleto = false) {
  const violacoes = Array.isArray(corpo.violacoes)
    ? (corpo.violacoes as Record<string, unknown>[]).map((v) => [texto(v.propriedade), texto(v.razao)].filter(Boolean).join(": ")).filter(Boolean).join("; ")
    : "";
  const det = [texto(corpo.title ?? corpo.detail ?? corpo.message ?? corpo.error_description ?? corpo.error), violacoes].filter(Boolean).join(" — ").slice(0, 300);
  const permissao = pagBoleto
    ? 'O app do Inter não tem a permissão de consultar pagamentos: edite o app no Internet Banking (Soluções para sua empresa → Integrações) e marque "Consultar pagamentos" (pagamento de boletos).'
    : pix
    ? 'O app do Inter não tem a permissão de pagar Pix: edite o app no Internet Banking (Soluções para sua empresa → Integrações) e marque "Pagamento Pix" (e "Consultar pagamentos Pix").'
    : boleto
    ? 'O app do Inter não tem a permissão de boletos: edite o app no Internet Banking (Soluções para sua empresa → Integrações) e marque "Emitir e cancelar boletos" e "Consultar boletos".'
    : 'O app do Inter não tem a permissão de extrato: edite o app no Internet Banking e marque "Consultar extrato e saldo".';
  if (etapa === "token" && (status === 400 || status === 401)) {
    if (/scope|escopo/i.test(det)) return `${permissao} ${det}`.trim();
    if (/invalid_client|client/i.test(det) || status === 401) return `O Inter recusou o Client ID ou o Client Secret (confira no app, no Internet Banking do Inter). ${det}`.trim();
    return `O Inter recusou o pedido de acesso (${status}). ${det}`.trim();
  }
  if (status === 403) return `${permissao} ${det}`.trim();
  if (status === 404) return boleto ? `O Inter não achou o boleto. ${det}`.trim() : `O Inter não achou a conta: se o app enxerga mais de uma conta, informe o número da conta corrente. ${det}`.trim();
  if (status === 429) return "O Inter limita as consultas por minuto: tente de novo daqui a 1 minuto.";
  if (status === 400 && pix) return `O Inter recusou o Pix: ${det || "confira a chave Pix, o valor e o saldo da conta"}.`;
  if (status === 400 && boleto) return `O Inter recusou o boleto: ${det || "confira o cadastro do cliente e o vencimento"}.`;
  return `O Inter respondeu ${status}. ${det}`.trim();
}

/** Erro de rede/TLS (certificado recusado, sem conexão) em português. */
function explicarRede(e: unknown) {
  const m = String((e as Error)?.message ?? e);
  if (/certificate|handshake|tls|alert|bad ?cert|unknown ca/i.test(m)) {
    return "O Inter recusou o certificado: envie o .crt e o .key do mesmo app (os dois arquivos do zip baixado no Inter) e confira se o certificado não venceu.";
  }
  return `Não consegui falar com o Inter: ${m.slice(0, 160)}`;
}

export function clienteInter(ch: ChavesInter, contaCorrente?: string | null) {
  let client: Deno.HttpClient;
  try {
    client = Deno.createHttpClient({ cert: ch.cert, key: ch.key });
  } catch (e) {
    throw new ErroInter(400, `O certificado ou a chave não puderam ser usados: ${String((e as Error).message).slice(0, 120)}`);
  }
  // um acesso por grupo de permissões (extrato; boletos), guardado durante a chamada da função
  const tokens = new Map<string, string>();
  const ehBoleto = (escopo: string) => escopo.includes("boleto-cobranca");
  const ehPagBoleto = (escopo: string) => escopo.includes("pagamento-boleto");
  const ehPix = (escopo: string) => escopo.includes("pagamento-pix");

  async function chamar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, client, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      throw new ErroInter(502, explicarRede(e));
    }
  }

  async function entrar(escopo = ESCOPO_EXTRATO) {
    const r = await chamar(`${BASE}/oauth/v2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: ch.client_id, client_secret: ch.client_secret, grant_type: "client_credentials", scope: escopo }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new ErroInter(r.status === 200 ? 502 : r.status, explicar(r.status, j, "token", ehBoleto(escopo), ehPix(escopo), ehPagBoleto(escopo)));
    tokens.set(escopo, String(j.access_token));
  }

  /** Chamada à API com o acesso do grupo de permissões (entra sozinho na primeira vez). */
  async function pedir<T>(metodo: string, caminho: string, corpo?: unknown, escopo = ESCOPO_EXTRATO, extras: Record<string, string> = {}): Promise<T> {
    if (!tokens.has(escopo)) await entrar(escopo);
    const headers: Record<string, string> = { ...extras, Authorization: `Bearer ${tokens.get(escopo)}` };
    if (texto(contaCorrente)) headers["x-conta-corrente"] = texto(contaCorrente).replace(/\D/g, "");
    if (corpo !== undefined) headers["Content-Type"] = "application/json";
    const r = await chamar(`${BASE}${caminho}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    if (r.status === 202 || r.status === 204) return {} as T;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErroInter(r.status, explicar(r.status, j, "consulta", ehBoleto(escopo), ehPix(escopo), ehPagBoleto(escopo)));
    return j as T;
  }
  const get = <T>(caminho: string) => pedir<T>("GET", caminho);

  /** Saldo disponível agora. */
  async function saldo() {
    const s = await get<{ disponivel?: number | string }>("/banking/v2/saldo");
    const v = Number(s.disponivel);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  }

  /** Extrato completo do período (o Inter aceita até 90 dias por consulta; aqui vai em janelas de 80 dias, página a página). */
  async function extrato(inicio: string, fim: string) {
    const todas: TransacaoInter[] = [];
    for (let de = inicio; de <= fim; de = somarDias(de, 80)) {
      const ate = somarDias(de, 79) < fim ? somarDias(de, 79) : fim;
      for (let pagina = 0; pagina < 50; pagina++) {
        const q = new URLSearchParams({ dataInicio: de, dataFim: ate, pagina: String(pagina), tamanhoPagina: "1000" });
        const r = await get<{ transacoes?: TransacaoInter[]; totalPaginas?: number; ultimaPagina?: boolean }>(`/banking/v2/extrato/completo?${q}`);
        const lista = r.transacoes ?? [];
        todas.push(...lista);
        if (r.ultimaPagina === true || lista.length < 1000 || (r.totalPaginas != null && pagina + 1 >= r.totalPaginas)) break;
      }
    }
    return todas;
  }

  return { entrar, pedir, saldo, extrato, fechar: () => { try { client.close(); } catch { /* já fechado */ } } };
}

export const somarDias = (data: string, n: number) => new Date(new Date(`${data}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
export const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Transação do Inter → linha do extrato do ERP (crédito positivo, débito negativo). */
export function linhasInter(transacoes: TransacaoInter[]): LinhaExtrato[] {
  const vistos = new Map<string, number>();
  const out: LinhaExtrato[] = [];
  for (const t of transacoes) {
    const data = texto(t.dataTransacao || t.dataEntrada || t.dataInclusao).slice(0, 10);
    const v = Number(texto(t.valor).replace(",", "."));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(v) || v === 0) continue;
    const valor = Math.round((texto(t.tipoOperacao).toUpperCase() === "D" ? -Math.abs(v) : Math.abs(v)) * 100) / 100;
    const d = (t.detalhes ?? {}) as Record<string, unknown>;
    const outraParte = [d.nomePagador, d.nomeEmpresaPagador, d.nomeRecebedor, d.nomeEmpresaRecebedor, d.nomeFavorecido, d.nome]
      .map(texto).find(Boolean) ?? "";
    const desc = texto(t.descricao);
    const descricao = [texto(t.titulo), desc, outraParte && !desc.toLowerCase().includes(outraParte.toLowerCase()) ? outraParte : ""]
      .filter(Boolean).join(" · ") || texto(t.tipoTransacao) || "Lançamento Inter";
    const documento = [d.endToEndId, d.nossoNumero, d.codigoSolicitacao, d.txId].map(texto).find(Boolean) || undefined;
    const base = texto(t.idTransacao) ? `inter-${texto(t.idTransacao)}` : `inter-${data}|${valor.toFixed(2)}|${hash(descricao)}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    out.push({ data, valor, descricao: descricao.slice(0, 300), documento, identificador: n > 1 ? `${base}#${n}` : base });
  }
  return out;
}
