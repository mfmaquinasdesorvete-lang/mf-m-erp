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
  /** renegociação: "acordo" = a conta que vale no acordo; "original" = a trocada (cancelada) */
  negociacao_id?: string | null; negociacao_papel?: string | null;
  /** lançada por uma conta fixa */
  recorrente_id?: string | null;
};
export type FiltroDecisao = "todas" | "decidir" | "hoje" | "agendadas" | "nao_pagar";
export type Tom = "paga" | "hoje" | "agenda" | "parada" | "decidir" | "atrasada" | "golpe";

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Em que dia a conta deve sair do caixa: o dia escolhido; sem decisão, o vencimento. */
export const diaDoPagamento = (c: ContaDecisao) => (c.status === "aberto" && c.decisao !== "nao_pagar" && c.pagar_em) || c.vencimento;

/** Em aberto e ainda sem a aprovação (em revisão, devolvida): o banco não deixa pagar, agendar nem dar baixa. */
export const aguardaAprovacao = (c: ContaDecisao) => c.status === "aberto" && !!c.revisao && c.revisao !== "aprovado" && c.revisao !== "historico";
export const TEXTO_FALTA_APROVAR = "Falta a aprovação: aprove a conta (no próprio cartão ou em Financeiro → Aprovações) antes de pagar ou agendar";

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
  if (d < hoje) return { texto: `Atrasada · ${dm(d)}`, tom: "atrasada", dica: `Era para pagar em ${dm(d)}${por}` };
  if (d === hoje) return { texto: "Pagar hoje", tom: "hoje", dica: `${c.decisao === "agendado" ? "Agendada" : "Aprovada"} para hoje${por}` };
  return { texto: c.decisao === "agendado" ? `Agendada ${dm(d)}` : `Aprovada · ${dm(d)}`, tom: "agenda", dica: `Pagar em ${dm(d)}${por}` };
}

/**
 * Código de cores das contas a pagar (o mesmo do quadro): a decidir laranja, programada azul, pagar hoje amarelo,
 * atrasada vermelho, não pagar roxo escuro, paga verde. Amarelo e roxo são fixos (não mudam com o tema).
 */
