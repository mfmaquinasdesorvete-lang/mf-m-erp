// Handoff e ideias do ERP (Sobre o ERP Line): pendências com quem faz, decisões tomadas e ideias anotadas.
// Os itens ficam no banco (public.projeto_itens); aqui só as regras da tela. Funções puras.

export type TipoItem = "pendencia" | "ideia" | "decisao";
export type Responsavel = "empresa" | "claude" | "contador" | "advogado" | "fornecedor";
export type Prioridade = "alta" | "media" | "baixa";
export type Esforco = "pequeno" | "medio" | "grande";
export type SituacaoItem = "aberta" | "avaliando" | "planejada" | "andamento" | "aguardando" | "feita" | "descartada";

export type ItemProjeto = {
  id: string; tipo: TipoItem; titulo: string; detalhe: string | null; area: string; responsavel: Responsavel | null;
  prioridade: Prioridade; esforco: Esforco | null; situacao: SituacaoItem; prazo: string | null; motivo: string | null;
  votos: string[]; criado_por: string | null; criado_nome: string | null; concluido_em: string | null;
  atualizado_em: string; created_at: string;
};

export const RESPONSAVEIS: Responsavel[] = ["empresa", "claude", "contador", "advogado", "fornecedor"];
export const ROTULO_RESPONSAVEL: Record<Responsavel, string> = {
  empresa: "Empresa", claude: "Claude", contador: "Contador", advogado: "Advogado", fornecedor: "Fornecedor",
};
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const ROTULO_ESFORCO: Record<Esforco, string> = { pequeno: "Pequeno", medio: "Médio", grande: "Grande" };

/** Situações de cada tipo, na ordem do trabalho. */
export const SITUACOES: Record<TipoItem, SituacaoItem[]> = {
  pendencia: ["aberta", "andamento", "aguardando", "feita", "descartada"],
  ideia: ["aberta", "avaliando", "planejada", "feita", "descartada"],
  decisao: ["feita", "descartada"],
};
const ROTULOS: Record<TipoItem, Partial<Record<SituacaoItem, string>>> = {
  pendencia: { aberta: "A fazer", andamento: "Fazendo", aguardando: "Aguardando", feita: "Feita", descartada: "Descartada" },
  ideia: { aberta: "Nova", avaliando: "Em avaliação", planejada: "Planejada", feita: "Feita", descartada: "Descartada" },
  decisao: { feita: "Vale", descartada: "Revogada" },
};
export const rotuloSituacao = (tipo: TipoItem, s: SituacaoItem) => ROTULOS[tipo][s] ?? s;

/** Ainda em jogo (nem feita, nem descartada). */
export const ativo = (i: Pick<ItemProjeto, "situacao">) => i.situacao !== "feita" && i.situacao !== "descartada";
export const atrasada = (i: Pick<ItemProjeto, "tipo" | "situacao" | "prazo">, hoje: string) =>
  i.tipo === "pendencia" && ativo(i) && !!i.prazo && i.prazo < hoje;
/** Ideia que vale muito e dá pouco trabalho. */
export const ganhoRapido = (i: Pick<ItemProjeto, "tipo" | "prioridade" | "esforco">) =>
  i.tipo === "ideia" && i.prioridade !== "baixa" && i.esforco === "pequeno";

const PESO: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };
const PESO_ESFORCO: Record<Esforco, number> = { pequeno: 0, medio: 1, grande: 2 };
const cmp = (a: (string | number)[], b: (string | number)[]) => {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  return 0;
};

/** Pendências na ordem de fazer: ativas primeiro; atrasada, prioridade, "fazendo", prazo mais perto, a mais antiga. */
export function ordenarPendencias<T extends ItemProjeto>(l: T[], hoje: string): T[] {
  const chave = (i: T): (string | number)[] => [
    ativo(i) ? 0 : 1, atrasada(i, hoje) ? 0 : 1, i.situacao === "aguardando" ? 1 : 0, PESO[i.prioridade],
    i.situacao === "andamento" ? 0 : 1, i.prazo ?? "9999-12-31", ativo(i) ? i.created_at : `~${i.concluido_em ?? i.atualizado_em}`,
  ];
  const ord = [...l].sort((a, b) => cmp(chave(a), chave(b)));
  // feitas e descartadas: as mais recentes primeiro
  const fim = ord.filter((i) => !ativo(i)).sort((a, b) => (b.concluido_em ?? b.atualizado_em).localeCompare(a.concluido_em ?? a.atualizado_em));
  return [...ord.filter(ativo), ...fim];
}

/** O que dá para fazer agora (sem as que aguardam alguém), na ordem. */
export const proximosPassos = <T extends ItemProjeto>(l: T[], hoje: string, n = 5) =>
  ordenarPendencias(l.filter((i) => i.tipo === "pendencia" && ativo(i) && i.situacao !== "aguardando"), hoje).slice(0, n);

const diasAtras = (hoje: string, n: number) => {
  const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10);
};

