// Ficha do cliente: histórico de compras (pedidos do ERP e notas do sistema anterior), frequência,
// produtos que costuma comprar, comportamento de pagamento e situação (ativo, em risco, inativo).

export type CompraCliente = { data: string; valor: number; origem: "pedido" | "nota"; ref: string; itens: { chave: string; descricao: string; quantidade: number; valor: number }[] };
export type ContaCliente = { valor: number; valor_pago?: number | null; vencimento: string; status: string; data_pagamento?: string | null };

const dias = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);
const r2 = (n: number) => Math.round(n * 100) / 100;
const APROVADO = ["aprovado", "faturado", "entregue"];

/** CFOP de venda (5101, 6102, 6108, 5405…); remessas, transferências e devoluções ficam de fora. */
export const cfopVenda = (cfop?: string | null) => /^[567](1(0[1-9]|1[0-9]|2[0-5])|40[1-5]|551)$/.test(String(cfop ?? ""));

type PedidoFicha = { id: string; numero: number; status: string; valor_total: number; created_at: string; aprovado_em?: string | null; itens?: { produto_id: string; descricao: string; quantidade: number; valor_unitario: number }[] };
type NotaFicha = { id: string; numero: string | null; status: string; ambiente?: string | null; finalidade?: string | null; tipo_operacao?: string | null; pedido_id?: string | null; valor_total: number; created_at: string; payload?: any };

/** Compras do cliente: pedidos aprovados do ERP + notas de venda que não vieram de pedido (histórico do Tiny). */
export function comprasDoCliente(pedidos: PedidoFicha[], notas: NotaFicha[]): CompraCliente[] {
  const out: CompraCliente[] = [];
  for (const p of pedidos.filter((x) => APROVADO.includes(x.status))) {
    out.push({ data: p.aprovado_em ?? p.created_at, valor: Number(p.valor_total), origem: "pedido", ref: `Pedido #${p.numero}`,
      itens: (p.itens ?? []).map((i) => ({ chave: i.produto_id, descricao: i.descricao, quantidade: Number(i.quantidade), valor: r2(Number(i.quantidade) * Number(i.valor_unitario)) })) });
  }
  for (const n of notas) {
    if (n.pedido_id || n.status !== "autorizada" || n.ambiente === "homologacao" || (n.finalidade ?? "normal") !== "normal" || (n.tipo_operacao ?? "saida") !== "saida") continue;
    const itens = ((n.payload?.items ?? []) as any[]).filter((i) => cfopVenda(i.cfop));
    if (n.payload?.items?.length && !itens.length) continue; // nota que não é de venda (remessa, transferência…)
    out.push({ data: n.created_at, valor: Number(n.valor_total), origem: "nota", ref: `NF ${n.numero ?? ""}`,
      itens: itens.map((i) => ({ chave: String(i.codigo_produto || i.descricao), descricao: String(i.descricao ?? ""), quantidade: Number(i.quantidade_comercial ?? 0), valor: Number(i.valor_bruto ?? 0) })) });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

export function resumoCliente(compras: CompraCliente[], contas: ContaCliente[], hoje: string) {
  const total = r2(compras.reduce((s, c) => s + c.valor, 0));
  const datas = [...compras].map((c) => c.data.slice(0, 10)).sort();
  const intervalos = datas.slice(1).map((d, i) => dias(datas[i], d)).filter((x) => x > 0);
  const intervaloMedio = intervalos.length ? Math.round(intervalos.reduce((s, x) => s + x, 0) / intervalos.length) : null;
  const ultima = datas[datas.length - 1] ?? null;
  const semComprar = ultima ? dias(ultima, hoje) : null;
  const ano = compras.filter((c) => dias(c.data, hoje) <= 365);
  const situacao: "novo" | "ativo" | "em_risco" | "inativo" | "sem_compras" =
    !ultima ? "sem_compras"
      : semComprar! > 365 ? "inativo"
        : compras.length === 1 && semComprar! <= 90 ? "novo"
          : intervaloMedio && semComprar! > Math.max(90, intervaloMedio * 1.5) ? "em_risco"
            : semComprar! > 180 ? "em_risco" : "ativo";

  const abertas = contas.filter((c) => c.status === "aberto");
  const vencidas = abertas.filter((c) => c.vencimento < hoje);
  const pagas = contas.filter((c) => c.status === "pago" && c.data_pagamento);
  const atrasos = pagas.map((c) => dias(c.vencimento, c.data_pagamento!)).filter((d) => d > 0);
  return {
    total, compras: compras.length, ticket: compras.length ? r2(total / compras.length) : 0,
    primeira: datas[0] ?? null, ultima, semComprar, intervaloMedio,
    proximaPrevista: ultima && intervaloMedio ? new Date(Date.parse(ultima) + intervaloMedio * 864e5).toISOString().slice(0, 10) : null,
    ultimos12m: r2(ano.reduce((s, c) => s + c.valor, 0)), situacao,
    emAberto: r2(abertas.reduce((s, c) => s + Number(c.valor), 0)),
    vencido: r2(vencidas.reduce((s, c) => s + Number(c.valor), 0)), vencidas: vencidas.length,
    pagasComAtraso: atrasos.length, pagas: pagas.length, atrasoMedio: atrasos.length ? Math.round(atrasos.reduce((s, d) => s + d, 0) / atrasos.length) : 0,
  };
}

/** O que o cliente costuma comprar: por produto, quantas vezes, quanto e quando foi a última. */
export function produtosDoCliente(compras: CompraCliente[]) {
  const m = new Map<string, { descricao: string; vezes: number; quantidade: number; valor: number; ultima: string }>();
  for (const c of compras) for (const i of c.itens) {
    const k = i.chave || i.descricao;
    const x = m.get(k) ?? { descricao: i.descricao, vezes: 0, quantidade: 0, valor: 0, ultima: c.data };
    x.vezes++; x.quantidade += i.quantidade; x.valor = r2(x.valor + i.valor);
    if (c.data > x.ultima) x.ultima = c.data;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

export const ROTULO_SITUACAO = {
  novo: { rotulo: "Cliente novo", cor: "text-sky-700 bg-sky-50" },
  ativo: { rotulo: "Ativo", cor: "text-emerald-700 bg-emerald-50" },
  em_risco: { rotulo: "Em risco: está demorando para voltar", cor: "text-amber-800 bg-amber-50" },
  inativo: { rotulo: "Inativo há mais de 1 ano", cor: "text-red-700 bg-red-50" },
  sem_compras: { rotulo: "Ainda sem compras", cor: "text-slate-600 bg-slate-100" },
} as const;
