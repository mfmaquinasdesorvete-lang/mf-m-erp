// Teste do giga (registro de qualidade REG-006): contas sem tela, usadas no lançamento, no painel, no PDF e nos testes.
// Resultado geral, sugestão de aprovado/reprovado pelo limite, primeira passagem (first pass yield), retestes,
// agrupamentos por mês, modelo e operador, linhas do REG-006 e da planilha.
// Os limites são da empresa: o ERP só compara. Ensaios de segurança elétrica de aparelhos seguem a família IEC/NBR 60335.

export type Resultado = "aprovado" | "reprovado";
export type ResultadoGeral = "aprovada" | "reprovada";
export type TipoTeste = "funcional" | "aterramento" | "tensao";

export const TIPOS_TESTE: { id: TipoTeste; rotulo: string; curto: string }[] = [
  { id: "funcional", rotulo: "Funcional", curto: "Funcional" },
  { id: "aterramento", rotulo: "Continuidade do aterramento", curto: "Cont. aterram." },
  { id: "tensao", rotulo: "Tensão suportável", curto: "Tensão suport." },
];
export const rotuloTipo = (t: TipoTeste) => TIPOS_TESTE.find((x) => x.id === t)?.rotulo ?? t;

/** Cabeçalho do formulário de papel (o texto da revisão muda em Configurações). */
export const REG006 = { codigo: "REG-006", titulo: "TESTE DO GIGA" } as const;

/* ------------------------------------ Limites ------------------------------------ */

export type Parametros = {
  aterramento_resistencia_max_ohm: number | null;
  aterramento_corrente_a: number | null;
  tensao_v: number | null;
  tensao_tempo_s: number | null;
  tensao_fuga_max_ma: number | null;
};
export type CampoParametro = keyof Parametros;
export const PARAMETROS_VAZIOS: Parametros = {
  aterramento_resistencia_max_ohm: null, aterramento_corrente_a: null, tensao_v: null, tensao_tempo_s: null, tensao_fuga_max_ma: null,
};

/**
 * Campos dos limites. `tipico` é só o exemplo que aparece apagado no campo: NÃO é limite de norma.
 * Os valores de verdade são da empresa (confirmar com o responsável técnico).
 */
export const CAMPOS_PARAMETRO: { campo: CampoParametro; teste: Exclude<TipoTeste, "funcional">; rotulo: string; unidade: string; tipico: string }[] = [
  { campo: "aterramento_resistencia_max_ohm", teste: "aterramento", rotulo: "Resistência máxima", unidade: "Ω", tipico: "0,1" },
  { campo: "aterramento_corrente_a", teste: "aterramento", rotulo: "Corrente de teste", unidade: "A", tipico: "10" },
  { campo: "tensao_v", teste: "tensao", rotulo: "Tensão de ensaio", unidade: "V", tipico: "1.000" },
  { campo: "tensao_tempo_s", teste: "tensao", rotulo: "Tempo", unidade: "s", tipico: "1" },
  { campo: "tensao_fuga_max_ma", teste: "tensao", rotulo: "Corrente de fuga máxima", unidade: "mA", tipico: "5" },
];

export type ParametroCadastro = Partial<Parametros> & { id?: string; produto_id: string | null; ativo?: boolean | null; observacao?: string | null };
export type OrigemParametro = "modelo" | "geral" | null;

/** Limites que valem para o modelo: campo a campo, o do modelo ou, sem ele, o padrão geral. */
export function parametrosDoModelo(lista: ParametroCadastro[], produtoId: string | null | undefined) {
  const ativos = lista.filter((p) => p.ativo !== false);
  const geral = ativos.find((p) => !p.produto_id);
  const modelo = produtoId ? ativos.find((p) => p.produto_id === produtoId) : undefined;
  const valores = { ...PARAMETROS_VAZIOS };
  const origem = {} as Record<CampoParametro, OrigemParametro>;
  for (const { campo } of CAMPOS_PARAMETRO) {
    const m = numero(modelo?.[campo]), g = numero(geral?.[campo]);
    valores[campo] = m ?? g;
    origem[campo] = m != null ? "modelo" : g != null ? "geral" : null;
  }
  return { valores, origem, temAlgum: Object.values(valores).some((v) => v != null) };
}

/* ------------------------------------ Números ------------------------------------ */

