// Contas a pagar como no Tiny (e melhor): de onde veio cada conta, qual data vale no período, a série de contas de uma
// ocorrência (parcelada, semanal, mensal…), o mês de competência para o DRE e a lista agrupada por fornecedor.

export type CodigoOrigem = "nf" | "st" | "oc" | "cte" | "frete" | "fixa" | "comissao" | "extrato" | "infinitepay" | "olist" | "tiny" | "manual" | "outro";

/** Uma linha da visão contas_pagar_origem. */
export type OrigemConta = {
  id: string; origem: CodigoOrigem; nf_numero: string | null; oc_numero: string | null;
  envio_numero: string | null; fatura_numero: string | null; emissao_efetiva: string | null;
};

export const ORIGENS: Record<CodigoOrigem, { sigla: string; rotulo: string; cor: string }> = {
  nf: { sigla: "NF", rotulo: "Nota de fornecedor", cor: "bg-sky-100 text-sky-800" },
  st: { sigla: "ST", rotulo: "Serviço tomado", cor: "bg-teal-100 text-teal-800" },
  oc: { sigla: "OC", rotulo: "Ordem de compra", cor: "bg-violet-100 text-violet-800" },
  cte: { sigla: "CT-e", rotulo: "Fatura de CT-e", cor: "bg-amber-100 text-amber-900" },
  frete: { sigla: "Frete", rotulo: "Frete de envio", cor: "bg-amber-100 text-amber-900" },
  fixa: { sigla: "Fixa", rotulo: "Conta fixa", cor: "bg-emerald-100 text-emerald-800" },
  comissao: { sigla: "Comissão", rotulo: "Comissão de venda", cor: "bg-pink-100 text-pink-800" },
  extrato: { sigla: "Extrato", rotulo: "Lançada do extrato do banco", cor: "bg-slate-100 text-slate-700" },
  infinitepay: { sigla: "InfinitePay", rotulo: "Taxa da InfinitePay", cor: "bg-slate-100 text-slate-700" },
  olist: { sigla: "Olist", rotulo: "Olist", cor: "bg-slate-100 text-slate-700" },
  tiny: { sigla: "Tiny", rotulo: "Veio do Tiny", cor: "bg-slate-100 text-slate-700" },
  manual: { sigla: "Manual", rotulo: "Lançada à mão", cor: "bg-slate-100 text-slate-700" },
  outro: { sigla: "Outra", rotulo: "Outra origem", cor: "bg-slate-100 text-slate-700" },
};

/** "NF 910849", "NFS-e 77", "OC 56", "Envio 12", "Fatura 789" ou só a sigla. */
export function rotuloOrigem(o: OrigemConta | null | undefined): string | null {
  if (!o) return null;
  const s = ORIGENS[o.origem]?.sigla ?? "Outra";
  if (o.origem === "nf" && o.nf_numero) return `NF ${o.nf_numero}`;
  if (o.origem === "st" && o.nf_numero) return `NFS-e ${o.nf_numero}`;
  if (o.origem === "oc" && o.oc_numero) return `OC ${o.oc_numero}`;
  if (o.origem === "frete" && o.envio_numero) return `Envio ${o.envio_numero}`;
  if (o.origem === "cte" && o.fatura_numero) return `Fatura ${o.fatura_numero}`;
  return s;
}

/** Textos da origem que entram na busca (nº da nota de entrada, da OC, do envio, da fatura). */
export function termosOrigem(o: OrigemConta | null | undefined): string[] {
  if (!o) return [];
  return [rotuloOrigem(o), o.nf_numero, o.oc_numero, o.envio_numero, o.fatura_numero, ORIGENS[o.origem]?.rotulo].filter(Boolean) as string[];
}

// ---------------------------------------------------------------------
// Data do período
// ---------------------------------------------------------------------
export type CampoData = "vencimento" | "emissao" | "pagamento" | "competencia";
export const CAMPOS_DATA: { v: CampoData; rotulo: string }[] = [
  { v: "vencimento", rotulo: "Vencimento" },
  { v: "emissao", rotulo: "Emissão" },
  { v: "pagamento", rotulo: "Pagamento" },
  { v: "competencia", rotulo: "Competência" },
];

type ContaDatas = { vencimento: string; data_pagamento?: string | null; competencia?: string | null; emissao?: string | null; created_at?: string | null };

/** A data da conta que vale para o período escolhido (competência vazia: a do vencimento). */
export function dataDaConta(c: ContaDatas, campo: CampoData, origem?: OrigemConta | null): string | null {
  if (campo === "pagamento") return c.data_pagamento ?? null;
  if (campo === "competencia") return (c.competencia ?? c.vencimento ?? null);
  if (campo === "emissao") return c.emissao ?? origem?.emissao_efetiva ?? (c.created_at ? c.created_at.slice(0, 10) : null);
  return c.vencimento;
}

// ---------------------------------------------------------------------
// Datas e competência
// ---------------------------------------------------------------------
/** Soma meses mantendo o dia (31/01 + 1 mês = 28/02 ou 29/02). */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}
const somarDiasIso = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10) + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const inicioMes = (iso: string) => `${iso.slice(0, 7)}-01`;

