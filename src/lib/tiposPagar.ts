// Contas a pagar por tipo (transportadoras, fornecedores, folha, impostos…): o resumo "quanto tem para pagar" e a cor de
// cada cartão. A transportadora é reconhecida pelo CNPJ (raiz) do cadastro de transportadoras, pela categoria "frete" ou
// pela descrição (frete, CT-e), porque muita fatura de frete entra na categoria "fornecedores". Funções puras.
import { aguardaAprovacao, contaParada, diaDoPagamento, type ContaDecisao } from "./programacao";

export type TipoPagar = "transportadora" | "fornecedor" | "pessoal" | "imposto" | "casa" | "servico" | "outros";

/**
 * Classes inteiras (o Tailwind só gera as que aparecem escritas) com as cores do tema claro e escuro; `cor` é o tom
 * forte (faixa do cartão, que aparece nos dois temas) e `neon` o tom claro do painel escuro "quanto tem para pagar".
 */
type InfoTipo = { rotulo: string; dica: string; chip: string; barra: string; borda: string; fundo: string; texto: string; cor: string; neon: string };
export const TIPOS_PAGAR: Record<TipoPagar, InfoTipo> = {
  transportadora: { rotulo: "Transportadoras", dica: "Fretes e faturas de CT-e", chip: "bg-sky-100 text-sky-800", barra: "bg-sky-500", borda: "border-l-sky-500", fundo: "bg-sky-50", texto: "text-sky-700", cor: "#06b6d4", neon: "#22d3ee" },
  fornecedor: { rotulo: "Fornecedores", dica: "Peças, matéria-prima e mercadorias", chip: "bg-indigo-100 text-indigo-800", barra: "bg-indigo-500", borda: "border-l-indigo-500", fundo: "bg-indigo-50", texto: "text-indigo-700", cor: "#6366f1", neon: "#818cf8" },
  pessoal: { rotulo: "Folha e pessoal", dica: "Salários, pró-labore e comissões", chip: "bg-purple-100 text-purple-800", barra: "bg-purple-500", borda: "border-l-purple-500", fundo: "bg-purple-50", texto: "text-purple-700", cor: "#a855f7", neon: "#d8b4fe" },
  imposto: { rotulo: "Impostos", dica: "Guias e parcelamentos", chip: "bg-red-100 text-red-800", barra: "bg-red-500", borda: "border-l-red-500", fundo: "bg-red-50", texto: "text-red-700", cor: "#f43f5e", neon: "#fb7185" },
  casa: { rotulo: "Aluguel e contas", dica: "Aluguel, energia, água e internet", chip: "bg-amber-100 text-amber-800", barra: "bg-amber-500", borda: "border-l-amber-500", fundo: "bg-amber-50", texto: "text-amber-700", cor: "#f59e0b", neon: "#fcd34d" },
  servico: { rotulo: "Serviços", dica: "Contador, advogado, manutenção, marketing e sistemas", chip: "bg-orange-100 text-orange-800", barra: "bg-orange-500", borda: "border-l-orange-500", fundo: "bg-orange-50", texto: "text-orange-700", cor: "#f97316", neon: "#fdba74" },
  outros: { rotulo: "Outros", dica: "Bancos, juros, investimentos e o resto", chip: "bg-slate-200 text-slate-800", barra: "bg-slate-400", borda: "border-l-slate-400", fundo: "bg-slate-100", texto: "text-slate-700", cor: "#94a3b8", neon: "#e2e8f0" },
};
export const ORDEM_TIPOS = Object.keys(TIPOS_PAGAR) as TipoPagar[];

// categorias do plano de contas (Financeiro → Plano de contas)
const POR_CATEGORIA: Record<string, TipoPagar> = {
  frete: "transportadora", fretes: "transportadora",
  fornecedores: "fornecedor",
  folha: "pessoal", "pró-labore": "pessoal", comissoes: "pessoal", "comissões": "pessoal", "distribuição de lucros": "pessoal",
  impostos: "imposto",
  aluguel: "casa", "energia/água/internet": "casa",
  "serviços profissionais": "servico", "manutenção": "servico", marketing: "servico", "sistemas e assinaturas": "servico",
  "tarifas bancárias": "outros", "juros e multas": "outros", "antecipação de recebíveis": "outros", investimentos: "outros", outros: "outros",
};
// categoria fora do plano (importada, digitada): pelo texto
const PISTAS: [RegExp, TipoPagar][] = [
  [/\bfrete|transport|\bct-?e\b/i, "transportadora"],
  [/impost|tribut|\bdarf\b|\bdas\b|\bdare\b|\bgps\b|fgts|inss|icms|\biss\b|\bipi\b|parcelamento/i, "imposto"],
  [/folha|sal[áa]rio|pr[óo]-?labore|comiss|f[ée]rias|rescis|13[ºo°]/i, "pessoal"],
  [/aluguel|condom[íi]nio|energia|[áa]gua|internet|telefon/i, "casa"],
  [/servi[çc]o|manuten|contab|advog|marketing|sistema|assinatura|software/i, "servico"],
  [/fornecedor|compra|mercadoria|mat[ée]ria|pe[çc]a/i, "fornecedor"],
];

