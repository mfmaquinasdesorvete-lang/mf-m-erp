// SSW (ssw.inf.br): sistema usado por muitas transportadoras (ex.: Expresso São Miguel). O rastreio pela chave da
// NF-e (POST https://ssw.inf.br/api/trackingdanfe, JSON { chave_nfe }) não pede senha e vale para qualquer
// transportadora do SSW. Funções puras (testadas no Vitest); a chamada fica em functions/ssw.
// Resposta conferida na ajuda pública do SSW (ssw.inf.br/ajuda/trackingdanfe.html): { success, message,
// documento: { header, tracking: [{ data_hora, dominio, filial, cidade, ocorrencia, descricao, tipo,
// data_hora_efetiva, nome_recebedor, nro_doc_recebedor }] } }. A leitura aceita variações de nome por segurança.

export const URL_TRACKING_DANFE = "https://ssw.inf.br/api/trackingdanfe";

export type EventoSsw = {
  em: string | null;          // data e hora da ocorrência (ISO, como veio)
  ocorrencia: string;         // ex.: "MERCADORIA ENTREGUE (01)"
  descricao: string | null;
  cidade: string | null;
  filial: string | null;
  tipo: string | null;
  recebedor: string | null;
};

export type RastreioSsw =
  | { ok: true; eventos: EventoSsw[]; ultimo: EventoSsw | null; entregue: boolean; entregue_em: string | null; remetente: string | null; destinatario: string | null }
  | { ok: false; erro: string };

const txt = (v: unknown) => { const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""; return s || null; };
const dig = (s?: string | null) => (s ?? "").replace(/\D/g, "");

/** Chave de NF-e (ou CT-e) válida: 44 dígitos com o dígito verificador certo. */
export function chaveValida(chave?: string | null) {
  const c = dig(chave);
  if (c.length !== 44) return false;
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return (r < 2 ? 0 : 11 - r) === Number(c[43]);
}

/** Entrega feita: código 01 do SSW ("MERCADORIA ENTREGUE") ou o texto/tipo de entrega. */
export function eventoDeEntrega(e: Pick<EventoSsw, "ocorrencia" | "tipo">) {
  const o = e.ocorrencia.toUpperCase();
  if (/\(0?1\)\s*$/.test(o)) return true;
  if (/N[AÃ]O\s+ENTREG|TENTATIVA|RECUSA|DEVOL/.test(o)) return false;
  return /MERCADORIA\s+ENTREGUE|ENTREGA\s+REALIZADA/.test(o) || /^entrega$/i.test(e.tipo ?? "");
}

function evento(x: Record<string, unknown>): EventoSsw | null {
  const ocorrencia = txt(x.ocorrencia) ?? txt(x.descricao);
  if (!ocorrencia) return null;
  return {
    em: txt(x.data_hora_efetiva) ?? txt(x.data_hora),
    ocorrencia,
    descricao: txt(x.descricao),
    cidade: txt(x.cidade),
    filial: txt(x.filial),
    tipo: txt(x.tipo),
    recebedor: txt(x.nome_recebedor),
  };
}

/** Lê a resposta do trackingdanfe. Eventos do mais antigo para o mais novo. */
export function lerTrackingSsw(corpo: unknown): RastreioSsw {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const doc = (c.documento ?? c.documentos ?? null) as Record<string, unknown> | Record<string, unknown>[] | null;
  const d = (Array.isArray(doc) ? doc[0] : doc) as Record<string, unknown> | null;
  const lista = Array.isArray(d?.tracking) ? (d!.tracking as Record<string, unknown>[]) : [];
  if (c.success === false || !lista.length) {
    return { ok: false, erro: txt(c.message) ?? "o SSW não achou esta nota (a transportadora pode não usar o SSW ou ainda não lançou a nota)" };
  }
  const eventos = lista.map(evento).filter((e): e is EventoSsw => !!e)
    .sort((a, b) => (a.em ?? "").localeCompare(b.em ?? ""));
  const ultimo = eventos[eventos.length - 1] ?? null;
  const entrega = [...eventos].reverse().find(eventoDeEntrega) ?? null;
  const h = (d?.header ?? {}) as Record<string, unknown>;
  return {
    ok: true, eventos, ultimo,
    entregue: !!entrega,
    entregue_em: entrega?.em ?? null,
    remetente: txt(h.remetente), destinatario: txt(h.destinatario),
  };
}

/** Texto curto para a lista: "MERCADORIA ENTREGUE (01) · JOINVILLE / SC". */
export const resumoEvento = (e: EventoSsw | null) => (e ? [e.ocorrencia, e.cidade].filter(Boolean).join(" · ") : null);

/** Hora do SSW vem sem fuso (horário de Brasília): acrescenta -03:00 para gravar certo. */
export const comFuso = (em: string | null) => (em && !/(Z|[+-]\d\d:?\d\d)$/.test(em) ? `${em}-03:00` : em);
