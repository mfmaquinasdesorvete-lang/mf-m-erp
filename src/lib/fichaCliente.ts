// Ficha do cliente: histórico de compras (pedidos do ERP e notas do sistema anterior), frequência,
// produtos que costuma comprar, comportamento de pagamento e situação (ativo, em risco, inativo).

export type CompraCliente = { data: string; valor: number; origem: "pedido" | "nota"; ref: string; itens: { chave: string; descricao: string; quantidade: number; valor: number }[] };
export type ContaCliente = { valor: number; valor_pago?: number | null; vencimento: string; status: string; data_pagamento?: string | null };

const dias = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);
const r2 = (n: number) => Math.round(n * 100) / 100;
const APROVADO = ["aprovado", "faturado", "entregue"];

/** CFOP de venda (5101, 6102, 6108, 5405…); remessas, transferências e devoluções ficam de fora. */
export const cfopVenda = (cfop?: string | null) => /^[567](1(0[1-9]|1[0-9]|2[0-5])|40[1-5]|551)$/.test(String(cfop ?? ""));

export type PedidoFicha = {
  id: string; numero: number; status: string; valor_total: number; created_at: string; aprovado_em?: string | null;
  itens?: { produto_id: string; descricao: string; quantidade: number; valor_unitario: number; produto?: { sku?: string | null } | null }[];
};
export type NotaFicha = { id: string; numero: string | null; status: string; ambiente?: string | null; finalidade?: string | null; tipo_operacao?: string | null; pedido_id?: string | null; valor_total: number; created_at: string; payload?: any };

/** Pedido aprovado do ERP como compra (orçamento e cancelado não contam). */
export function compraDoPedido(p: PedidoFicha): CompraCliente | null {
  if (!APROVADO.includes(p.status)) return null;
  return { data: p.aprovado_em ?? p.created_at, valor: Number(p.valor_total), origem: "pedido", ref: `Pedido #${p.numero}`,
    // a chave é o SKU, para somar com as notas do sistema anterior (que só têm o código do produto)
    itens: (p.itens ?? []).map((i) => ({ chave: i.produto?.sku || i.produto_id, descricao: i.descricao, quantidade: Number(i.quantidade), valor: r2(Number(i.quantidade) * Number(i.valor_unitario)) })) };
}

/** Nota de venda que não veio de pedido (histórico do Tiny); teste, devolução, entrada, remessa e transferência ficam de fora. */
export function compraDaNota(n: NotaFicha): CompraCliente | null {
  if (n.pedido_id || n.status !== "autorizada" || n.ambiente === "homologacao" || (n.finalidade ?? "normal") !== "normal" || (n.tipo_operacao ?? "saida") !== "saida") return null;
  const itens = ((n.payload?.items ?? []) as any[]).filter((i) => cfopVenda(i.cfop));
  if (n.payload?.items?.length && !itens.length) return null; // nota que não é de venda (remessa, transferência…)
  return { data: n.created_at, valor: Number(n.valor_total), origem: "nota", ref: `NF ${n.numero ?? ""}`,
    itens: itens.map((i) => ({ chave: String(i.codigo_produto || i.descricao), descricao: String(i.descricao ?? ""), quantidade: Number(i.quantidade_comercial ?? 0), valor: Number(i.valor_bruto ?? 0) })) };
}

/** Compras do cliente: pedidos aprovados do ERP + notas de venda que não vieram de pedido (histórico do Tiny). */
export function comprasDoCliente(pedidos: PedidoFicha[], notas: NotaFicha[]): CompraCliente[] {
  return [...pedidos.map(compraDoPedido), ...notas.map(compraDaNota)].filter((c): c is CompraCliente => !!c)
    .sort((a, b) => b.data.localeCompare(a.data));
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

export type Resumo = ReturnType<typeof resumoCliente>;
export type Sugestao = { nivel: "erro" | "alerta" | "info"; texto: string };
type EquipFicha = { descricao: string; numero_serie?: string | null; garantia_ate?: string | null; proxima_preventiva?: string | null; preventiva_agendada?: string | null };
type OsFicha = { numero: number; status: string; equipamento: string };

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const somar = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10)) + n * 864e5).toISOString().slice(0, 10);
const OS_FECHADA = ["concluida", "entregue", "cancelada"];

