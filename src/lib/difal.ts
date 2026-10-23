// DIFAL por estado (Analista fiscal → DIFAL por estado): as vendas para outro estado a quem não é contribuinte de ICMS,
// vindas do banco (difal_vendas_interestaduais, lido do XML das notas). Aqui ficam só as contas da tela: por estado,
// nos últimos 12 meses e no total, o DIFAL destacado na nota x o estimado, e as guias pagas a outros estados.

export type GrupoDifal = "sem_ie" | "isento" | "ie_baixada";
export type LinhaDifal = {
  nota_id: string; numero: string | null; emissao: string | null; unidade_id: string | null; uf: string; grupo: GrupoDifal;
  valor: number | string; difal_destacado: number | string; difal_estimado: number | string;
};

export const GRUPOS_DIFAL: Record<GrupoDifal, { rotulo: string; dica: string }> = {
  sem_ie: { rotulo: "Sem inscrição estadual", dica: "pessoa física ou empresa sem IE: o DIFAL é da MF" },
  isento: { rotulo: "Isento de IE", dica: "em geral também paga DIFAL (confirmar com o contador)" },
  ie_baixada: { rotulo: "IE baixada hoje", dica: "saiu como contribuinte; só há risco se a IE já estava baixada no dia da venda" },
};

export type EstadoDifal = {
  uf: string; notas12: number; valor12: number; estimado12: number; meses12: number;
  notas: number; valor: number; estimado: number; destacado: number; outrosNotas: number; outrosEstimado: number;
};

const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const menosUmAno = (dia: string) => `${Number(dia.slice(0, 4)) - 1}${dia.slice(4)}`;

/** Por estado: os "sem IE" são o DIFAL certo da MF (12 meses e tudo); isentos e IE baixada vão à parte (a conferir). */
export function difalPorEstado(linhas: LinhaDifal[], hoje: string) {
  const desde = menosUmAno(hoje);
  const mapa = new Map<string, EstadoDifal & { mesesSet: Set<string> }>();
  for (const l of linhas) {
    const e = mapa.get(l.uf) ?? { uf: l.uf, notas12: 0, valor12: 0, estimado12: 0, meses12: 0, notas: 0, valor: 0, estimado: 0, destacado: 0, outrosNotas: 0, outrosEstimado: 0, mesesSet: new Set<string>() };
    if (l.grupo === "sem_ie") {
      e.notas++; e.valor += n(l.valor); e.estimado += n(l.difal_estimado); e.destacado += n(l.difal_destacado);
      if ((l.emissao ?? "") >= desde) { e.notas12++; e.valor12 += n(l.valor); e.estimado12 += n(l.difal_estimado); e.mesesSet.add((l.emissao ?? "").slice(0, 7)); }
    } else { e.outrosNotas++; e.outrosEstimado += n(l.difal_estimado); }
    mapa.set(l.uf, e);
  }
  const estados: EstadoDifal[] = [...mapa.values()].map(({ mesesSet, ...e }) => ({
    ...e, meses12: mesesSet.size, valor12: r2(e.valor12), estimado12: r2(e.estimado12), valor: r2(e.valor), estimado: r2(e.estimado),
    destacado: r2(e.destacado), outrosEstimado: r2(e.outrosEstimado),
  })).sort((a, b) => b.estimado12 - a.estimado12 || b.estimado - a.estimado);
  const soma = (k: keyof EstadoDifal) => r2(estados.reduce((t, e) => t + Number(e[k]), 0));
  const grupos = (Object.keys(GRUPOS_DIFAL) as GrupoDifal[]).map((g) => {
    const doGrupo = linhas.filter((l) => l.grupo === g);
    return { grupo: g, notas: doGrupo.length, valor: r2(doGrupo.reduce((t, l) => t + n(l.valor), 0)), estimado: r2(doGrupo.reduce((t, l) => t + n(l.difal_estimado), 0)) };
  });
  return {
    estados, grupos,
    total: { notas12: soma("notas12"), valor12: soma("valor12"), estimado12: soma("estimado12"), notas: soma("notas"), valor: soma("valor"), estimado: soma("estimado"), destacado: soma("destacado") },
  };
}

type ContaImposto = { descricao?: string | null; categoria?: string | null; valor: number | string; valor_pago?: number | string | null; status: string };

/** Guias de ICMS pagas a outros estados (GNRE/DIFAL ou secretaria de fazenda de fora de SC), achadas em Contas a pagar. */
export function guiasOutrosEstados(contas: ContaImposto[]) {
  const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const guias = contas.filter((c) => {
    const d = sem(c.descricao ?? "");
    if (c.status !== "pago" || /santa catarina|\bdare\b/.test(d)) return false;
    return /\b(gnre|difal)\b/.test(d) || (sem(c.categoria ?? "").includes("imposto") && /governo do estado|secretaria (de estado )?da fazenda|\bsefaz\b/.test(d));
  });
  return { quantidade: guias.length, valor: r2(guias.reduce((t, c) => t + n(c.valor_pago ?? c.valor), 0)) };
}