const numero = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Número digitado no jeito brasileiro: "0,08", "0.08", "1.250" (milhar), "1.250,5". Vazio = null; texto inválido = NaN.
 * Ponto sozinho é decimal ("1.5"), menos no milhar com 3 casas e sem zero na frente ("1.250" = 1250; "0.080" = 0,08).
 */
export function lerNumero(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : Number.NaN;
  let s = v.replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

/** 0.08 → "0,08" · 1250 → "1.250" (até 4 casas, sem zeros sobrando). */
export const fmtNum = (v: number | null | undefined) =>
  v == null || !Number.isFinite(Number(v)) ? "" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

/* ------------------------------ Resultado e sugestão ------------------------------ */

type TresResultados = { funcional?: Resultado | null; aterramento?: Resultado | null; tensao?: Resultado | null };

/** Aprovada só com os três testes aprovados; null enquanto falta marcar algum. */
export function resultadoGeral(t: TresResultados): ResultadoGeral | null {
  const r = [t.funcional, t.aterramento, t.tensao];
  if (r.some((x) => x !== "aprovado" && x !== "reprovado")) return null;
  return r.every((x) => x === "aprovado") ? "aprovada" : "reprovada";
}

/** Testes reprovados (na ordem do formulário). */
export const falhas = (t: TresResultados): TipoTeste[] => TIPOS_TESTE.filter((x) => t[x.id] === "reprovado").map((x) => x.id);

export type Sugestao = { sugestao: Resultado | null; motivo: string | null; alertas: string[] };

/** Continuidade do aterramento: aprovado até a resistência máxima. Corrente abaixo da de teste vira alerta. */
export function sugerirAterramento(resistencia: number | null, corrente: number | null, p: Parametros): Sugestao {
  const max = p.aterramento_resistencia_max_ohm;
  const alertas: string[] = [];
  if (corrente != null && p.aterramento_corrente_a != null && corrente < p.aterramento_corrente_a) {
    alertas.push(`Corrente de ${fmtNum(corrente)} A abaixo da corrente de teste (${fmtNum(p.aterramento_corrente_a)} A)`);
  }
  if (resistencia == null || Number.isNaN(resistencia) || max == null) return { sugestao: null, motivo: null, alertas };
  const passou = resistencia <= max;
  return { sugestao: passou ? "aprovado" : "reprovado", motivo: `${fmtNum(resistencia)} Ω ${passou ? "≤" : ">"} limite de ${fmtNum(max)} Ω`, alertas };
}

/** Tensão suportável: aprovado até a corrente de fuga máxima. Tensão ou tempo abaixo do ensaio viram alerta. */
export function sugerirTensao(aplicada: number | null, tempo: number | null, fuga: number | null, p: Parametros): Sugestao {
  const max = p.tensao_fuga_max_ma;
  const alertas: string[] = [];
  if (aplicada != null && p.tensao_v != null && aplicada < p.tensao_v) alertas.push(`Tensão de ${fmtNum(aplicada)} V abaixo da tensão de ensaio (${fmtNum(p.tensao_v)} V)`);
  if (tempo != null && p.tensao_tempo_s != null && tempo < p.tensao_tempo_s) alertas.push(`Tempo de ${fmtNum(tempo)} s abaixo do tempo de ensaio (${fmtNum(p.tensao_tempo_s)} s)`);
  if (fuga == null || Number.isNaN(fuga) || max == null) return { sugestao: null, motivo: null, alertas };
  const passou = fuga <= max;
  return { sugestao: passou ? "aprovado" : "reprovado", motivo: `fuga de ${fmtNum(fuga)} mA ${passou ? "≤" : ">"} limite de ${fmtNum(max)} mA`, alertas };
}

/** Medida fora do limite marcada como aprovada (o banco pede a explicação nas observações). Mesmo texto do banco. */
export function divergencias(t: {
  aterramento?: Resultado | null; tensao?: Resultado | null; aterramento_resistencia_ohm?: number | null; tensao_fuga_ma?: number | null;
}, p: Parametros): string[] {
  const d: string[] = [];
  const r = numero(t.aterramento_resistencia_ohm), f = numero(t.tensao_fuga_ma);
  if (t.aterramento === "aprovado" && r != null && p.aterramento_resistencia_max_ohm != null && r > p.aterramento_resistencia_max_ohm) {
    d.push(`Continuidade do aterramento aprovada com ${fmtNum(r)} Ω (limite ${fmtNum(p.aterramento_resistencia_max_ohm)} Ω)`);
  }
  if (t.tensao === "aprovado" && f != null && p.tensao_fuga_max_ma != null && f > p.tensao_fuga_max_ma) {
    d.push(`Tensão suportável aprovada com fuga de ${fmtNum(f)} mA (limite ${fmtNum(p.tensao_fuga_max_ma)} mA)`);
  }
  return d;
}

/* --------------------------------- Número de série --------------------------------- */

/** NS como o banco grava: maiúsculas, sem espaços nas pontas e espaços repetidos viram um. */
export const normalizarNs = (ns: string | null | undefined) => String(ns ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/** Números de série da OP ("T-001, T-002; T-003"), sem repetir. */
export function nsDaOp(texto: string | null | undefined): string[] {
  return [...new Set(String(texto ?? "").split(/[,;\n\r]+/).map(normalizarNs).filter(Boolean))];
}

/* ------------------------------------- Testes ------------------------------------- */

export type TesteGiga = {
  id: string; numero: number; testado_em: string; produto_id: string; numero_serie: string; operador_nome: string;
  funcional: Resultado; aterramento: Resultado; tensao: Resultado; resultado?: ResultadoGeral | null;
  unidade_id?: string | null; ordem_producao_id?: string | null; operador_funcionario_id?: string | null; operador_user_id?: string | null;
  aterramento_resistencia_ohm?: number | null; aterramento_corrente_a?: number | null;
  tensao_aplicada_v?: number | null; tensao_tempo_s?: number | null; tensao_fuga_ma?: number | null;
  giga?: string | null; observacoes?: string | null; reteste_de?: string | null; tentativa?: number | null;
  parametros?: Record<string, unknown> | null; divergencias?: string[] | null; marcadores?: string[] | null;
  anulado_em?: string | null; anulado_motivo?: string | null; criado_por_nome?: string | null; criado_em?: string | null;
};

/** Resultado gravado pelo banco ou, se faltar, calculado. */
export const resultadoDe = (t: TesteGiga): ResultadoGeral => t.resultado ?? resultadoGeral(t) ?? "reprovada";
export const aprovada = (t: TesteGiga) => resultadoDe(t) === "aprovada";

/** Data no horário de Brasília (sem horário de verão desde 2019): "2026-10-16T01:30:00Z" → "2026-10-15". */
export function diaBrasil(iso: string | null | undefined): string {
  if (!iso) return "";
  if (iso.length <= 10) return iso;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso.slice(0, 10) : new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
}
export const mesBrasil = (iso: string | null | undefined) => diaBrasil(iso).slice(0, 7);
/** "16/10/2026 14:05" no horário de Brasília. */
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t - 3 * 3600e3).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`;
}

/** Só os testes que valem (os anulados ficam no histórico, fora das contas). */
export const validos = <T extends { anulado_em?: string | null }>(testes: T[]) => testes.filter((t) => !t.anulado_em);

const porData = (a: TesteGiga, b: TesteGiga) => a.testado_em.localeCompare(b.testado_em) || a.numero - b.numero;

/** Testes válidos de cada NS, do primeiro ao último. */
export function historicoPorNs(testes: TesteGiga[]): Map<string, TesteGiga[]> {
  const m = new Map<string, TesteGiga[]>();
  for (const t of validos(testes)) {
    const ns = normalizarNs(t.numero_serie);
    m.set(ns, [...(m.get(ns) ?? []), t]);
  }
  for (const l of m.values()) l.sort(porData);
  return m;
}

export type SituacaoMaquina = { ns: string; primeiro: TesteGiga; ultimo: TesteGiga; aprovado: TesteGiga | null; tentativas: number; aguardandoReteste: boolean };

export function situacaoMaquina(ns: string, historico: TesteGiga[]): SituacaoMaquina {
  const ultimo = historico[historico.length - 1];
  const aprovado = [...historico].reverse().find(aprovada) ?? null;
  return { ns, primeiro: historico[0], ultimo, aprovado, tentativas: historico.length, aguardandoReteste: !aprovada(ultimo) };
}

/** Máquinas cujo último teste foi reprovado: esperam o reteste (a mais antiga primeiro). */
export function aguardandoReteste(testes: TesteGiga[]): SituacaoMaquina[] {
  return [...historicoPorNs(testes)].map(([ns, h]) => situacaoMaquina(ns, h)).filter((s) => s.aguardandoReteste)
    .sort((a, b) => a.ultimo.testado_em.localeCompare(b.ultimo.testado_em));
}

/** Ids dos primeiros testes de cada NS (para a aprovação de primeira). */
export function primeirosTestes(todos: TesteGiga[]): Set<string> {
  return new Set([...historicoPorNs(todos).values()].map((h) => h[0].id));
}

type Faixa = [string, string];
const naFaixa = (t: TesteGiga, f?: Faixa) => !f || (diaBrasil(t.testado_em) >= f[0] && diaBrasil(t.testado_em) <= f[1]);

/**
 * Aprovadas de primeira (first pass yield): das máquinas testadas pela primeira vez no período, quantas passaram
 * no primeiro teste. Os retestes não entram na conta.
 */
export function primeiraPassagem(todos: TesteGiga[], faixa?: Faixa) {
  const primeiros = [...historicoPorNs(todos).values()].map((h) => h[0]).filter((t) => naFaixa(t, faixa));
  const dePrimeira = primeiros.filter(aprovada).length;
  return { maquinas: primeiros.length, dePrimeira, pct: primeiros.length ? (dePrimeira / primeiros.length) * 100 : null };
}

/** Quantas vezes cada teste reprovou (um teste com duas falhas conta nas duas). */
export function reprovacoesPorTipo(testes: TesteGiga[]): Record<TipoTeste, number> {
  const r: Record<TipoTeste, number> = { funcional: 0, aterramento: 0, tensao: 0 };
  for (const t of validos(testes)) for (const f of falhas(t)) r[f]++;
  return r;
}

/** Os `n` meses (AAAA-MM) que terminam em `mes`. */
export function mesesAte(mes: string, n: number): string[] {
  const [a, m] = mes.slice(0, 7).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = a * 12 + (m - 1) - (n - 1 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}

/** Aprovadas × reprovadas por mês (testes válidos, retestes incluídos). */
export function serieMensal(testes: TesteGiga[], meses: string[]) {
  const m = new Map(meses.map((x) => [x, { mes: x, aprovadas: 0, reprovadas: 0 }]));
  for (const t of validos(testes)) {
    const linha = m.get(mesBrasil(t.testado_em));
    if (linha) aprovada(t) ? linha.aprovadas++ : linha.reprovadas++;
  }
  return [...m.values()];
}

export type Grupo = { chave: string; rotulo: string; testes: number; aprovadas: number; reprovadas: number; maquinas: number; primeiros: number; dePrimeira: number; fpy: number | null };

/**
 * Agrupa os testes (por modelo, operador…). `primeiros` vem de primeirosTestes(todos): a aprovação de primeira do
 * grupo conta só os primeiros testes de cada máquina feitos no grupo.
 */
export function agrupar(testes: TesteGiga[], chave: (t: TesteGiga) => string, rotulo: (k: string) => string, primeiros: Set<string>): Grupo[] {
  const m = new Map<string, Grupo & { ns: Set<string> }>();
  for (const t of validos(testes)) {
    const k = chave(t);
    const g = m.get(k) ?? { chave: k, rotulo: rotulo(k), testes: 0, aprovadas: 0, reprovadas: 0, maquinas: 0, primeiros: 0, dePrimeira: 0, fpy: null, ns: new Set<string>() };
    g.testes++;
    aprovada(t) ? g.aprovadas++ : g.reprovadas++;
    g.ns.add(normalizarNs(t.numero_serie));
    if (primeiros.has(t.id)) { g.primeiros++; if (aprovada(t)) g.dePrimeira++; }
    m.set(k, g);
  }
  return [...m.values()].map(({ ns, ...g }) => ({ ...g, maquinas: ns.size, fpy: g.primeiros ? (g.dePrimeira / g.primeiros) * 100 : null }))
    .sort((a, b) => b.testes - a.testes || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

export type FiltroTestes = {
  de?: string; ate?: string; produtoId?: string; ns?: string; operador?: string; resultado?: ResultadoGeral | "";
  /** inclui os anulados (para conferir o histórico) */
  anulados?: boolean;
};

export function filtrarTestes(testes: TesteGiga[], f: FiltroTestes): TesteGiga[] {
  const ns = normalizarNs(f.ns);
  const op = String(f.operador ?? "").trim().toLowerCase();
  return testes.filter((t) => (f.anulados || !t.anulado_em)
    && (!f.de || diaBrasil(t.testado_em) >= f.de) && (!f.ate || diaBrasil(t.testado_em) <= f.ate)
    && (!f.produtoId || t.produto_id === f.produtoId)
    && (!ns || normalizarNs(t.numero_serie).includes(ns))
    && (!op || t.operador_nome.toLowerCase() === op)
    && (!f.resultado || resultadoDe(t) === f.resultado))
    .sort((a, b) => porData(b, a));
}

/* ----------------------------- REG-006 (PDF) e planilha ----------------------------- */

const ROTULO_RES: Record<Resultado, string> = { aprovado: "Aprovado", reprovado: "Reprovado" };
const juntar = (...partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(" · ");

/** Medidas do aterramento: "0,05 Ω · 10 A". */
export const medidasAterramento = (t: TesteGiga) =>
  juntar(t.aterramento_resistencia_ohm != null && `${fmtNum(t.aterramento_resistencia_ohm)} Ω`, t.aterramento_corrente_a != null && `${fmtNum(t.aterramento_corrente_a)} A`);
/** Medidas da tensão suportável: "1.250 V · 1 s · 0,8 mA". */
export const medidasTensao = (t: TesteGiga) =>
  juntar(t.tensao_aplicada_v != null && `${fmtNum(t.tensao_aplicada_v)} V`, t.tensao_tempo_s != null && `${fmtNum(t.tensao_tempo_s)} s`,
    t.tensao_fuga_ma != null && `${fmtNum(t.tensao_fuga_ma)} mA`);

export type LinhaReg006 = {
  data: string; maquina: string; ns: string; operador: string; funcional: string; aterramento: string; tensao: string; observacoes: string;
  reprovados: TipoTeste[]; anulado: boolean;
};

/** Uma linha do formulário REG-006: as mesmas colunas do papel. */
export function linhaReg006(t: TesteGiga, maquina: string, numeroDe?: (id: string) => number | null | undefined): LinhaReg006 {
  const ant = t.reteste_de ? numeroDe?.(t.reteste_de) : null;
  const med = (r: Resultado, m: string) => (m ? `${ROTULO_RES[r]}\n${m}` : ROTULO_RES[r]);
  return {
    data: dataHoraBR(t.testado_em), maquina, ns: t.numero_serie, operador: t.operador_nome,
    funcional: ROTULO_RES[t.funcional], aterramento: med(t.aterramento, medidasAterramento(t)), tensao: med(t.tensao, medidasTensao(t)),
    observacoes: juntar(
      t.anulado_em && `ANULADO: ${t.anulado_motivo ?? ""}`,
      (t.tentativa ?? 1) > 1 && `Reteste (${t.tentativa}ª tentativa${ant ? `, do nº ${ant}` : ""})`,
      t.observacoes, t.giga && `Giga ${t.giga}`, ...(t.divergencias ?? [])),
    reprovados: falhas(t), anulado: !!t.anulado_em,
  };
}

/** Planilha com todos os campos (uma linha por teste). */
export function planilhaTestes(testes: TesteGiga[], ctx: {
  maquina: (id: string) => string; unidade?: (id: string | null | undefined) => string; op?: (id: string | null | undefined) => string | number | null;
  numeroDe?: (id: string) => number | null | undefined;
}): Record<string, unknown>[] {
  const n = (v: number | null | undefined) => (v == null ? "" : Number(v));
  return testes.map((t) => ({
    "Nº": t.numero, Data: dataHoraBR(t.testado_em), Unidade: ctx.unidade?.(t.unidade_id) ?? "", Máquina: ctx.maquina(t.produto_id), NS: t.numero_serie,
    OP: (t.ordem_producao_id && ctx.op?.(t.ordem_producao_id)) || "", Operador: t.operador_nome,
    Funcional: ROTULO_RES[t.funcional], "Cont. aterramento": ROTULO_RES[t.aterramento], "Resistência (Ω)": n(t.aterramento_resistencia_ohm),
    "Corrente de teste (A)": n(t.aterramento_corrente_a), "Tensão suportável": ROTULO_RES[t.tensao], "Tensão aplicada (V)": n(t.tensao_aplicada_v),
    "Tempo (s)": n(t.tensao_tempo_s), "Corrente de fuga (mA)": n(t.tensao_fuga_ma), Resultado: resultadoDe(t) === "aprovada" ? "Aprovada" : "Reprovada",
    Tentativa: t.tentativa ?? 1, "Reteste do nº": (t.reteste_de && ctx.numeroDe?.(t.reteste_de)) || "", Giga: t.giga ?? "",
    Observações: t.observacoes ?? "", "Fora do limite": (t.divergencias ?? []).join("; "),
    "Lançado por": t.criado_por_nome ?? "", "Lançado em": t.criado_em ? dataHoraBR(t.criado_em) : "",
    Anulado: t.anulado_em ? `${dataHoraBR(t.anulado_em)} · ${t.anulado_motivo ?? ""}` : "",
  }));
}

/* ------------------------ Rastreabilidade (ficha da máquina e OP) ------------------------ */

/** Linha de teste_giga_situacao: o resumo do teste de um NS. */
export type SituacaoNs = {
  numero_serie: string; testes: number; ultimo_numero: number | null; ultimo_em: string | null; ultimo_resultado: ResultadoGeral | null;
  ultimo_operador: string | null; ultimo_falhas: TipoTeste[] | null; aprovado_numero: number | null; aprovado_em: string | null; aprovado_operador: string | null;
};

export type Selo = { tom: "aprovada" | "reprovada" | "sem"; texto: string; detalhe: string };

/** Texto curto do teste do NS: "Giga aprovada em 16/10/2026", "Giga reprovada: aguardando reteste" ou "sem teste do giga". */
export function seloGiga(s: SituacaoNs | null | undefined): Selo {
  if (!s || !s.testes) return { tom: "sem", texto: "Sem teste do giga", detalhe: "Nenhum teste do giga (REG-006) para este número de série" };
  if (s.aprovado_numero != null) {
    const dia = s.aprovado_em ? dataHoraBR(s.aprovado_em).slice(0, 10) : "";
    return {
      tom: "aprovada", texto: `Giga aprovada${dia ? ` em ${dia}` : ""}`,
      detalhe: juntar(`Teste nº ${s.aprovado_numero}`, s.aprovado_operador && `operador ${s.aprovado_operador}`, s.testes > 1 && `${s.testes} testes`),
    };
  }
  const f = (s.ultimo_falhas ?? []).map(rotuloTipo).join(", ");
  return {
    tom: "reprovada", texto: "Giga reprovada: aguardando reteste",
    detalhe: juntar(s.ultimo_numero != null && `Teste nº ${s.ultimo_numero}`, s.ultimo_em && dataHoraBR(s.ultimo_em), s.ultimo_operador && `operador ${s.ultimo_operador}`, f && `reprovou em: ${f}`),
  };
}

/** NS da lista sem teste aprovado (para o aviso ao concluir a OP). */
export function nsSemAprovacao(ns: string[], situacoes: SituacaoNs[]): string[] {
  const ok = new Set(situacoes.filter((s) => s.aprovado_numero != null).map((s) => normalizarNs(s.numero_serie)));
  return ns.map(normalizarNs).filter((x) => x && !ok.has(x));
}

/** Aviso ao concluir a OP (não bloqueia). null = tudo testado e aprovado. */
export function avisoConclusaoOp(numerosSerie: string | null | undefined, situacoes: SituacaoNs[] | null): string | null {
  const ns = nsDaOp(numerosSerie);
  if (!ns.length) return "Esta OP não tem número de série: não dá para conferir o teste do giga (REG-006).";
  if (!situacoes) return null;
  const faltam = nsSemAprovacao(ns, situacoes);
  if (!faltam.length) return null;
  const lista = faltam.slice(0, 6).join(", ") + (faltam.length > 6 ? ` e mais ${faltam.length - 6}` : "");
  return `${faltam.length === 1 ? "1 máquina está" : `${faltam.length} máquinas estão`} sem teste do giga aprovado: ${lista}.`;
}
