// Decisão de pagamento das contas a pagar: "pagar" (aprovada), "agendado" (pagar em tal dia) ou "nao_pagar"
// (segurada, com motivo). Sem decisão = a decidir. Funções puras (sem React, sem Supabase).

export type Decisao = "pagar" | "agendado" | "nao_pagar";
export type ContaDecisao = {
  id: string; valor: number; vencimento: string; status: string; unidade_id?: string | null;
  decisao?: Decisao | null; pagar_em?: string | null; decisao_motivo?: string | null; decisao_por_nome?: string | null; decisao_em?: string | null;
  /** fornecedor marcado como golpe: o banco segura a conta como "não pagar" */
  fornecedor?: { bloqueado?: boolean | null; bloqueio_motivo?: string | null } | null;
  /** fluxo de aprovação: só paga (ou agenda) depois de "aprovado" ("historico" = anterior ao fluxo) */
  revisao?: string | null;
};
export type FiltroDecisao = "todas" | "decidir" | "hoje" | "agendadas" | "nao_pagar";
export type Tom = "ok" | "agenda" | "parada" | "decidir" | "atrasada" | "golpe";

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Em que dia a conta deve sair do caixa: o dia escolhido; sem decisão, o vencimento. */
export const diaDoPagamento = (c: ContaDecisao) => (c.status === "aberto" && c.decisao !== "nao_pagar" && c.pagar_em) || c.vencimento;

/** Em aberto e ainda sem a aprovação (em revisão, devolvida): o banco não deixa pagar, agendar nem dar baixa. */
export const aguardaAprovacao = (c: ContaDecisao) => c.status === "aberto" && !!c.revisao && c.revisao !== "aprovado" && c.revisao !== "historico";
export const TEXTO_FALTA_APROVAR = "Falta a aprovação: só dá para pagar ou agendar depois que a conta for aprovada (Financeiro → Aprovações)";

/** Aprovadas/agendadas para hoje ou antes, ainda em aberto e já aprovadas no fluxo: o que o financeiro paga hoje. */
export const paraPagarHoje = <T extends ContaDecisao>(l: T[], hoje: string) =>
  l.filter((c) => c.status === "aberto" && (c.decisao === "pagar" || c.decisao === "agendado") && (c.pagar_em ?? "") <= hoje && !aguardaAprovacao(c));

export const aDecidir = <T extends ContaDecisao>(l: T[]) => l.filter((c) => c.status === "aberto" && !c.decisao);

export function filtrarDecisao<T extends ContaDecisao>(l: T[], f: FiltroDecisao, hoje: string): T[] {
  if (f === "todas") return l;
  if (f === "decidir") return aDecidir(l);
  if (f === "hoje") return paraPagarHoje(l, hoje);
  if (f === "agendadas") return l.filter((c) => c.status === "aberto" && (c.decisao === "agendado" || c.decisao === "pagar") && (c.pagar_em ?? "") > hoje);
  return l.filter((c) => c.status === "aberto" && c.decisao === "nao_pagar");
}

/** Por que não pagar: o motivo do bloqueio do fornecedor (golpe) ou o que quem decidiu escreveu. */
export const motivoNaoPagar = (c: ContaDecisao) => (c.fornecedor?.bloqueado ? c.fornecedor.bloqueio_motivo : c.decisao_motivo) ?? null;

