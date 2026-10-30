// CRM, parte 1 (pedido da usuária, 30/10): oportunidades antes do orçamento, em etapas, com o que pede ação e as
// métricas (conversão por etapa e por vendedor, tempo em cada etapa, motivo de perda, valor no funil). O histórico
// (public.oportunidade_eventos) é gravado pelo banco; aqui só se lê.
import type { EtapaQuadro, Nivel } from "@/components/quadro/QuadroEtapas";

export type EtapaOp = "novo" | "conversa" | "proposta" | "ganho" | "perdido";

export type Oportunidade = {
  id: string; numero: number; titulo: string; cliente_id: string | null;
  contato_nome: string | null; contato_whatsapp: string | null; contato_email: string | null;
  etapa: EtapaOp; etapa_desde: string; valor: number | null; vendedor_id: string | null; marcadores: string[] | null;
  origem: string | null; previsao: string | null; motivo_perda: string | null; pedido_id: string | null;
  fechada_em: string | null; created_at: string; excluida_em: string | null;
};

export type EventoOp = {
  id: string; oportunidade_id: string; tipo: "criada" | "etapa" | "nota" | "valor" | "vendedor" | "pedido";
  de: string | null; para: string | null; texto: string | null; por_nome: string | null; criado_em: string;
};

export const ETAPAS_OP: (EtapaQuadro & { id: EtapaOp })[] = [
  { id: "novo", titulo: "Novo contato", curto: "Novo", frase: "Chegou agora: falar com a pessoa", cor: "#64748b" },
  { id: "conversa", titulo: "Em conversa", curto: "Conversa", frase: "Entendendo o que precisa", cor: "#0ea5e9" },
  { id: "proposta", titulo: "Proposta enviada", curto: "Proposta", frase: "Esperando a resposta do cliente", cor: "#f59e0b" },
  { id: "ganho", titulo: "Ganho", curto: "Ganho", frase: "Virou venda", cor: "#10b981" },
  { id: "perdido", titulo: "Perdido", curto: "Perdido", frase: "Não fechou (com o motivo)", cor: "#ef4444" },
];
export const ABERTAS: EtapaOp[] = ["novo", "conversa", "proposta"];
export const rotuloEtapa = (e: string | null | undefined) => ETAPAS_OP.find((x) => x.id === e)?.titulo ?? e ?? "";

/** O próximo passo de cada etapa aberta (o botão do cartão). */
export const PROXIMA: Partial<Record<EtapaOp, { etapa: EtapaOp; rotulo: string; frase: string }>> = {
  novo: { etapa: "conversa", rotulo: "Comecei a conversa", frase: "falar com a pessoa" },
  conversa: { etapa: "proposta", rotulo: "Mandei a proposta", frase: "mandar a proposta" },
  proposta: { etapa: "ganho", rotulo: "Ganhou", frase: "cobrar a resposta" },
};

export const ORIGENS = ["WhatsApp", "Instagram", "Site", "Indicação", "Telefone", "Feira ou evento", "Mercado Livre", "Cliente antigo", "Outro"];
export const MOTIVOS_PERDA = ["Preço", "Comprou de outro", "Desistiu ou adiou", "Sem resposta", "Prazo de entrega", "Sem crédito ou pagamento", "Outro"];

/** Dias parado na etapa que já pedem ação (aviso) e que já são urgentes. */
const LIMITES: Partial<Record<EtapaOp, { aviso: number; urgente: number; texto: string }>> = {
  novo: { aviso: 1, urgente: 3, texto: "sem primeiro contato" },
  conversa: { aviso: 7, urgente: 14, texto: "conversa parada" },
  proposta: { aviso: 5, urgente: 10, texto: "proposta sem resposta" },
};

const DIA = 86_400_000;
const dias = (de: string, ate: number) => Math.max(0, Math.floor((ate - new Date(de).getTime()) / DIA));

/** O que a oportunidade pede: nada, aviso (1) ou urgente (2), pelo tempo parada na etapa. */
export function situacaoOp(o: Pick<Oportunidade, "etapa" | "etapa_desde">, agora = Date.now()): { nivel: Nivel; alerta: string | null; dias: number } {
  const d = dias(o.etapa_desde, agora);
  const l = LIMITES[o.etapa];
  if (!l || d < l.aviso) return { nivel: 0, alerta: null, dias: d };
  return { nivel: d >= l.urgente ? 2 : 1, alerta: l.texto, dias: d };
}

