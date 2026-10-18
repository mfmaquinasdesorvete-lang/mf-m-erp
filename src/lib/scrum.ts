// Scrum por equipe (Gestão → Scrum): contas sem tela — dias úteis da sprint, burndown, velocidade, previsão do
// backlog, ritmo da sprint e ordem do backlog. As tabelas são scrum_times, scrum_sprints, scrum_itens e scrum_daily.

export type StatusItem = "a_fazer" | "fazendo" | "revisao" | "feito";
export type TipoItem = "historia" | "tarefa" | "bug" | "melhoria";
export type StatusSprint = "planejada" | "ativa" | "encerrada";

export type TimeScrum = {
  id: string; nome: string; cor: string; descricao: string | null; sprint_dias: number; membros: string[];
  dono_produto: string | null; scrum_master: string | null; ordem: number; ativo: boolean;
};
export type Sprint = {
  id: string; time_id: string; numero: number; objetivo: string | null; inicio: string; fim: string; status: StatusSprint;
  pontos_planejados: number | null; pontos_feitos: number | null; revisao: string | null;
  retro_bom: string | null; retro_melhorar: string | null; retro_acoes: string | null; encerrada_em: string | null;
};
/** Tarefa da lista do item */
export type Tarefa = { texto: string; feito: boolean };
/** Caso de teste do item: ok = true passou, false falhou, null ainda não testado */
export type CasoTeste = { nome: string; passos: string[]; esperado: string[]; ok: boolean | null };
export type ItemScrum = {
  id: string; time_id: string; sprint_id: string | null; tipo: TipoItem; titulo: string; descricao: string | null;
  criterio_aceite: string | null; pontos: number | null; prioridade: number; status: StatusItem; responsavel_id: string | null;
  ideia_id: string | null; created_by: string | null; concluido_em: string | null; created_at: string;
  /** lista de tarefas, cenários (Dado/Quando/Então) e casos de teste — o assistente do item ajuda a montar */
  tarefas?: Tarefa[]; cenarios?: string | null; testes?: CasoTeste[];
};
export type ComentarioScrum = { id: string; item_id: string; user_id: string; texto: string; created_at: string };

/** Tarefas feitas / total (null sem lista) */
export const progressoTarefas = (i: Pick<ItemScrum, "tarefas">) =>
  i.tarefas?.length ? { feitas: i.tarefas.filter((t) => t.feito).length, total: i.tarefas.length } : null;
export type Daily = {
  id: string; sprint_id: string; user_id: string; nome: string | null; dia: string;
  fiz: string | null; vou_fazer: string | null; impedimentos: string | null; impedimento_resolvido: boolean;
};

/** Pontos de esforço (Fibonacci): quanto maior, mais incerteza. 0 = trivial. */
export const FIBONACCI = [0, 1, 2, 3, 5, 8, 13, 21] as const;

export const COLUNAS: { id: StatusItem; titulo: string; dica: string }[] = [
  { id: "a_fazer", titulo: "A fazer", dica: "combinado na sprint, ninguém pegou" },
  { id: "fazendo", titulo: "Fazendo", dica: "alguém está trabalhando" },
  { id: "revisao", titulo: "Revisão", dica: "pronto, falta conferir o critério de aceite" },
  { id: "feito", titulo: "Feito", dica: "atende ao critério de aceite" },
];
export const ROTULO_STATUS: Record<StatusItem, string> = { a_fazer: "A fazer", fazendo: "Fazendo", revisao: "Revisão", feito: "Feito" };
export const ROTULO_TIPO: Record<TipoItem, string> = { historia: "História", tarefa: "Tarefa", bug: "Problema", melhoria: "Melhoria" };
export const ROTULO_SPRINT: Record<StatusSprint, string> = { planejada: "Planejada", ativa: "Em andamento", encerrada: "Encerrada" };

const MS_DIA = 864e5;
const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const somarDiasISO = (dia: string, n: number) => iso(new Date(paraData(dia).getTime() + n * MS_DIA));
const fimDeSemana = (dia: string) => { const s = paraData(dia).getUTCDay(); return s === 0 || s === 6; };