/** Rótulo curto da decisão para mostrar na lista. */
export function rotuloDecisao(c: ContaDecisao, hoje: string): { texto: string; tom: Tom; dica: string } | null {
  if (c.status !== "aberto") return null;
  if (c.fornecedor?.bloqueado) return { texto: "Golpe · não pagar", tom: "golpe", dica: c.fornecedor.bloqueio_motivo ?? "Fornecedor bloqueado: não pagar" };
  const quem = [c.decisao_por_nome, c.decisao_em && `${dm(c.decisao_em.slice(0, 10))}`].filter(Boolean).join(" em ");
  const por = quem ? ` (decidido por ${quem})` : "";
  if (!c.decisao) {
    return c.vencimento < hoje
      ? { texto: "Vencida, a decidir", tom: "atrasada", dica: "Escolha: pagar, agendar ou não pagar" }
      : { texto: "A decidir", tom: "decidir", dica: "Escolha: pagar, agendar ou não pagar" };
  }
  if (c.decisao === "nao_pagar") return { texto: "Não pagar", tom: "parada", dica: `${c.decisao_motivo ?? ""}${por}` };
  const d = c.pagar_em ?? c.vencimento;
  if (aguardaAprovacao(c)) return { texto: `${c.decisao === "agendado" ? `Agendada ${dm(d)}` : "Decidida"} · falta aprovar`, tom: "decidir", dica: TEXTO_FALTA_APROVAR };
  if (d <= hoje) return { texto: "Pagar hoje", tom: "ok", dica: `${c.decisao === "agendado" ? "Agendada" : "Aprovada"} para ${dm(d)}${por}` };
  return { texto: c.decisao === "agendado" ? `Agendada ${dm(d)}` : `Aprovada · ${dm(d)}`, tom: "agenda", dica: `Pagar em ${dm(d)}${por}` };
}

export const COR_TOM: Record<Tom, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  agenda: "bg-sky-100 text-sky-800",
  parada: "bg-slate-200 text-slate-700",
  decidir: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  atrasada: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  golpe: "bg-solido-vermelho text-white",
};

/** Conta a pagar como entra no fluxo de caixa previsto: na data escolhida; as "não pagar" ficam fora. */
export const paraFluxo = <T extends ContaDecisao>(l: T[]) =>
  l.filter((c) => !(c.status === "aberto" && c.decisao === "nao_pagar")).map((c) => (c.status === "aberto" && c.pagar_em ? { ...c, vencimento: c.pagar_em } : c));