/** Por onde a oportunidade passou e quanto tempo ficou em cada etapa (ms), pelo histórico. */
export function caminho(o: Pick<Oportunidade, "id" | "etapa" | "created_at">, eventos: EventoOp[], agora = Date.now()) {
  const meus = eventos.filter((e) => e.oportunidade_id === o.id && (e.tipo === "criada" || e.tipo === "etapa"))
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const passos: { etapa: EtapaOp; desde: number }[] = [];
  for (const e of meus) if (e.para) passos.push({ etapa: e.para as EtapaOp, desde: new Date(e.criado_em).getTime() });
  if (!passos.length) passos.push({ etapa: o.etapa, desde: new Date(o.created_at).getTime() });
  const tempo = new Map<EtapaOp, number>();
  passos.forEach((p, k) => {
    const fim = passos[k + 1]?.desde ?? (ABERTAS.includes(p.etapa) ? agora : p.desde);
    tempo.set(p.etapa, (tempo.get(p.etapa) ?? 0) + Math.max(0, fim - p.desde));
  });
  return { passou: new Set(passos.map((p) => p.etapa)), tempo };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);

/** Métricas do funil: conversão por etapa e por vendedor, tempo médio em cada etapa, motivos de perda e valor no funil. */
export function metricasOp(ops: Oportunidade[], eventos: EventoOp[], nomeVendedor: (id: string | null) => string, agora = Date.now()) {
  const caminhos = new Map(ops.map((o) => [o.id, caminho(o, eventos, agora)]));
  const chegou = (e: EtapaOp) => ops.filter((o) => caminhos.get(o.id)!.passou.has(e) || ordem(o.etapa) > ordem(e) && o.etapa !== "perdido").length;
  const ganhas = ops.filter((o) => o.etapa === "ganho");
  const perdidas = ops.filter((o) => o.etapa === "perdido");
  const fechadas = ganhas.length + perdidas.length;

  // de uma etapa para a seguinte: quantas que chegaram numa chegaram na próxima
  const sequencia: EtapaOp[] = ["novo", "conversa", "proposta", "ganho"];
  const conversao = sequencia.slice(0, -1).map((e, k) => {
    const daqui = chegou(e), adiante = chegou(sequencia[k + 1]);
    return { de: e, para: sequencia[k + 1], chegaram: daqui, seguiram: adiante, taxa: pct(adiante, daqui) };
  });

  const tempoMedio = ABERTAS.map((e) => {
    const tempos = ops.map((o) => caminhos.get(o.id)!.tempo.get(e)).filter((t): t is number => t != null);
    return { etapa: e, dias: tempos.length ? r1(tempos.reduce((s, t) => s + t, 0) / tempos.length / DIA) : null, oportunidades: tempos.length };
  });

  const porVendedor = [...new Set(ops.map((o) => o.vendedor_id))].map((v) => {
    const minhas = ops.filter((o) => o.vendedor_id === v);
    const g = minhas.filter((o) => o.etapa === "ganho"), p = minhas.filter((o) => o.etapa === "perdido");
    return {
      vendedor: nomeVendedor(v), total: minhas.length, abertas: minhas.filter((o) => ABERTAS.includes(o.etapa)).length,
      ganhas: g.length, perdidas: p.length, taxa: pct(g.length, g.length + p.length),
      valorGanho: g.reduce((s, o) => s + Number(o.valor || 0), 0),
    };
  }).sort((a, b) => b.ganhas - a.ganhas || b.total - a.total);

  const motivos = new Map<string, number>();
  for (const o of perdidas) motivos.set(o.motivo_perda || "Sem motivo", (motivos.get(o.motivo_perda || "Sem motivo") ?? 0) + 1);

  const funil = ABERTAS.map((e) => {
    const l = ops.filter((o) => o.etapa === e);
    return { etapa: e, quantidade: l.length, valor: l.reduce((s, o) => s + Number(o.valor || 0), 0) };
  });

  const diasAteFechar = [...ganhas, ...perdidas].filter((o) => o.fechada_em).map((o) => (new Date(o.fechada_em!).getTime() - new Date(o.created_at).getTime()) / DIA);
  return {
    total: ops.length, ganhas: ganhas.length, perdidas: perdidas.length, taxaGanho: pct(ganhas.length, fechadas),
    valorGanho: ganhas.reduce((s, o) => s + Number(o.valor || 0), 0),
    valorFunil: funil.reduce((s, f) => s + f.valor, 0),
    diasAteFechar: diasAteFechar.length ? r1(diasAteFechar.reduce((s, d) => s + d, 0) / diasAteFechar.length) : null,
    conversao, tempoMedio, porVendedor, funil,
    motivos: [...motivos].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
  };
}

const ordem = (e: EtapaOp) => ["novo", "conversa", "proposta", "ganho"].indexOf(e);