export type ModoCompetencia = "vencimento" | "anterior" | "emissao" | "outro";
export const MODOS_COMPETENCIA: { v: ModoCompetencia; rotulo: string }[] = [
  { v: "vencimento", rotulo: "Mês do vencimento" },
  { v: "anterior", rotulo: "Mês anterior ao vencimento" },
  { v: "emissao", rotulo: "Mês da emissão" },
  { v: "outro", rotulo: "Escolher o mês" },
];

/** Mês de competência (1º dia) para o DRE. */
export function competenciaDe(modo: ModoCompetencia, vencimento: string, emissao?: string | null, mesEscolhido?: string | null): string {
  if (modo === "anterior") return inicioMes(somarMeses(inicioMes(vencimento), -1));
  if (modo === "emissao" && emissao) return inicioMes(emissao);
  if (modo === "outro" && mesEscolhido) return inicioMes(`${mesEscolhido.slice(0, 7)}-01`);
  return inicioMes(vencimento);
}

/** Qual modo explica a competência já gravada (para abrir a conta como foi lançada). */
export function modoDaCompetencia(competencia: string | null | undefined, vencimento: string, emissao?: string | null): ModoCompetencia {
  if (!competencia) return "vencimento";
  const c = inicioMes(competencia);
  if (c === inicioMes(vencimento)) return "vencimento";
  if (c === competenciaDe("anterior", vencimento)) return "anterior";
  if (emissao && c === inicioMes(emissao)) return "emissao";
  return "outro";
}

// ---------------------------------------------------------------------
// Ocorrência: uma conta só ou uma série
// ---------------------------------------------------------------------
export type Ocorrencia = "unica" | "parcelada" | "semanal" | "mensal" | "trimestral" | "semestral" | "anual";
export const OCORRENCIAS: { v: Ocorrencia; rotulo: string }[] = [
  { v: "unica", rotulo: "Única" },
  { v: "parcelada", rotulo: "Parcelada (divide o valor)" },
  { v: "semanal", rotulo: "Semanal" },
  { v: "mensal", rotulo: "Mensal" },
  { v: "trimestral", rotulo: "Trimestral" },
  { v: "semestral", rotulo: "Semestral" },
  { v: "anual", rotulo: "Anual" },
];
export const MAX_VEZES = 60;

const PASSO_MESES: Partial<Record<Ocorrencia, number>> = { parcelada: 1, mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

export type ParteSerie = { valor: number; vencimento: string; descricao: string; documento: string | null; competencia: string };

/**
 * As contas da série: parcelada divide o valor (os centavos que sobram vão na primeira) e as outras repetem o valor;
 * cada uma com o seu vencimento, "(2/6)" na descrição, "2/6" no documento e a competência pelo modo escolhido.
 */
export function serieContas(base: { valor: number; vencimento: string; descricao: string; documento?: string | null; emissao?: string | null },
  ocorrencia: Ocorrencia, vezes: number, modo: ModoCompetencia = "vencimento", mesEscolhido?: string | null): ParteSerie[] {
  const n = ocorrencia === "unica" ? 1 : Math.max(1, Math.min(MAX_VEZES, Math.floor(vezes || 1)));
  const centavos = Math.round(Number(base.valor) * 100);
  const parte = ocorrencia === "parcelada" ? Math.floor(centavos / n) : centavos;
  const sobra = ocorrencia === "parcelada" ? centavos - parte * n : 0;
  return Array.from({ length: n }, (_, i) => {
    const venc = ocorrencia === "semanal" ? somarDiasIso(base.vencimento, 7 * i) : somarMeses(base.vencimento, (PASSO_MESES[ocorrencia] ?? 0) * i);
    const sufixo = n > 1 ? `${i + 1}/${n}` : "";
    return {
      valor: (parte + (i === 0 ? sobra : 0)) / 100,
      vencimento: venc,
      descricao: n > 1 ? `${base.descricao} (${sufixo})` : base.descricao,
      documento: base.documento?.trim() ? (n > 1 ? `${base.documento.trim()} ${sufixo}` : base.documento.trim()) : null,
      // "outro mês" vale para a primeira; as seguintes andam junto com o vencimento
      competencia: modo === "outro" && i > 0
        ? somarMeses(competenciaDe("outro", base.vencimento, base.emissao, mesEscolhido), (PASSO_MESES[ocorrencia] ?? 0) * i)
        : competenciaDe(modo, venc, base.emissao, mesEscolhido),
    };
  });
}

// ---------------------------------------------------------------------
// Impressão agrupada por fornecedor
// ---------------------------------------------------------------------
export type GrupoTerceiro<T> = { terceiro: string; linhas: T[]; total: number };

/** Agrupa por fornecedor (sem fornecedor no fim), na ordem do nome, com o total de cada um. */
export function agruparPorTerceiro<T extends { terceiro: string; valor: number }>(linhas: T[], semNome = "Sem fornecedor"): GrupoTerceiro<T>[] {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) {
    const k = l.terceiro?.trim() || semNome;
    mapa.set(k, [...(mapa.get(k) ?? []), l]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === semNome ? 1 : b === semNome ? -1 : a.localeCompare(b, "pt-BR")))
    .map(([terceiro, l]) => ({ terceiro, linhas: l, total: Math.round(l.reduce((s, x) => s + Number(x.valor), 0) * 100) / 100 }));
}