/** Contas do lote agrupadas por unidade (cada grupo sai de uma conta bancária da própria unidade). */
export function gruposPorUnidade<T extends ContaDecisao>(l: T[]) {
  const m = new Map<string, T[]>();
  for (const c of l) {
    const k = c.unidade_id ?? "";
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return [...m.entries()].map(([unidade_id, contas]) => ({ unidade_id: unidade_id || null, contas, total: Math.round(contas.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100 }));
}

// ---------------------------------------------------------------------------------------------------------------
// Lista de contas a pagar: as visões (abas com contagem) e uma situação só por conta, em palavras.

export type VisaoPagar = "para_pagar" | "vencidas" | "semana" | "decidir" | "falta_aprovar" | "agendadas" | "nao_pagar" | "pagas" | "todas";
export const VISOES_PAGAR: { v: VisaoPagar; rotulo: string }[] = [
  { v: "para_pagar", rotulo: "Para pagar" }, { v: "vencidas", rotulo: "Vencidas" }, { v: "semana", rotulo: "Próximos 7 dias" },
  { v: "decidir", rotulo: "A decidir" }, { v: "falta_aprovar", rotulo: "Falta aprovar" }, { v: "agendadas", rotulo: "Programadas" },
  { v: "nao_pagar", rotulo: "Não pagar" }, { v: "pagas", rotulo: "Pagas" }, { v: "todas", rotulo: "Todas" },
];
type ContaLista = ContaDecisao & { data_pagamento?: string | null };

const somaDias = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** Segurada: "não pagar" escolhido ou fornecedor marcado como golpe. */
export const contaParada = (c: ContaDecisao) => c.status === "aberto" && (c.decisao === "nao_pagar" || !!c.fornecedor?.bloqueado);

export function naVisaoPagar(c: ContaLista, v: VisaoPagar, hoje: string): boolean {
  const aberta = c.status === "aberto", ativa = aberta && !contaParada(c);
  switch (v) {
    case "para_pagar": return ativa;
    case "vencidas": return ativa && diaDoPagamento(c) < hoje;
    case "semana": return ativa && diaDoPagamento(c) >= hoje && diaDoPagamento(c) <= somaDias(hoje, 7);
    case "decidir": return ativa && !c.decisao;
    case "falta_aprovar": return ativa && aguardaAprovacao(c);
    case "agendadas": return ativa && (c.decisao === "pagar" || c.decisao === "agendado");
    case "nao_pagar": return contaParada(c);
    case "pagas": return c.status === "pago";
    default: return c.status !== "cancelado";
  }
}

/** A situação da conta numa etiqueta só (e uma linha de explicação quando ajuda). */
export function situacaoPagar(c: ContaLista, hoje: string): { texto: string; tom: Tom; sub?: string | null } {
  if (c.status === "pago") return { texto: c.data_pagamento ? `Paga em ${dm(c.data_pagamento)}` : "Paga", tom: "ok" };
  if (c.status === "cancelado") return { texto: "Cancelada", tom: "parada" };
  if (c.fornecedor?.bloqueado) return { texto: "Golpe · não pagar", tom: "golpe", sub: c.fornecedor.bloqueio_motivo ?? null };
  if (c.decisao === "nao_pagar") return { texto: "Não pagar", tom: "parada", sub: [c.decisao_motivo, c.decisao_por_nome && `por ${c.decisao_por_nome}`].filter(Boolean).join(" · ") || null };
  const d = diaDoPagamento(c);
  if (aguardaAprovacao(c)) return { texto: "Falta aprovar", tom: "decidir", sub: d < hoje ? `venceu há ${diasEntre(d, hoje)} ${diasEntre(d, hoje) === 1 ? "dia" : "dias"}` : null };
  if (c.decisao === "pagar" || c.decisao === "agendado") {
    if (d <= hoje) return { texto: "Pagar hoje", tom: "ok", sub: d < hoje ? `programada para ${dm(d)}` : null };
    return { texto: `${c.decisao === "agendado" ? "Agendada" : "Programada"} ${dm(d)}`, tom: "agenda" };
  }
  const n = diasEntre(hoje, c.vencimento);
  if (n < 0) return { texto: `Vencida há ${-n} ${n === -1 ? "dia" : "dias"}`, tom: "atrasada", sub: "a decidir" };
  if (n === 0) return { texto: "Vence hoje", tom: "decidir", sub: "a decidir" };
  return { texto: "A decidir", tom: "decidir", sub: n <= 7 ? `vence em ${n} ${n === 1 ? "dia" : "dias"}` : null };
}

// ---------------------------------------------------------------------------------------------------------------
// Quadro (Kanban) das contas a pagar: cada conta numa coluna, na ordem do caminho até o pagamento. Arrastar para outra
// coluna faz a ação que a coluna pede, com as mesmas travas da lista (aprovação, golpe, motivo do "não pagar").

export type ColunaPagar = "decidir" | "aprovar" | "programadas" | "hoje" | "pagas" | "nao_pagar";
/**
 * As colunas na ordem do caminho (passo 1 a 5; "não pagar" fica fora do caminho), com o que é e o que fazer. O cabeçalho
 * e a aba têm cor forte (`fundo`, degradê) com a letra `tinta` (contraste conferido); `corpo` é o fundo claro da coluna,
 * em classe inteira para o Tailwind gerar (muda com o tema).
 */
export const COLUNAS_PAGAR: {
  id: ColunaPagar; passo: number | null; rotulo: string; dica: string; explica: string; fazer: string; cor: string;
  fundo: string; tinta: string; corpo: string;
}[] = [
  { id: "aprovar", passo: 1, rotulo: "Falta aprovar", dica: "Esperando a aprovação (Financeiro → Aprovações)", cor: "#7c3aed",
    explica: "Conta nova esperando o ok de quem aprova.", fazer: "Quem aprova toca em Aprovar ou Não.",
    fundo: "linear-gradient(135deg,#7c3aed 0%,#6d28d9 55%,#5b21b6 100%)", tinta: "#ffffff", corpo: "bg-purple-50/50" },
  { id: "decidir", passo: 2, rotulo: "A decidir", dica: "Ninguém escolheu ainda: pagar, agendar ou não pagar", cor: "#f59e0b",
    explica: "Aprovada, mas ninguém escolheu quando pagar.", fazer: "Escolha: pagar no vencimento, outro dia ou não pagar.",
    fundo: "linear-gradient(135deg,#fde047 0%,#fbbf24 45%,#f59e0b 100%)", tinta: "#3b1d02", corpo: "bg-amber-50/50" },
  { id: "programadas", passo: 3, rotulo: "Programadas", dica: "Aprovadas para um dia que ainda não chegou", cor: "#0ea5e9",
    explica: "Aprovadas e com o dia do pagamento marcado.", fazer: "Nada a fazer até o dia (dá para mudar o dia).",
    fundo: "linear-gradient(135deg,#67e8f9 0%,#38bdf8 50%,#0ea5e9 100%)", tinta: "#062c43", corpo: "bg-sky-50/50" },
  { id: "hoje", passo: 4, rotulo: "Pagar hoje", dica: "O dia chegou: pagar e registrar o pagamento", cor: "#10b981",
    explica: "O dia de pagar chegou (ou já passou).", fazer: "Pague no banco e toque em Registrar pagamento.",
    fundo: "linear-gradient(135deg,#6ee7b7 0%,#34d399 45%,#10b981 100%)", tinta: "#022c1e", corpo: "bg-emerald-50/50" },
  { id: "pagas", passo: 5, rotulo: "Pagas", dica: "Pagamento registrado (últimos 30 dias)", cor: "#475569",
    explica: "Pagamento registrado nos últimos 30 dias.", fazer: "O recibo fica no cartão da conta.",
    fundo: "linear-gradient(135deg,#64748b 0%,#475569 60%,#334155 100%)", tinta: "#ffffff", corpo: "bg-slate-50/80" },
  { id: "nao_pagar", passo: null, rotulo: "Não pagar", dica: "Seguradas com motivo, ou fornecedor marcado como golpe", cor: "#e11d48",
    explica: "Seguradas com motivo, ou fornecedor golpe.", fazer: "Toque em Retomar quando o motivo se resolver.",
    fundo: "linear-gradient(135deg,#e11d48 0%,#be123c 55%,#9f1239 100%)", tinta: "#ffffff", corpo: "bg-red-50/50" },
];

/** Em que coluna do quadro a conta fica; null = fora do quadro (cancelada). */
export function colunaPagar(c: ContaLista, hoje: string): ColunaPagar | null {
  if (c.status === "cancelado") return null;
  if (c.status === "pago") return "pagas";
  if (c.status !== "aberto") return null;
  if (contaParada(c)) return "nao_pagar";
  if (aguardaAprovacao(c)) return "aprovar";
  if (c.decisao === "pagar" || c.decisao === "agendado") return diaDoPagamento(c) <= hoje ? "hoje" : "programadas";
  return "decidir";
}

export type AcaoArrastar = "limpar" | "pagar_hoje" | "agendar" | "nao_pagar" | "registrar";
/** O que acontece ao soltar a conta na coluna: a ação, ou o motivo de não poder (null = mesma coluna, nada a fazer). */
export function soltarNaColuna(c: ContaLista, destino: ColunaPagar, hoje: string): { acao: AcaoArrastar } | { motivo: string } | null {
  const origem = colunaPagar(c, hoje);
  if (!origem || origem === destino) return null;
  if (c.status !== "aberto") return { motivo: "Conta já paga: para desfazer, use \"Estornar o pagamento\" no menu da conta" };
  if (c.fornecedor?.bloqueado) return { motivo: "Fornecedor marcado como golpe: a conta fica em \"Não pagar\"" };
  if (destino === "aprovar") return { motivo: "A conta vai para aprovação sozinha; quem aprova é Financeiro → Aprovações" };
  if (destino === "decidir") return { acao: "limpar" };
  if (destino === "nao_pagar") return { acao: "nao_pagar" };
  if (aguardaAprovacao(c)) return { motivo: TEXTO_FALTA_APROVAR };
  if (destino === "hoje") return { acao: "pagar_hoje" };
  if (destino === "programadas") return { acao: "agendar" };
  return { acao: "registrar" };
}