/** Dia de Brasília de um horário (concluido_em vem com fuso). */
export const diaBrasilia = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Dias úteis (segunda a sexta) de `inicio` a `fim`, inclusive. Sprint só de fim de semana fica com os dias corridos. */
export function diasDaSprint(inicio: string, fim: string): string[] {
  const todos: string[] = [];
  for (let d = inicio; d <= fim && todos.length < 400; d = somarDiasISO(d, 1)) todos.push(d);
  const uteis = todos.filter((d) => !fimDeSemana(d));
  return uteis.length ? uteis : todos;
}

/** Dias úteis da sprint que ainda faltam (hoje entra; no fim de semana do último dia útil, zero) */
export const diasRestantes = (s: Pick<Sprint, "inicio" | "fim">, hoje: string) =>
  diasDaSprint(s.inicio, s.fim).filter((d) => d >= hoje).length;

export const somaPontos = (itens: Pick<ItemScrum, "pontos">[]) => itens.reduce((t, i) => t + (i.pontos ?? 0), 0);

/**
 * Burndown da sprint por dia útil: linha ideal (dos pontos do início até zero) e o que faltava no fim de cada dia
 * (só até hoje). Sprint em andamento usa o escopo de agora (item que entrou no meio conta); encerrada, os pontos do início.
 * O item concluído no fim de semana conta no dia útil seguinte.
 */
export function burndown(s: Sprint, itensDaSprint: ItemScrum[], hoje: string) {
  const dias = diasDaSprint(s.inicio, s.fim);
  const escopo = somaPontos(itensDaSprint);
  const base = s.status === "encerrada" ? (s.pontos_planejados ?? escopo) : Math.max(escopo, 0);
  const inicial = s.pontos_planejados ?? base;
  const passo = dias.length > 1 ? inicial / (dias.length - 1) : inicial;
  const ideal = dias.map((_, i) => Math.max(0, Math.round((inicial - passo * i) * 10) / 10));
  const feitos = itensDaSprint.filter((i) => i.status === "feito" && i.concluido_em).map((i) => ({ dia: diaBrasilia(i.concluido_em!), pontos: i.pontos ?? 0 }));
  const real = dias.map((d) => (d > hoje ? null : base - feitos.filter((f) => f.dia <= d).reduce((t, f) => t + f.pontos, 0)));
  return { dias, ideal, real, inicial, escopo: base };
}

/**
 * Ritmo da sprint em andamento: parte dos pontos feita × parte do tempo que passou.
 * "atrasada" quando o feito está 15 pontos percentuais (ou mais) atrás do tempo.
 */
export function ritmoSprint(s: Sprint, itensDaSprint: ItemScrum[], hoje: string) {
  const dias = diasDaSprint(s.inicio, s.fim);
  const passados = dias.filter((d) => d < hoje).length;
  const tempo = dias.length ? passados / dias.length : 0;
  const total = somaPontos(itensDaSprint);
  const feito = somaPontos(itensDaSprint.filter((i) => i.status === "feito"));
  const progresso = total ? feito / total : 0;
  const situacao: "no_ritmo" | "atrasada" | "adiantada" | "sem_pontos" =
    !total ? "sem_pontos" : progresso + 0.15 < tempo ? "atrasada" : progresso > tempo + 0.15 ? "adiantada" : "no_ritmo";
  return { tempo, progresso, total, feito, situacao };
}

/** Velocidade: média dos pontos feitos nas últimas `n` sprints encerradas (mais novas primeiro na lista). */
export function velocidade(sprints: Sprint[], n = 3) {
  const encerradas = sprints.filter((s) => s.status === "encerrada").sort((a, b) => b.numero - a.numero);
  const ultimas = encerradas.slice(0, n);
  const media = ultimas.length ? Math.round(ultimas.reduce((t, s) => t + (s.pontos_feitos ?? 0), 0) / ultimas.length) : null;
  const entrega = ultimas.length
    ? ultimas.reduce((t, s) => t + (s.pontos_feitos ?? 0), 0) / Math.max(1, ultimas.reduce((t, s) => t + (s.pontos_planejados ?? 0), 0))
    : null;
  return { media, entrega, historico: encerradas.slice(0, 8).reverse() };
}

