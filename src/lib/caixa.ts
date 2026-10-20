// Torre de controle do caixa: prazo médio de recebimento (PMR) e de pagamento (PMP), inadimplência e o raio-X do que
// passou pelo banco sem estar lançado no ERP (o "furo" entre o previsto e o realizado). Arquivo puro (testado).
import { tipoDaDescricao } from "./impostosTarifas";

const dias = (de: string, ate: string) => Math.round((new Date(ate.slice(0, 10)).getTime() - new Date(de.slice(0, 10)).getTime()) / 864e5);

/** Prazo médio ponderado pelo valor: da venda (ou da nota) até o dinheiro entrar/sair. Itens sem início, ou com
 *  início depois do pagamento (data de importação), ficam de fora para não distorcer. */
export function prazoMedio(itens: { inicio: string | null | undefined; fim: string | null | undefined; valor: number }[]) {
  let soma = 0, peso = 0, n = 0;
  for (const i of itens) {
    if (!i.inicio || !i.fim || !(i.valor > 0)) continue;
    const d = dias(i.inicio, i.fim);
    if (d < 0 || d > 730) continue;
    soma += d * i.valor; peso += i.valor; n++;
  }
  return { dias: peso ? Math.round(soma / peso) : null, contas: n };
}

/** Inadimplência: do que já venceu e não entrou, quanto está atrasado, sobre tudo o que venceu no período. */
export function inadimplencia(contas: { valor: number; vencimento: string; status: string }[], hoje: string, desde: string) {
  const venc = contas.filter((c) => c.vencimento >= desde && c.vencimento < hoje && c.status !== "cancelado");
  const total = venc.reduce((s, c) => s + Number(c.valor), 0);
  const atraso = venc.filter((c) => c.status !== "pago").reduce((s, c) => s + Number(c.valor), 0);
  return { total, atraso, pct: total ? Math.round((atraso / total) * 1000) / 10 : null };
}

export type GrupoFuro = "Impostos" | "Folha e pessoas" | "Tarifas e juros" | "Cartão" | "Fornecedores e outros";
const GRUPOS: [RegExp, GrupoFuro][] = [
  [/\b(darf|das|gps|fgts|gnre|icms|iss|irpj|csll|pis|cofins|simples|tribut|receita federal|sefaz|dctf)\b/, "Impostos"],
  [/salar|folha|pro.?labore|ferias|rescis|13o|decimo|vale|adiantamento/, "Folha e pessoas"],
  [/tarifa|taxa|iof|juros|anuidade|pacote|cesta|manutenc.*conta|encargo/, "Tarifas e juros"],
  [/cartao|fatura|card/, "Cartão"],
];
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const grupoFuro = (descricao: string): GrupoFuro => {
  const d = semAcento(descricao);
  for (const [re, g] of GRUPOS) if (re.test(d)) return g;
  return "Fornecedores e outros";
};

/** O que entrou e saiu do banco sem conta do ERP (nem transferência entre contas nem ignorado). */
export function furoDoCaixa(lancs: { valor: number; descricao: string | null; status?: string | null }[]) {
  const soltos = lancs.filter((l) => l.status !== "ignorado");
  const saidas = soltos.filter((l) => l.valor < 0);
  const entradas = soltos.filter((l) => l.valor > 0);
  const porGrupo = new Map<GrupoFuro, { n: number; total: number }>();
  const porTipo = new Map<string, { n: number; total: number }>();
  for (const l of saidas) {
    const g = grupoFuro(l.descricao ?? "");
    const x = porGrupo.get(g) ?? { n: 0, total: 0 }; x.n++; x.total += -l.valor; porGrupo.set(g, x);
    const t = tipoDaDescricao(l.descricao ?? "");
    const y = porTipo.get(t) ?? { n: 0, total: 0 }; y.n++; y.total += -l.valor; porTipo.set(t, y);
  }
  return {
    saidas: { n: saidas.length, total: saidas.reduce((s, l) => s - l.valor, 0) },
    entradas: { n: entradas.length, total: entradas.reduce((s, l) => s + l.valor, 0) },
    grupos: [...porGrupo].map(([grupo, x]) => ({ grupo, ...x })).sort((a, b) => b.total - a.total),
    // o que se repete é candidato a conta fixa (entra no previsto e para de aparecer de surpresa)
    repetidos: [...porTipo].map(([tipo, x]) => ({ tipo, ...x })).filter((x) => x.n >= 2).sort((a, b) => b.total - a.total).slice(0, 8),
  };
}

/** Das contas pagas, quantas saíram até o vencimento (juros e multa evitados). */
export function pontualidade(contas: { status: string; vencimento: string; data_pagamento?: string | null }[]) {
  const pagas = contas.filter((c) => c.status === "pago" && c.data_pagamento);
  const emDia = pagas.filter((c) => c.data_pagamento!.slice(0, 10) <= c.vencimento.slice(0, 10)).length;
  return { pagas: pagas.length, emDia, pct: pagas.length ? Math.round((emDia / pagas.length) * 100) : null };
}