export function indicadoresHandoff(itens: ItemProjeto[], hoje: string) {
  const pend = itens.filter((i) => i.tipo === "pendencia");
  const ativas = pend.filter(ativo);
  const porResponsavel = Object.fromEntries(RESPONSAVEIS.map((r) => [r, ativas.filter((i) => i.responsavel === r).length])) as Record<Responsavel, number>;
  const semana = diasAtras(hoje, 7);
  return {
    abertas: ativas.length,
    fazendo: ativas.filter((i) => i.situacao === "andamento").length,
    aguardando: ativas.filter((i) => i.situacao === "aguardando").length,
    alta: ativas.filter((i) => i.prioridade === "alta").length,
    atrasadas: ativas.filter((i) => atrasada(i, hoje)).length,
    porResponsavel,
    terceiros: porResponsavel.contador + porResponsavel.advogado + porResponsavel.fornecedor,
    feitasSemana: pend.filter((i) => i.situacao === "feita" && (i.concluido_em ?? "").slice(0, 10) >= semana).length,
    decisoes: itens.filter((i) => i.tipo === "decisao" && i.situacao === "feita").length,
    ideiasNovas: itens.filter((i) => i.tipo === "ideia" && i.situacao === "aberta").length,
  };
}

export type OrdemIdeias = "votos" | "ganho" | "recentes";
/** Ideias: mais votadas; ganho rápido (impacto alto e pouco esforço primeiro); ou as mais recentes. */
export function ordenarIdeias<T extends ItemProjeto>(l: T[], modo: OrdemIdeias): T[] {
  const esf = (i: T) => (i.esforco ? PESO_ESFORCO[i.esforco] : 1);
  const chave = (i: T): (string | number)[] =>
    modo === "votos" ? [-i.votos.length, PESO[i.prioridade], esf(i)]
    : modo === "ganho" ? [PESO[i.prioridade] + esf(i), PESO[i.prioridade], -i.votos.length]
    : [];
  const recente = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  return [...l].sort((a, b) => cmp(chave(a), chave(b)) || recente(a, b));
}

/**
 * Título da ideia para mostrar: tira o código do roteiro do começo ("ops-os · Backup diário:" → código "ops-os",
 * texto "Backup diário") e os dois-pontos que sobram no fim. O título gravado não muda.
 */
export function partesTituloIdeia(titulo: string): { codigo: string | null; texto: string } {
  const t = titulo.trim().replace(/\s*[:：]\s*$/, "");
  const m = /^([a-z]+-os)\s*[·\-–:]\s*(.+)$/i.exec(t);
  return m ? { codigo: m[1].toLowerCase(), texto: m[2] } : { codigo: null, texto: t };
}

export function indicadoresIdeias(ideias: ItemProjeto[]) {
  const conta = (s: SituacaoItem) => ideias.filter((i) => i.situacao === s).length;
  const ativas = ideias.filter(ativo);
  const maisVotada = ordenarIdeias(ativas.filter((i) => i.votos.length > 0), "votos")[0] ?? null;
  return {
    ativas: ativas.length, novas: conta("aberta"), avaliando: conta("avaliando"), planejadas: conta("planejada"),
    feitas: conta("feita"), descartadas: conta("descartada"), ganhoRapido: ativas.filter(ganhoRapido).length, maisVotada,
  };
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Texto do handoff para colar no WhatsApp, num e-mail ou numa conversa com o Claude. */
export function textoHandoff(itens: ItemProjeto[], hoje: string, versao?: { numero: string; hash: string } | null) {
  const ind = indicadoresHandoff(itens, hoje);
  const pend = ordenarPendencias(itens.filter((i) => i.tipo === "pendencia" && ativo(i)), hoje);
  const linha = (i: ItemProjeto) =>
    `- [${ROTULO_PRIORIDADE[i.prioridade]}] ${i.titulo}${i.prazo ? ` (prazo ${dm(i.prazo)})` : ""}${i.situacao === "andamento" ? " — fazendo" : ""}`
    + `${i.situacao === "aguardando" ? ` — aguardando ${i.motivo ?? ""}`.trimEnd() : ""}${atrasada(i, hoje) ? " — ATRASADA" : ""}`;
  const out = [
    `Handoff do ERP Line · ${dm(hoje)}/${hoje.slice(0, 4)}`,
    versao ? `Versão ${versao.numero} (código ${versao.hash})` : "",
    "",
    `Situação: ${ind.abertas} pendências abertas (${ind.alta} de alta prioridade, ${ind.atrasadas} atrasadas, ${ind.aguardando} aguardando).`,
    RESPONSAVEIS.filter((r) => ind.porResponsavel[r]).map((r) => `${ROTULO_RESPONSAVEL[r]}: ${ind.porResponsavel[r]}`).join(" · "),
  ];
  const passos = proximosPassos(itens, hoje);
  if (passos.length) {
    out.push("", "Próximos passos");
    passos.forEach((i, k) => out.push(`${k + 1}. ${i.titulo} (${ROTULO_RESPONSAVEL[i.responsavel ?? "empresa"]}, ${ROTULO_PRIORIDADE[i.prioridade].toLowerCase()})`));
  }
  for (const r of RESPONSAVEIS) {
    const doR = pend.filter((i) => i.responsavel === r);
    if (doR.length) out.push("", `Com ${r === "empresa" ? "a" : "o"} ${ROTULO_RESPONSAVEL[r].toLowerCase()} (${doR.length})`, ...doR.map(linha));
  }
  const decisoes = itens.filter((i) => i.tipo === "decisao" && i.situacao === "feita");
  if (decisoes.length) out.push("", "Decisões em vigor", ...decisoes.map((i) => `- ${i.titulo}`));
  const ideias = ordenarIdeias(itens.filter((i) => i.tipo === "ideia" && ativo(i)), "votos").slice(0, 5);
  if (ideias.length) out.push("", "Ideias em aberto", ...ideias.map((i) => `- ${i.titulo}${i.votos.length ? ` (${i.votos.length} ${i.votos.length === 1 ? "voto" : "votos"})` : ""}`));
  return out.filter((l, k, a) => !(l === "" && a[k - 1] === "")).join("\n").trim();
}