/** Só os 8 primeiros dígitos (a raiz): pega a matriz e todas as filiais da transportadora. */
export const raizCnpj = (cnpj?: string | null) => {
  const d = String(cnpj ?? "").replace(/\D/g, "");
  return d.length === 14 ? d.slice(0, 8) : "";
};

export type ContaTipo = { categoria?: string | null; descricao?: string | null; fornecedor_id?: string | null; fornecedor?: { cnpj?: string | null; bloqueado?: boolean | null } | null };

/** O tipo da conta. `transportadoras` = raízes de CNPJ do cadastro de transportadoras. */
export function tipoPagar(c: ContaTipo, transportadoras: Set<string> = new Set()): TipoPagar {
  const cat = (c.categoria ?? "").trim().toLowerCase();
  const doPlano = POR_CATEGORIA[cat];
  // imposto e folha valem pela categoria; o resto cede à transportadora (fatura de frete lançada como "fornecedores")
  if (doPlano === "imposto" || doPlano === "pessoal") return doPlano;
  const raiz = raizCnpj(c.fornecedor?.cnpj);
  if (raiz && transportadoras.has(raiz)) return "transportadora";
  if ((!doPlano || doPlano === "fornecedor" || doPlano === "outros") && /\bfrete|\bct-?e\b/i.test(c.descricao ?? "")) return "transportadora";
  if (doPlano) return doPlano;
  const pista = PISTAS.find(([re]) => re.test(cat) || re.test(c.descricao ?? ""));
  if (pista) return pista[1];
  return c.fornecedor_id ? "fornecedor" : "outros";
}

const somaDias = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const r2 = (v: number) => Math.round(v * 100) / 100;

export type LinhaTipo = { tipo: TipoPagar; total: number; n: number; vencido: number; nVencidas: number; semana: number; aprovar: number; nAprovar: number };
export type ResumoPagar = Omit<LinhaTipo, "tipo"> & { linhas: LinhaTipo[]; seguradas: number; nSeguradas: number };

/**
 * Quanto tem para pagar: as contas em aberto que vão sair (sem as "não pagar" e as de fornecedor golpe, que aparecem à
 * parte como seguradas), por tipo, do maior para o menor. Vencido e próximos 7 dias contam pelo dia do pagamento.
 */
export function resumoPorTipo<T extends ContaDecisao>(contas: T[], tipoDe: (c: T) => TipoPagar, hoje: string): ResumoPagar {
  const ate = somaDias(hoje, 7);
  const m = new Map<TipoPagar, LinhaTipo>();
  let seguradas = 0, nSeguradas = 0;
  for (const c of contas) {
    if (c.status !== "aberto") continue;
    const v = Number(c.valor) || 0;
    if (contaParada(c)) { seguradas += v; nSeguradas++; continue; }
    const t = tipoDe(c);
    const l = m.get(t) ?? { tipo: t, total: 0, n: 0, vencido: 0, nVencidas: 0, semana: 0, aprovar: 0, nAprovar: 0 };
    const d = diaDoPagamento(c);
    l.total += v; l.n++;
    if (d < hoje) { l.vencido += v; l.nVencidas++; } else if (d <= ate) l.semana += v;
    if (aguardaAprovacao(c)) { l.aprovar += v; l.nAprovar++; }
    m.set(t, l);
  }
  const linhas = [...m.values()].map((l) => ({ ...l, total: r2(l.total), vencido: r2(l.vencido), semana: r2(l.semana), aprovar: r2(l.aprovar) }))
    .sort((a, b) => b.total - a.total);
  const soma = (k: "total" | "vencido" | "semana" | "aprovar" | "n" | "nVencidas" | "nAprovar") => r2(linhas.reduce((s, l) => s + l[k], 0));
  return {
    linhas, total: soma("total"), n: soma("n"), vencido: soma("vencido"), nVencidas: soma("nVencidas"), semana: soma("semana"),
    aprovar: soma("aprovar"), nAprovar: soma("nAprovar"), seguradas: r2(seguradas), nSeguradas,
  };
}

/** O prazo em palavras ("venceu há 3 dias", "vence hoje", "vence em 5 dias"), pelo dia do pagamento. */
export function prazoPagar(c: ContaDecisao & { data_pagamento?: string | null }, hoje: string): { texto: string; tom: "atrasada" | "hoje" | "perto" | "longe" | "paga" } {
  if (c.status === "pago") return { texto: c.data_pagamento ? `paga em ${c.data_pagamento.slice(8, 10)}/${c.data_pagamento.slice(5, 7)}` : "paga", tom: "paga" };
  const d = diaDoPagamento(c);
  const n = diasEntre(hoje, d);
  const pagar = d !== c.vencimento ? "pagar" : "vence";
  if (n < 0) return { texto: `${pagar === "pagar" ? "era para pagar" : "venceu"} há ${-n} ${n === -1 ? "dia" : "dias"}`, tom: "atrasada" };
  if (n === 0) return { texto: `${pagar} hoje`, tom: "hoje" };
  if (n === 1) return { texto: `${pagar} amanhã`, tom: "perto" };
  if (n <= 7) return { texto: `${pagar} em ${n} dias`, tom: "perto" };
  return { texto: `${pagar} ${d.slice(8, 10)}/${d.slice(5, 7)}`, tom: "longe" };
}
