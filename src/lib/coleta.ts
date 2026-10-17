// Agendamento de coleta (como no portal da Rodonaves): os próximos dias de coleta como botões (SEG 19/10…), o período
// (manhã 08h–12h ou tarde 13h–18h) e a frequência de coleta de cada transportadora no endereço de cada unidade.
// Funções puras: a tela e o banco (agendar_coleta) usam a mesma regra.
import { feriados, iso } from "./obrigacoes";
import { totaisCarga, type Envio } from "./fretes";
import { pl } from "./format";

export type PeriodoColeta = "manha" | "tarde";
export const PERIODOS: Record<PeriodoColeta, { rotulo: string; faixa: string }> = {
  manha: { rotulo: "Manhã", faixa: "08h às 12h" },
  tarde: { rotulo: "Tarde", faixa: "13h às 18h" },
};
/** 0 = domingo … 6 = sábado (como no banco: extract(dow)) */
export const SIGLAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const NO_DIA = ["no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta", "no sábado"];

export type FrequenciaColeta = {
  id?: string; transportadora_id: string; unidade_id: string; dias: number[]; manha: boolean; tarde: boolean;
  antecedencia_dias: number; observacao?: string | null; atualizado_em?: string | null;
};
export const FREQUENCIA_PADRAO = { dias: [1, 2, 3, 4, 5], manha: true, tarde: true, antecedencia_dias: 1 };

const somar = (dia: string, n: number) => { const [a, m, d] = dia.split("-").map(Number); return iso(a, m, d + n); };
export const diaSemana = (dia: string) => { const [a, m, d] = dia.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };

/** Frequência que vale para o envio: a da transportadora escolhida ou, sem ela, a da marca (como frequencia_coleta). */
export function frequenciaDe(lista: FrequenciaColeta[], transp: { id: string; matriz_id?: string | null } | null | undefined, unidadeId: string | null | undefined) {
  if (!transp || !unidadeId) return null;
  return lista.find((f) => f.unidade_id === unidadeId && f.transportadora_id === transp.id)
    ?? (transp.matriz_id ? lista.find((f) => f.unidade_id === unidadeId && f.transportadora_id === transp.matriz_id) : undefined) ?? null;
}

export type DiaColeta = { data: string; sigla: string; dia: string; disponivel: boolean; motivo?: string };

/**
 * Próximos dias de coleta a partir de hoje + antecedência: os dias da frequência (sem ela, segunda a sexta), sem os
 * feriados nacionais. Dia útil fora da frequência aparece apagado ("não coleta"); fim de semana fora dela nem aparece.
 */
export function proximosDiasColeta(hoje: string, freq?: Partial<FrequenciaColeta> | null, quantos = 5): DiaColeta[] {
  const dias = freq?.dias?.length ? freq.dias : FREQUENCIA_PADRAO.dias;
  const out: DiaColeta[] = [];
  let d = somar(hoje, freq?.antecedencia_dias ?? FREQUENCIA_PADRAO.antecedencia_dias);
  for (let i = 0, livres = 0; i < 28 && livres < quantos; i++, d = somar(d, 1)) {
    const s = diaSemana(d);
    const naFrequencia = dias.includes(s);
    if (!naFrequencia && (s === 0 || s === 6)) continue;
    const feriado = feriados(Number(d.slice(0, 4))).get(d);
    const disponivel = naFrequencia && !feriado;
    out.push({ data: d, sigla: SIGLAS[s], dia: `${d.slice(8, 10)}/${d.slice(5, 7)}`, disponivel, ...(disponivel ? {} : { motivo: feriado ?? "não coleta" }) });
    if (disponivel) livres++;
  }
  return out;
}

