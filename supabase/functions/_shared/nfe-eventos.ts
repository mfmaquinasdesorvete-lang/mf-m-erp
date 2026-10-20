// Eventos registrados na NF-e depois da autorização: passagem por posto fiscal, MDF-e e CT-e da carga,
// ciência/confirmação do destinatário, carta de correção e cancelamento.
// Lê o XML dos eventos (procEventoNFe, um ou vários, ou dentro de outro XML) e resume para o ícone da lista.
// Arquivo puro (leitura por texto): usado pela função nfe-consultar e pela tela.

export type EventoNfe = {
  chave: string;
  tp_evento: string;
  n_seq: number;
  descricao: string;
  dh_evento: string | null;
  /** UF de quem registrou (cOrgao), ex.: "PR" no posto do Paraná; "AN" = Ambiente Nacional */
  orgao: string | null;
  /** dados do detalhe que ajudam a entender o evento (posto, placa, MDF-e…), em texto curto */
  detalhe: string | null;
  protocolo: string | null;
};

export type GrupoEvento = "passagem" | "transporte" | "destinatario" | "emitente" | "outro";

/** Códigos de evento da NF-e (Manual de Orientação do Contribuinte e notas técnicas de eventos). */
const TIPOS: Record<string, { rotulo: string; grupo: GrupoEvento }> = {
  "110110": { rotulo: "Carta de correção", grupo: "emitente" },
  "110111": { rotulo: "Cancelamento", grupo: "emitente" },
  "110112": { rotulo: "Cancelamento por substituição", grupo: "emitente" },
  "210200": { rotulo: "Destinatário confirmou a operação", grupo: "destinatario" },
  "210210": { rotulo: "Destinatário deu ciência", grupo: "destinatario" },
  "210220": { rotulo: "Destinatário desconhece a operação", grupo: "destinatario" },
  "210240": { rotulo: "Destinatário: operação não realizada", grupo: "destinatario" },
  "610500": { rotulo: "Passou por posto fiscal", grupo: "passagem" },
  "610510": { rotulo: "Passagem registrada automaticamente (leitura de placa)", grupo: "passagem" },
  "610514": { rotulo: "Passagem registrada automaticamente (MDF-e)", grupo: "passagem" },
  "610550": { rotulo: "Registro de passagem cancelado", grupo: "passagem" },
  "610600": { rotulo: "CT-e da carga autorizado", grupo: "transporte" },
  "610601": { rotulo: "CT-e da carga cancelado", grupo: "transporte" },
  "610610": { rotulo: "MDF-e da carga autorizado", grupo: "transporte" },
  "610611": { rotulo: "MDF-e da carga cancelado", grupo: "transporte" },
  "610614": { rotulo: "MDF-e com CT-e autorizado", grupo: "transporte" },
  "610615": { rotulo: "MDF-e com CT-e cancelado", grupo: "transporte" },
};

const UF_POR_CODIGO: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE",
  "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF", "90": "SUFRAMA", "91": "AN", "92": "SVC-AN", "93": "SVC-RS",
};

export function infoEvento(tp: string): { rotulo: string; grupo: GrupoEvento } {
  if (TIPOS[tp]) return TIPOS[tp];
  // outros registros do fisco na faixa 6105xx também são passagem
  if (/^6105\d\d$/.test(tp)) return { rotulo: "Registro de passagem", grupo: "passagem" };
  if (/^61\d{4}$/.test(tp)) return { rotulo: "Evento do fisco", grupo: "transporte" };
  return { rotulo: `Evento ${tp}`, grupo: "outro" };
}

export const ufDoOrgao = (c: string | null | undefined) => (c ? UF_POR_CODIGO[c] ?? c : null);

const tag = (xml: string, nome: string) => new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(xml)?.[1]?.trim() ?? null;
const des = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Campos do detalhe que valem mostrar (o resto é técnico). */
const ROTULOS_DETALHE: Record<string, string> = {
  xObs: "", xCorrecao: "correção", xJust: "justificativa", nProtEvento: "",
  cPostoUF: "posto", xPosto: "posto", UFPassagem: "UF", cUFTransito: "UF", dhPas: "", dhPassagem: "",
  placa: "placa", placaVeic: "placa", sentidoVia: "sentido", tpSentido: "sentido",
  chMDFe: "MDF-e", nMDF: "MDF-e nº", chCTe: "CT-e", nCT: "CT-e nº", CNPJ: "", xNome: "",
};

