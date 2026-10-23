// Braspress: cotação e rastreio pela API (api.braspress.com, autenticação Basic com usuário e senha que a Braspress
// fornece). Funções puras (testadas no Vitest); a chamada fica em functions/braspress.
// Conferido na documentação pública (api.braspress.com/home) e nos plugins abertos crmdesenvolvimentos/api-braspress e
// kayobruno/kb-woocommerce-braspress:
// - cotação: POST {base}/v1/cotacao/calcular/json com cnpjRemetente, cnpjDestinatario, modal ("R" rodoviário),
//   tipoFrete (1 CIF, 2 FOB), cepOrigem, cepDestino, vlrMercadoria, peso (kg), volumes e cubagem
//   [{ comprimento, largura, altura (metros), volumes }]; resposta { id, prazo, totalFrete };
// - rastreio: GET {base}/v3/tracking/byNf/{cnpjRemetente}/{numeroNf}/json; resposta { conhecimentos: [{ statusEntrega,
//   numero, previsaoEntrega, dataEntrega, ultimaOcorrencia, dataOcorrencia, cidade, uf, timeLine: [{ descricao, data }] }] }.
import type { EventoSsw } from "./ssw.ts";

export const BASE_BRASPRESS = { producao: "https://api.braspress.com", homologacao: "https://hml-api.braspress.com" } as const;

type VolumeBp = { quantidade?: number | string | null; peso_kg?: number | string | null; largura_cm?: number | string | null; altura_cm?: number | string | null; comprimento_cm?: number | string | null };
export type EnvioBp = { cep_origem?: string | null; cep_destino?: string | null; valor_mercadoria?: number | string | null; peso_total_kg?: number | string | null; volumes?: VolumeBp[] | null; modalidade?: string | null };

const n = (v: unknown) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const dig = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const txt = (v: unknown) => { const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""; return s || null; };
const vols = (e: EnvioBp) => (e.volumes ?? []).filter((v) => n(v.quantidade ?? 1) > 0);
const pesoTotal = (e: EnvioBp) => n(e.peso_total_kg) || vols(e).reduce((s, v) => s + Math.max(n(v.quantidade ?? 1), 0) * n(v.peso_kg), 0);

export const basicBraspress = (usuario: string, senha: string) => `Basic ${btoa(`${usuario}:${senha}`)}`;

/** O que falta para a Braspress cotar. */
export function faltaParaCotarBp(e: EnvioBp, cnpjRemetente?: string | null, docDestinatario?: string | null) {
  const f: string[] = [];
  if (dig(cnpjRemetente).length !== 14) f.push("CNPJ da unidade");
  if (![11, 14].includes(dig(docDestinatario).length)) f.push("CPF/CNPJ do cliente");
  if (dig(e.cep_origem).length !== 8) f.push("CEP de origem");
  if (dig(e.cep_destino).length !== 8) f.push("CEP de destino");
  if (!(n(e.valor_mercadoria) > 0)) f.push("valor da mercadoria");
  if (!(pesoTotal(e) > 0)) f.push("peso");
  if (!vols(e).length || vols(e).some((v) => !(n(v.largura_cm) > 0) || !(n(v.altura_cm) > 0) || !(n(v.comprimento_cm) > 0))) f.push("medidas de cada volume");
  return f;
}

/** Corpo da cotação. Medidas vão em metros; FOB quando o cliente paga o frete. */
export function corpoCotacaoBp(e: EnvioBp, cnpjRemetente: string, docDestinatario: string) {
  const m = (cm: unknown) => Math.round(n(cm)) / 100;
  return {
    cnpjRemetente: Number(dig(cnpjRemetente)),
    cnpjDestinatario: Number(dig(docDestinatario)),
    modal: "R",
    tipoFrete: (e.modalidade ?? "").toLowerCase() === "fob" ? "2" : "1",
    cepOrigem: Number(dig(e.cep_origem)),
    cepDestino: Number(dig(e.cep_destino)),
    vlrMercadoria: Math.round(n(e.valor_mercadoria) * 100) / 100,
    peso: Math.round(pesoTotal(e) * 1000) / 1000,
    volumes: vols(e).reduce((s, v) => s + Math.round(n(v.quantidade ?? 1)), 0),
    cubagem: vols(e).map((v) => ({ comprimento: m(v.comprimento_cm), largura: m(v.largura_cm), altura: m(v.altura_cm), volumes: Math.round(n(v.quantidade ?? 1)) })),
  };
}