/** Confere a escolha antes de gravar (mesma regra de agendar_coleta). */
export function conferirAgendamento(data: string | null | undefined, periodo: PeriodoColeta | null | undefined, hoje: string,
  freq?: FrequenciaColeta | null, urgente = false): string | null {
  if (!data) return "Escolha a data da coleta";
  if (data < hoje) return "Escolha uma data de hoje em diante";
  if (!periodo) return "Escolha o período: manhã ou tarde";
  if (freq && !urgente) {
    const s = diaSemana(data);
    if (!freq.dias.includes(s)) return `A transportadora não coleta neste endereço ${NO_DIA[s]}. Escolha outro dia ou marque como urgência`;
    if ((periodo === "manha" && !freq.manha) || (periodo === "tarde" && !freq.tarde)) return `A transportadora não coleta neste endereço de ${periodo === "manha" ? "manhã" : "tarde"}`;
  }
  return null;
}

/** "SEG a SEX · manhã e tarde", "SEG, QUA e SEX · só manhã". */
export function resumoFrequencia(f?: Partial<FrequenciaColeta> | null) {
  const dias = [...(f?.dias?.length ? f.dias : FREQUENCIA_PADRAO.dias)].sort((a, b) => a - b);
  const seguidos = dias.length > 2 && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  const txtDias = seguidos ? `${SIGLAS[dias[0]]} a ${SIGLAS[dias[dias.length - 1]]}`
    : dias.length === 1 ? SIGLAS[dias[0]] : `${dias.slice(0, -1).map((d) => SIGLAS[d]).join(", ")} e ${SIGLAS[dias[dias.length - 1]]}`;
  const manha = f?.manha ?? true, tarde = f?.tarde ?? true;
  return `${txtDias} · ${manha && tarde ? "manhã e tarde" : manha ? "só manhã" : "só tarde"}`;
}

/** "SEG 19/10 · Manhã (08h às 12h)" */
export function rotuloColeta(data: string | null | undefined, periodo?: PeriodoColeta | string | null) {
  if (!data) return "";
  const p = periodo && periodo in PERIODOS ? PERIODOS[periodo as PeriodoColeta] : null;
  return `${SIGLAS[diaSemana(data)]} ${data.slice(8, 10)}/${data.slice(5, 7)}${p ? ` · ${p.rotulo} (${p.faixa})` : ""}`;
}

type EnderecoUnidade = { logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null; cep?: string | null };
/** Endereço de coleta (a unidade da MF) numa linha. */
export function enderecoColeta(u?: EnderecoUnidade | null) {
  if (!u) return "";
  const cep = (u.cep ?? "").replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2");
  return [[u.logradouro, u.numero].filter(Boolean).join(", "), u.complemento, u.bairro, [u.municipio, u.uf].filter(Boolean).join("/"), cep && `CEP ${cep}`]
    .filter(Boolean).join(" · ");
}

/** Mensagem para pedir a coleta à transportadora (WhatsApp ou e-mail). */
export function mensagemColeta(e: Partial<Envio>, o: { data: string; periodo: PeriodoColeta; endereco?: string; urgente?: boolean; empresa?: string; nf?: string | null; obs?: string | null }) {
  const t = totaisCarga(e.volumes ?? []);
  const cep = (c?: string | null) => (c ? String(c).replace(/^(\d{5})(\d{3})$/, "$1-$2") : "—");
  const brl = (n?: number | null) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return [
    `Olá! Aqui é da *${o.empresa || "MF Máquinas"}*. Pode agendar uma coleta${o.urgente ? " *de urgência*" : ""}${e.numero ? ` (envio #${e.numero})` : ""}?`,
    `*Data:* ${rotuloColeta(o.data, o.periodo)}`,
    o.endereco ? `*Endereço de coleta:* ${o.endereco}` : "",
    `*Carga:* ${t.qtd} ${pl(t.qtd, "volume", "volumes")}, ${t.peso.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg, ${t.cubagem.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³`,
    `*Destino:* CEP ${cep(e.cep_destino)}${e.cidade_destino ? ` · ${e.cidade_destino}/${e.uf_destino ?? ""}` : ""}`,
    `*Valor da mercadoria:* ${brl(e.valor_mercadoria)}`,
    o.nf ? `*Nota fiscal:* ${o.nf}` : "",
    o.obs ? `*Observação:* ${o.obs}` : "",
    `Por favor, me confirme o número da coleta. Obrigado!`,
  ].filter(Boolean).join("\n");
}