function resumirDetalhe(det: string | null): string | null {
  if (!det) return null;
  const partes: string[] = [];
  for (const [campo, rotulo] of Object.entries(ROTULOS_DETALHE)) {
    const v = tag(det, campo);
    if (!v || v.includes("<")) continue;
    let valor = des(v);
    if (campo === "chMDFe" || campo === "chCTe") valor = `nº ${Number(valor.slice(25, 34))}`;
    if (campo === "dhPas" || campo === "dhPassagem") continue; // a hora vai na data do evento
    partes.push(rotulo ? `${rotulo} ${valor}` : valor);
  }
  const unicos = [...new Set(partes)];
  return unicos.length ? unicos.join(" · ").slice(0, 300) : null;
}

/** Lê todos os eventos de um XML (procEventoNFe, envEvento, retorno da SEFAZ ou um XML com vários). */
export function lerEventosXml(xml: string): EventoNfe[] {
  const eventos: EventoNfe[] = [];
  const blocos = xml.match(/<(?:\w+:)?infEvento[\s>][\s\S]*?<\/(?:\w+:)?infEvento>/g) ?? [];
  // o retorno da SEFAZ (retEvento) também tem um infEvento, sem tpEvento de pedido; guarda o protocolo
  const protocolos = new Map<string, string>();
  for (const b of blocos) {
    const ch = tag(b, "chNFe"), tp = tag(b, "tpEvento"), prot = tag(b, "nProt"), seq = tag(b, "nSeqEvento");
    if (ch && tp && prot && !tag(b, "detEvento")) protocolos.set(`${ch}|${tp}|${seq ?? "1"}`, prot);
  }
  for (const b of blocos) {
    const det = tag(b, "detEvento");
    if (!det) continue;
    const chave = tag(b, "chNFe"), tp = tag(b, "tpEvento");
    if (!chave || !/^\d{44}$/.test(chave) || !tp) continue;
    const seq = tag(b, "nSeqEvento") ?? "1";
    const dh = tag(det, "dhPas") ?? tag(det, "dhPassagem") ?? tag(b, "dhEvento");
    eventos.push({
      chave, tp_evento: tp, n_seq: Number(seq) || 1,
      descricao: des(tag(det, "descEvento") ?? infoEvento(tp).rotulo),
      dh_evento: dh && !Number.isNaN(Date.parse(dh)) ? new Date(dh).toISOString() : null,
      orgao: ufDoOrgao(tag(b, "cOrgao")),
      detalhe: resumirDetalhe(det),
      protocolo: protocolos.get(`${chave}|${tp}|${seq}`) ?? null,
    });
  }
  return eventos;
}

/** Procura XML de eventos em qualquer lugar de uma resposta JSON (ex.: consulta completa da Focus). */
export function eventosNaResposta(corpo: unknown): EventoNfe[] {
  const achados: EventoNfe[] = [];
  const visitar = (v: unknown, prof: number) => {
    if (prof > 6 || v == null) return;
    if (typeof v === "string") { if (v.includes("infEvento")) achados.push(...lerEventosXml(v)); return; }
    if (Array.isArray(v)) { v.forEach((x) => visitar(x, prof + 1)); return; }
    if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => visitar(x, prof + 1));
  };
  visitar(corpo, 0);
  const vistos = new Set<string>();
  return achados.filter((e) => { const k = `${e.chave}|${e.tp_evento}|${e.n_seq}|${e.dh_evento}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

export type ResumoPostos = {
  /** passagens válidas (sem as canceladas) */
  passagens: EventoNfe[];
  ufs: string[];
  transporte: boolean;
  confirmada: boolean;
  ultima: EventoNfe | null;
};

/** Para o ícone da lista: quantos postos, por quais estados, se teve MDF-e/CT-e e se o destinatário confirmou. */
export function resumoPostos(eventos: EventoNfe[]): ResumoPostos {
  const ordenados = [...eventos].sort((a, b) => (a.dh_evento ?? "").localeCompare(b.dh_evento ?? ""));
  const cancelados = ordenados.filter((e) => e.tp_evento === "610550").length;
  const passagens = ordenados.filter((e) => infoEvento(e.tp_evento).grupo === "passagem" && e.tp_evento !== "610550");
  // cada cancelamento de passagem anula uma (o evento não diz qual; tira as mais antigas por segurança)
  const validas = passagens.slice(Math.min(cancelados, passagens.length));
  return {
    passagens: validas,
    ufs: [...new Set(validas.map((e) => e.orgao).filter((u): u is string => !!u && u !== "AN"))],
    transporte: ordenados.some((e) => infoEvento(e.tp_evento).grupo === "transporte"),
    confirmada: ordenados.some((e) => e.tp_evento === "210200"),
    ultima: validas[validas.length - 1] ?? null,
  };
}