/** Mensagem de erro da Braspress ({ message } ou { errorList: [..] }). */
export function mensagemBp(r: unknown): string | null {
  const o = (r ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(o.errorList) ? o.errorList.filter((x) => typeof x === "string") : [];
  if (lista.length) return (lista as string[]).join("; ");
  const m = o.message ?? o.mensagem ?? o.error;
  return typeof m === "string" && m.trim() ? m.trim() : null;
}

export function lerCotacaoBp(r: unknown): { valor: number; prazo: number | null; id: string | null } | { erro: string } {
  const o = (r ?? {}) as Record<string, unknown>;
  const valor = n(o.totalFrete);
  if (!(valor > 0)) return { erro: mensagemBp(r) ?? "a Braspress não devolveu o valor do frete" };
  const prazo = n(o.prazo);
  return { valor: Math.round(valor * 100) / 100, prazo: prazo > 0 ? Math.round(prazo) : null, id: txt(o.id) };
}

/** "18/08/2022 03:54" ou "18/08/2022" → ISO no horário de Brasília. */
export function dataBp(s: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(String(s ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "12"}:${m[5] ?? "00"}:00-03:00` : null;
}

export type RastreioBp =
  | { ok: true; eventos: EventoSsw[]; ultimo: EventoSsw | null; entregue: boolean; entregue_em: string | null; previsao: string | null; cte: string | null }
  | { ok: false; erro: string };

/** Rastreio da nota: eventos no formato do SSW (a tela mostra igual), entrega e previsão. */
export function lerRastreioBp(r: unknown): RastreioBp {
  const lista = Array.isArray((r as Record<string, unknown> | null)?.conhecimentos) ? ((r as Record<string, unknown>).conhecimentos as Record<string, unknown>[]) : [];
  const c = lista[0];
  if (!c) return { ok: false, erro: mensagemBp(r) ?? "a Braspress não achou esta nota" };
  const cidade = [txt(c.cidade), txt(c.uf)].filter(Boolean).join(" / ") || null;
  const ev = (descricao: unknown, data: unknown): EventoSsw | null => {
    const o = txt(descricao);
    return o ? { em: dataBp(data), ocorrencia: o, descricao: null, cidade: null, filial: null, tipo: null, recebedor: null } : null;
  };
  const eventos = (Array.isArray(c.timeLine) ? (c.timeLine as Record<string, unknown>[]) : []).map((t) => ev(t.descricao, t.data)).filter((e): e is EventoSsw => !!e);
  const ultima = ev(c.ultimaOcorrencia, c.dataOcorrencia);
  if (ultima && !eventos.some((e) => e.ocorrencia === ultima.ocorrencia)) eventos.push({ ...ultima, cidade });
  eventos.sort((a, b) => (a.em ?? "").localeCompare(b.em ?? ""));
  const entregue = /ENTREGUE/i.test(String(c.statusEntrega ?? "")) || (!!txt(c.dataEntrega) && /ENTREGA\s+REALIZADA/i.test(String(c.ultimaOcorrencia ?? "")));
  return {
    ok: true, eventos, ultimo: eventos[eventos.length - 1] ?? null, entregue,
    entregue_em: entregue ? (dataBp(c.dataEntrega) ?? dataBp(c.dataOcorrencia)) : null,
    previsao: dataBp(c.previsaoEntrega)?.slice(0, 10) ?? null, cte: txt(c.numero),
  };
}