/** Quantas sprints o backlog leva na velocidade de agora (null sem velocidade). */
export const sprintsParaBacklog = (pontos: number, media: number | null) => (media && media > 0 ? Math.ceil(pontos / media) : null);

/** Planejamento acima da capacidade: mais de 20% acima da velocidade média. */
export const acimaDaCapacidade = (pontos: number, media: number | null) => !!media && pontos > media * 1.2;

/** Próxima sprint da equipe: número seguinte e datas a partir do dia depois da última (ou hoje). */
export function proximaSprint(time: Pick<TimeScrum, "sprint_dias">, sprints: Sprint[], hoje: string) {
  const numero = Math.max(0, ...sprints.map((s) => s.numero)) + 1;
  const ultimoFim = sprints.reduce<string | null>((m, s) => (!m || s.fim > m ? s.fim : m), null);
  const depois = ultimoFim ? somarDiasISO(ultimoFim, 1) : hoje;
  const inicio = depois > hoje ? depois : hoje;
  return { numero, inicio, fim: somarDiasISO(inicio, time.sprint_dias - 1) };
}

/** Backlog na ordem de prioridade (menor número primeiro; empate: o mais antigo). */
export const ordenarBacklog = <T extends Pick<ItemScrum, "prioridade" | "created_at">>(itens: T[]) =>
  [...itens].sort((a, b) => a.prioridade - b.prioridade || a.created_at.localeCompare(b.created_at));

/**
 * Sobe ou desce um item no backlog: devolve só as prioridades que mudam (de 10 em 10, na ordem nova).
 */
export function moverNoBacklog<T extends Pick<ItemScrum, "id" | "prioridade" | "created_at">>(itens: T[], id: string, direcao: -1 | 1) {
  const lista = ordenarBacklog(itens);
  const i = lista.findIndex((x) => x.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return [];
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista.map((x, k) => ({ id: x.id, prioridade: (k + 1) * 10 })).filter((n) => itens.find((x) => x.id === n.id)!.prioridade !== n.prioridade);
}

/** Prioridade para o item novo ir para o fim do backlog. */
export const prioridadeNoFim = (itens: Pick<ItemScrum, "prioridade">[]) => Math.max(0, ...itens.map((i) => i.prioridade)) + 10;

/** Daily do dia: quem respondeu, quem falta (dos membros) e os impedimentos ainda abertos da sprint. */
export function resumoDaily(dailies: Daily[], membros: string[], dia: string) {
  const doDia = dailies.filter((d) => d.dia === dia);
  const responderam = new Set(doDia.map((d) => d.user_id));
  const faltam = membros.filter((m) => !responderam.has(m));
  const impedimentos = dailies.filter((d) => d.impedimentos?.trim() && !d.impedimento_resolvido).sort((a, b) => b.dia.localeCompare(a.dia));
  return { doDia, faltam, impedimentos };
}

/** Pontos feitos e em aberto por pessoa na sprint (sem responsável fica em "") */
export function pontosPorPessoa(itensDaSprint: ItemScrum[]) {
  const m = new Map<string, { feito: number; aberto: number }>();
  for (const i of itensDaSprint) {
    const k = i.responsavel_id ?? "";
    const p = m.get(k) ?? { feito: 0, aberto: 0 };
    if (i.status === "feito") p.feito += i.pontos ?? 0; else p.aberto += i.pontos ?? 0;
    m.set(k, p);
  }
  return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.feito + b.aberto - (a.feito + a.aberto));
}

/** Iniciais para o avatar ("Maria Souza" → "MS") */
export const iniciais = (nome: string | null | undefined) =>
  (nome ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