export const COR_TOM: Record<Tom, string> = {
  paga: "bg-emerald-100 text-emerald-800",
  hoje: "bg-[#fde047] text-[#422006]",
  agenda: "bg-blue-100 text-blue-800",
  parada: "bg-[#3b0764] text-white",
  decidir: "bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-200",
  atrasada: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
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
// Situações das contas a pagar (lista e quadro; no código, "passos"): cada conta numa situação só, com o código de cores da equipe:
// 1 a decidir (laranja; a aprovação vem junto), 2 programadas (azul), 2.1 pagar hoje (amarelo), 2.2 atrasadas
// (vermelho), 2.3 não pagar (roxo escuro) e 3 pagas (verde). À parte: renegociadas, contas fixas e todas.

export type PassoPagar = "decidir" | "programadas" | "hoje" | "atrasadas" | "nao_pagar" | "pagas";
export type VisaoPagar = PassoPagar | "renegociadas" | "fixas" | "todas";

/**
 * Os passos na ordem, com o que é e o que fazer. O cabeçalho e a aba têm cor forte (`fundo`, degradê) com a letra
 * `tinta` (contraste conferido); `corpo` é o fundo claro da coluna, em classe inteira para o Tailwind gerar.
 */
export const PASSOS_PAGAR: {
  id: PassoPagar; passo: string; rotulo: string; dica: string; explica: string; fazer: string; cor: string;
  fundo: string; tinta: string; corpo: string;
}[] = [
  { id: "decidir", passo: "1", rotulo: "A decidir", cor: "#f97316", dica: "Aprovar (quando pede) e escolher: pagar, agendar ou não pagar",
    explica: "Conta nova ou sem dia marcado. A aprovação vem junto.", fazer: "Aprovar e decidir",
    fundo: "linear-gradient(135deg,#fdba74 0%,#fb923c 50%,#f97316 100%)", tinta: "#431407", corpo: "bg-orange-50/60" },
  { id: "programadas", passo: "2", rotulo: "Programadas", cor: "#2563eb", dica: "Aprovadas para um dia que ainda não chegou",
    explica: "Aprovadas e com o dia do pagamento marcado.", fazer: "Esperar o dia",
    fundo: "linear-gradient(135deg,#2563eb 0%,#1d4ed8 60%,#1e40af 100%)", tinta: "#ffffff", corpo: "bg-blue-50/60" },
  { id: "hoje", passo: "2.1", rotulo: "Pagar hoje", cor: "#facc15", dica: "O dia chegou: pagar e registrar o pagamento",
    explica: "O dia de pagar é hoje.", fazer: "Pagar e registrar",
    fundo: "linear-gradient(135deg,#fef08a 0%,#fde047 50%,#facc15 100%)", tinta: "#422006", corpo: "bg-amber-50/60" },
  { id: "atrasadas", passo: "2.2", rotulo: "Atrasadas", cor: "#dc2626", dica: "O dia programado passou e o pagamento não foi registrado",
    explica: "O dia programado passou e ninguém registrou o pagamento.", fazer: "Pagar ou mudar o dia",
    fundo: "linear-gradient(135deg,#dc2626 0%,#b91c1c 60%,#991b1b 100%)", tinta: "#ffffff", corpo: "bg-red-50/60" },
  { id: "nao_pagar", passo: "2.3", rotulo: "Não pagar", cor: "#3b0764", dica: "Seguradas com motivo, ou fornecedor marcado como golpe",
    explica: "Seguradas com motivo, ou fornecedor golpe.", fazer: "Retomar quando resolver",
    fundo: "linear-gradient(135deg,#581c87 0%,#4c1d95 50%,#3b0764 100%)", tinta: "#ffffff", corpo: "bg-purple-50/60" },
  { id: "pagas", passo: "3", rotulo: "Pagas", cor: "#22c55e", dica: "Pagamento registrado",
    explica: "Pagamento registrado (no quadro, os últimos 30 dias).", fazer: "Recibo no cartão",
    fundo: "linear-gradient(135deg,#86efac 0%,#4ade80 45%,#22c55e 100%)", tinta: "#052e16", corpo: "bg-emerald-50/60" },
];

/** Renegociadas: turquesa + laranja */
export const COR_RENEGOCIADA = { fundo: "linear-gradient(135deg,#2dd4bf 0%,#14b8a6 55%,#fb923c 100%)", tinta: "#042f2e" };

export const VISOES_PAGAR: { v: VisaoPagar; rotulo: string }[] = [
  ...PASSOS_PAGAR.map((p) => ({ v: p.id, rotulo: `${p.passo} · ${p.rotulo}` })),
  { v: "renegociadas", rotulo: "Renegociadas" }, { v: "fixas", rotulo: "Contas fixas" }, { v: "todas", rotulo: "Todas" },
];
type ContaLista = ContaDecisao & { data_pagamento?: string | null };

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** Segurada: "não pagar" escolhido ou fornecedor marcado como golpe. */
export const contaParada = (c: ContaDecisao) => c.status === "aberto" && (c.decisao === "nao_pagar" || !!c.fornecedor?.bloqueado);
/** Conta que vale num acordo de renegociação (a trocada pelo acordo fica cancelada e some daqui) */
export const contaRenegociada = (c: ContaDecisao) => !!c.negociacao_id && c.negociacao_papel === "acordo" && c.status !== "cancelado";

/** Em que passo a conta está; null = fora (cancelada). A decidir junta a que falta aprovar e a sem dia escolhido. */
export function passoPagar(c: ContaLista, hoje: string): PassoPagar | null {
  if (c.status === "cancelado") return null;
  if (c.status === "pago") return "pagas";
  if (c.status !== "aberto") return null;
  if (contaParada(c)) return "nao_pagar";
  if (aguardaAprovacao(c) || !(c.decisao === "pagar" || c.decisao === "agendado")) return "decidir";
  const d = diaDoPagamento(c);
  return d > hoje ? "programadas" : d === hoje ? "hoje" : "atrasadas";
}

export function naVisaoPagar(c: ContaLista, v: VisaoPagar, hoje: string): boolean {
  if (v === "todas") return c.status !== "cancelado";
  if (v === "renegociadas") return contaRenegociada(c);
  if (v === "fixas") return !!c.recorrente_id && c.status === "aberto";
  return passoPagar(c, hoje) === v;
}

/** A situação da conta numa etiqueta só (e uma linha de explicação quando ajuda). */
export function situacaoPagar(c: ContaLista, hoje: string): { texto: string; tom: Tom; sub?: string | null } {
  if (c.status === "pago") return { texto: c.data_pagamento ? `Paga em ${dm(c.data_pagamento)}` : "Paga", tom: "paga" };
  if (c.status === "cancelado") return { texto: "Cancelada", tom: "parada" };
  if (c.fornecedor?.bloqueado) return { texto: "Golpe · não pagar", tom: "golpe", sub: c.fornecedor.bloqueio_motivo ?? null };
  if (c.decisao === "nao_pagar") return { texto: "Não pagar", tom: "parada", sub: [c.decisao_motivo, c.decisao_por_nome && `por ${c.decisao_por_nome}`].filter(Boolean).join(" · ") || null };
  const d = diaDoPagamento(c);
  if (aguardaAprovacao(c)) return { texto: "Falta aprovar", tom: d < hoje ? "atrasada" : "decidir", sub: d < hoje ? `venceu há ${diasEntre(d, hoje)} ${diasEntre(d, hoje) === 1 ? "dia" : "dias"}` : null };
  if (c.decisao === "pagar" || c.decisao === "agendado") {
    if (d === hoje) return { texto: "Pagar hoje", tom: "hoje" };
    if (d < hoje) return { texto: `Atrasada há ${diasEntre(d, hoje)} ${diasEntre(d, hoje) === 1 ? "dia" : "dias"}`, tom: "atrasada", sub: `programada para ${dm(d)}` };
    return { texto: `${c.decisao === "agendado" ? "Agendada" : "Programada"} ${dm(d)}`, tom: "agenda" };
  }
  const n = diasEntre(hoje, c.vencimento);
  if (n < 0) return { texto: `Vencida há ${-n} ${n === -1 ? "dia" : "dias"}`, tom: "atrasada", sub: "a decidir" };
  if (n === 0) return { texto: "Vence hoje", tom: "decidir", sub: "a decidir" };
  return { texto: "A decidir", tom: "decidir", sub: n <= 7 ? `vence em ${n} ${n === 1 ? "dia" : "dias"}` : null };
}

// ---------------------------------------------------------------------------------------------------------------
// Quadro (Kanban): uma coluna por passo. Arrastar para outra coluna faz a ação que a coluna pede, com as mesmas
// travas da lista (aprovação, golpe, motivo do "não pagar"); "atrasadas" não recebe conta (é o dia que passou).

/** nomes antigos (o quadro e os testes usavam "coluna") */
export type ColunaPagar = PassoPagar;
export const COLUNAS_PAGAR = PASSOS_PAGAR;
export const colunaPagar = passoPagar;

export type AcaoArrastar = "limpar" | "pagar_hoje" | "agendar" | "nao_pagar" | "registrar";
/** O que acontece ao soltar a conta na coluna: a ação, ou o motivo de não poder (null = mesma coluna, nada a fazer). */
export function soltarNaColuna(c: ContaLista, destino: PassoPagar, hoje: string): { acao: AcaoArrastar } | { motivo: string } | null {
  const origem = passoPagar(c, hoje);
  if (!origem || origem === destino) return null;
  if (c.status !== "aberto") return { motivo: "Conta já paga: para desfazer, use \"Estornar o pagamento\" no menu da conta" };
  if (c.fornecedor?.bloqueado) return { motivo: "Fornecedor marcado como golpe: a conta fica em \"Não pagar\"" };
  if (destino === "decidir") return { acao: "limpar" };
  if (destino === "nao_pagar") return { acao: "nao_pagar" };
  if (destino === "atrasadas") return { motivo: "A conta fica atrasada sozinha quando o dia programado passa. Para pagar hoje, solte em \"Pagar hoje\"" };
  if (aguardaAprovacao(c)) return { motivo: TEXTO_FALTA_APROVAR };
  if (destino === "hoje") return { acao: "pagar_hoje" };
  if (destino === "programadas") return { acao: "agendar" };
  return { acao: "registrar" };
}