/** O que fazer com o cliente agora: cobrar, chamar de volta, oferecer reposição, agendar preventiva. */
export function sugestoesCliente(r: Resumo, produtos: ReturnType<typeof produtosDoCliente>, equipamentos: EquipFicha[], oss: OsFicha[], hoje: string): Sugestao[] {
  const out: Sugestao[] = [];
  if (r.vencido > 0) out.push({ nivel: "erro", texto: `Tem ${moeda(r.vencido)} vencido em ${r.vencidas} parcela(s): cobre antes de vender a prazo.` });
  if (r.pagasComAtraso >= 2 && r.atrasoMedio > 5) {
    out.push({ nivel: "alerta", texto: `Pagou ${r.pagasComAtraso} de ${r.pagas} parcelas com atraso (em média ${r.atrasoMedio} dias): prefira à vista, entrada ou prazo menor.` });
  }
  if (r.situacao === "em_risco") {
    out.push({ nivel: "alerta", texto: `Está há ${r.semComprar} dias sem comprar${r.intervaloMedio ? ` (costuma voltar a cada ${r.intervaloMedio} dias)` : ""}: vale um contato.` });
  } else if (r.situacao === "inativo") {
    out.push({ nivel: "alerta", texto: `Sem compras há ${r.semComprar} dias: ofereça novidades ou uma condição para voltar.` });
  } else if (r.situacao === "novo") {
    out.push({ nivel: "info", texto: "Cliente novo: faça o contato de pós-venda (chegou bem? ficou alguma dúvida?)." });
  } else if (r.proximaPrevista && r.proximaPrevista >= hoje && r.proximaPrevista <= somar(hoje, 15)) {
    out.push({ nivel: "info", texto: `Pelo histórico, a próxima compra deve vir até ${br(r.proximaPrevista)}: prepare uma oferta.` });
  }
  // o que compra sempre e já passou do tempo de repor
  const limite = Math.max(30, r.intervaloMedio ?? 60);
  for (const p of produtos.filter((x) => x.vezes >= 2 && Math.round((Date.parse(hoje) - Date.parse(x.ultima.slice(0, 10))) / 864e5) > limite).slice(0, 3)) {
    out.push({ nivel: "info", texto: `Comprou ${p.descricao} ${p.vezes} vezes; a última foi em ${br(p.ultima)}: ofereça reposição.` });
  }
  for (const e of equipamentos) {
    const nome = `${e.descricao}${e.numero_serie ? ` (série ${e.numero_serie})` : ""}`;
    if (e.proxima_preventiva && e.proxima_preventiva <= somar(hoje, 15) && !(e.preventiva_agendada && e.preventiva_agendada >= hoje)) {
      out.push({ nivel: e.proxima_preventiva < hoje ? "alerta" : "info", texto: `Preventiva do ${nome} ${e.proxima_preventiva < hoje ? "venceu" : "vence"} em ${br(e.proxima_preventiva)}: agende.` });
    }
    if (e.garantia_ate && e.garantia_ate >= hoje && e.garantia_ate <= somar(hoje, 30)) {
      out.push({ nivel: "info", texto: `A garantia do ${nome} termina em ${br(e.garantia_ate)}: ofereça a preventiva ou um contrato de manutenção.` });
    }
  }
  for (const o of oss.filter((x) => !OS_FECHADA.includes(x.status))) {
    out.push({ nivel: "info", texto: `OS #${o.numero} (${o.equipamento}) está em andamento: ${o.status.replace(/_/g, " ")}.` });
  }
  return out;
}

export const ROTULO_SITUACAO = {
  novo: { rotulo: "Cliente novo", cor: "text-sky-700 bg-sky-50" },
  ativo: { rotulo: "Ativo", cor: "text-emerald-700 bg-emerald-50" },
  em_risco: { rotulo: "Em risco: está demorando para voltar", cor: "text-amber-800 bg-amber-50" },
  inativo: { rotulo: "Inativo há mais de 1 ano", cor: "text-red-700 bg-red-50" },
  sem_compras: { rotulo: "Ainda sem compras", cor: "text-slate-600 bg-slate-100" },
} as const;
