// Impostos pagos, tarifas (cartão, OLIST, banco) e pagamentos a funcionários juntos, de todas as contas.
// Vem dos extratos (o que de fato saiu) e das contas pagas lançadas no ERP nas categorias de cada um; a conta que já está
// ligada a uma linha do extrato não conta de novo. O mesmo extrato importado em duas contas conta uma vez. Arquivo puro (testado).
import { esferaImposto, funcionarioDoLancamento, origemTarifa, semRepetidos, tipoLancamento, type TipoLanc } from "./extratoTipos";

export type AbaGasto = "impostos" | "tarifas" | "funcionarios";

export const ABAS_GASTO: { id: AbaGasto; rotulo: string; tipo: TipoLanc; categorias: string[] }[] = [
  { id: "impostos", rotulo: "Impostos pagos", tipo: "imposto", categorias: ["impostos"] },
  { id: "tarifas", rotulo: "Tarifas de cartão e OLIST", tipo: "tarifa", categorias: ["tarifas bancárias", "juros e multas"] },
  { id: "funcionarios", rotulo: "Pagamentos a funcionários", tipo: "funcionario", categorias: ["folha", "pró-labore"] },
];

export type LancGasto = {
  id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null;
  identificador?: string | null; status: string; conta_pagar_id?: string | null;
};
export type ContaGasto = {
  id: string; descricao: string | null; categoria: string | null; valor: number; valor_pago?: number | null;
  data_pagamento?: string | null; vencimento: string; status: string; conta_bancaria_id?: string | null;
};
export type LinhaGasto = {
  id: string; data: string; valor: number; descricao: string; conta_bancaria_id: string | null;
  fonte: "extrato" | "conta"; grupo: string; status: string;
};

export const SEM_GRUPO: Record<AbaGasto, string> = { impostos: "Outros impostos", tarifas: "Banco", funcionarios: "Folha (sem nome)" };

function grupoDe(aba: AbaGasto, textos: (string | null | undefined)[], funcionarios: { nome: string }[]): string {
  for (const t of textos) {
    if (!t) continue;
    if (aba === "impostos") { const e = esferaImposto(t); if (e) return e; }
    if (aba === "funcionarios") { const f = funcionarioDoLancamento(t, funcionarios); if (f) return f.nome; }
  }
  if (aba === "tarifas") return origemTarifa(textos.filter(Boolean).join(" "));
  return SEM_GRUPO[aba];
}

/** Linhas da aba (valor positivo = saiu da MF), mais novas primeiro. */
export function linhasGasto(aba: AbaGasto, lancs: LancGasto[], contas: ContaGasto[], funcionarios: { nome: string }[] = []): LinhaGasto[] {
  const def = ABAS_GASTO.find((a) => a.id === aba)!;
  const porId = new Map(contas.map((c) => [c.id, c]));
  const ligadas = new Set(lancs.map((l) => l.conta_pagar_id).filter(Boolean) as string[]);
  const out: LinhaGasto[] = [];
  for (const l of semRepetidos(lancs)) {
    const v = Number(l.valor);
    if (!(v < 0)) continue;
    const conta = l.conta_pagar_id ? porId.get(l.conta_pagar_id) : undefined;
    const daAba = tipoLancamento(l.descricao, v, funcionarios) === def.tipo || (!!conta && def.categorias.includes(conta.categoria ?? ""));
    if (!daAba) continue;
    out.push({ id: l.id, data: l.data, valor: -v, descricao: l.descricao ?? "", conta_bancaria_id: l.conta_bancaria_id, fonte: "extrato",
      grupo: grupoDe(aba, [l.descricao, conta?.descricao], funcionarios), status: l.status });
  }
  for (const c of contas) {
    if (c.status !== "pago" || ligadas.has(c.id)) continue;
    const daAba = def.categorias.includes(c.categoria ?? "")
      || (aba === "impostos" && !!esferaImposto(c.descricao))
      || (aba === "funcionarios" && !!funcionarioDoLancamento(c.descricao, funcionarios));
    if (!daAba) continue;
    out.push({ id: c.id, data: (c.data_pagamento ?? c.vencimento).slice(0, 10), valor: Number(c.valor_pago ?? c.valor), descricao: c.descricao ?? "",
      conta_bancaria_id: c.conta_bancaria_id ?? null, fonte: "conta", grupo: grupoDe(aba, [c.descricao], funcionarios), status: "pago" });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

export function totalPorGrupo(linhas: LinhaGasto[]) {
  const m = new Map<string, { n: number; total: number; ultimo: string }>();
  for (const l of linhas) {
    const x = m.get(l.grupo) ?? { n: 0, total: 0, ultimo: "" };
    x.n++; x.total = Math.round((x.total + l.valor) * 100) / 100; if (l.data > x.ultimo) x.ultimo = l.data;
    m.set(l.grupo, x);
  }
  return m;
}

/** Mês a mês (mais novo primeiro), no máximo 12 meses. */
export function porMesGasto(linhas: LinhaGasto[]) {
  const m = new Map<string, { n: number; total: number }>();
  for (const l of linhas) {
    const k = l.data.slice(0, 7); const x = m.get(k) ?? { n: 0, total: 0 };
    x.n++; x.total = Math.round((x.total + l.valor) * 100) / 100; m.set(k, x);
  }
  return [...m].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
}
