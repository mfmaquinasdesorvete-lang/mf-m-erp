// DRE pelas notas (como no Tiny) e margem de contribuição:
//  • Receita bruta, impostos destacados (ICMS, IPI, PIS, COFINS, DIFAL e FCP), devoluções de venda (com o estorno dos
//    impostos e do CMV), o ISS das NFS-e e o custo dos produtos vendidos (CMV, pelo custo do cadastro no dia da
//    venda) saem das notas, no mês da emissão. As despesas continuam vindo
//    das contas a pagar e dos extratos; o que as notas já contam (vendas, impostos sobre a venda e compras de
//    mercadoria) sai das contas para não contar duas vezes.
//  • Cada categoria de despesa é fixa ou variável (Plano de contas; vazio = sugestão pelo grupo e pelo nome), para a
//    margem de contribuição, o ponto de equilíbrio e a margem de segurança.
// Números gerenciais: a apuração oficial é do contador.
import { CFOP_VENDA, indiceProdutos, type ItemNota, type NotaVenda } from "./vendasNotas";
import type { Produto } from "./types";
import { norm, type CategoriaFin, type GrupoDre, type LancDre, type LinhaDre } from "./dre";

export type ItemNotaDre = ItemNota & {
  valor_desconto?: number | string | null; icms_valor_uf_destino?: number | string | null; fcp_valor_uf_destino?: number | string | null;
  valor_ipi_devolvido?: number | string | null;
};
export type NotaDre = Omit<NotaVenda, "payload"> & { transferencia_id?: string | null; payload?: { items?: ItemNotaDre[] } | null };
export type DevolucaoRecebida = { id: string; data_emissao: string | null; valor_total: number | string | null; unidade_id?: string | null;
  finalidade?: string | null; situacao?: string | null; excluida_em?: string | null; icms_credito?: number | string | null;
  itens?: { codigo?: string | null; descricao?: string | null; quantidade?: number | string | null }[] | null };
/** NFS-e emitida (pelo ERP ou importada): só o ISS entra no DRE; a receita do serviço vem da conta a receber. */
export type NfseDre = { data: string | null; valor_iss: number | string | null; iss_retido?: boolean | null; unidade_id?: string | null; valida: boolean };
/** Mudança do custo do cadastro (custos_anteriores_produtos): quando mudou e o custo de antes. */
export type CustoAnterior = { produto_id: string; alterado_em: string; custo_antes: number | string | null };

/** Categorias que as notas criam no DRE (nomes mostrados no detalhe das linhas). */
export const CAT_NOTAS = {
  receita: "vendas (NF-e)", icms: "ICMS destacado", ipi: "IPI destacado", pis: "PIS destacado", cofins: "COFINS destacado",
  difal: "DIFAL e FCP", iss: "ISS das NFS-e", devolucoes: "devoluções de vendas", estornoImpostos: "estorno de impostos das devoluções",
  cmv: "CMV (custo do dia da venda)", estornoCmv: "estorno de CMV das devoluções",
} as const;

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (x: number) => Math.round(x * 100) / 100;
/** Dia da emissão em Brasília (a nota guarda o instante em UTC). */
export const diaBrasilia = (iso: string) => new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);

/** Nota de venda que entra no DRE: autorizada, de produção, saída normal, fora as transferências entre as unidades. */
export const notaDeVendaDre = (nf: NotaDre) => nf.status === "autorizada" && nf.ambiente !== "homologacao" && !nf.excluida_em
  && (nf.tipo_operacao ?? "saida") === "saida" && (nf.finalidade ?? "normal") === "normal" && !nf.transferencia_id;

/**
 * Custo do produto num dia: o "antes" da primeira mudança de custo depois desse dia; sem mudança depois, o custo
 * atual do cadastro (como o Tiny, que usa o custo da data da autorização da nota).
 */
export function custoNaData(mudancas: Map<string, CustoAnterior[]>) {
  return (p: Produto | undefined, iso: string) => {
    if (!p) return 0;
    const depois = (mudancas.get(p.id) ?? []).find((m) => m.alterado_em > iso);
    return depois ? n(depois.custo_antes) : n(p.preco_custo);
  };
}

export type VendaDre = { dia: string; unidade_id: string | null; valor: number };

/**
 * Lançamentos do DRE tirados das notas: receita, impostos destacados, devoluções com o estorno dos impostos e do
 * CMV, CMV pelo custo do dia da venda e o ISS das NFS-e. Também a lista das vendas (nº de notas e ticket médio) e
 * quantos itens ficaram sem custo no cadastro.
 */
export function notasParaDre(notas: NotaDre[], recebidas: DevolucaoRecebida[], produtos: Produto[],
  opc: { custosAnteriores?: CustoAnterior[]; nfse?: NfseDre[] } = {}) {
  const achar = indiceProdutos(produtos);
  const mudancas = new Map<string, CustoAnterior[]>();
  for (const m of [...(opc.custosAnteriores ?? [])].sort((a, b) => a.alterado_em.localeCompare(b.alterado_em))) {
    mudancas.set(m.produto_id, [...(mudancas.get(m.produto_id) ?? []), m]);
  }
  const custo = custoNaData(mudancas);
  const out: LancDre[] = [];
  const vendas: VendaDre[] = [];
  let semCusto = 0, notasVenda = 0, devolucoes = 0;
  const lanc = (tipo: LancDre["tipo"], grupo: GrupoDre, categoria: string, valor: number, dia: string, unidade_id?: string | null) => {
    if (Math.abs(valor) < 0.005) return;
    out.push({ tipo, grupo, categoria, valor: r2(valor), status: "aberto", vencimento: dia, competencia: dia, unidade_id: unidade_id ?? null, origem: "nota" });
  };
  const cmvDe = (itens: { codigo_produto?: string | null; descricao?: string | null; quantidade?: number }[], iso: string, contarSemCusto: boolean) => {
    let total = 0;
    for (const i of itens) {
      const c = custo(achar(i), iso);
      if (!c) { if (contarSemCusto) semCusto++; continue; }
      total += c * (i.quantidade || 1);
    }
    return total;
  };
  for (const nf of notas) {
    const dia = diaBrasilia(nf.created_at);
    // devolução de venda emitida pela MF (NF-e de entrada de devolução): a devolução nas deduções, o estorno dos
    // impostos que ela devolve e a volta do custo do que retornou ao estoque
    if (nf.finalidade === "devolucao" && nf.tipo_operacao === "entrada") {
      if (nf.status !== "autorizada" || nf.ambiente === "homologacao" || nf.excluida_em) continue;
      devolucoes++;
      const itens = nf.payload?.items ?? [];
      lanc("pagar", "deducao", CAT_NOTAS.devolucoes, n(nf.valor_total), dia, nf.unidade_id);
      lanc("receber", "deducao", CAT_NOTAS.estornoImpostos, itens.reduce((t, i) => t + n(i.icms_valor) + n(i.pis_valor) + n(i.cofins_valor)
        + n(i.ipi_valor) + n(i.valor_ipi_devolvido) + n(i.icms_valor_uf_destino) + n(i.fcp_valor_uf_destino), 0), dia, nf.unidade_id);
      lanc("receber", "custo", CAT_NOTAS.estornoCmv, cmvDe(itens.map((i) => ({ ...i, quantidade: n(i.quantidade_comercial) })), nf.created_at, false), dia, nf.unidade_id);
      continue;
    }
    if (!notaDeVendaDre(nf)) continue;
    const itens = (nf.payload?.items ?? []).filter((i) => CFOP_VENDA.test(String(i.cfop ?? "").replace(/\D/g, "")));
    if (!itens.length) continue;
    notasVenda++;
    const s = (f: (i: ItemNotaDre) => number) => itens.reduce((t, i) => t + f(i), 0);
    const ipi = s((i) => n(i.ipi_valor));
    const receita = s((i) => n(i.valor_bruto) - n(i.valor_desconto)) + ipi;
    vendas.push({ dia, unidade_id: nf.unidade_id ?? null, valor: r2(receita) });
    lanc("receber", "receita", CAT_NOTAS.receita, receita, dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.icms, s((i) => n(i.icms_valor)), dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.ipi, ipi, dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.pis, s((i) => n(i.pis_valor)), dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.cofins, s((i) => n(i.cofins_valor)), dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.difal, s((i) => n(i.icms_valor_uf_destino) + n(i.fcp_valor_uf_destino)), dia, nf.unidade_id);
    lanc("pagar", "custo", CAT_NOTAS.cmv, cmvDe(itens.map((i) => ({ ...i, quantidade: n(i.quantidade_comercial) })), nf.created_at, true), dia, nf.unidade_id);
  }
  // devolução de venda que o cliente emitiu (chegou da SEFAZ): o XML lido traz o ICMS (crédito) e os itens
  for (const r of recebidas) {
    if (r.finalidade !== "devolucao" || r.excluida_em || r.situacao === "cancelada" || !r.data_emissao) continue;
    devolucoes++;
    const dia = r.data_emissao.slice(0, 10);
    lanc("pagar", "deducao", CAT_NOTAS.devolucoes, n(r.valor_total), dia, r.unidade_id);
    lanc("receber", "deducao", CAT_NOTAS.estornoImpostos, n(r.icms_credito), dia, r.unidade_id);
    lanc("receber", "custo", CAT_NOTAS.estornoCmv, cmvDe((r.itens ?? []).map((i) => ({ codigo_produto: i.codigo, descricao: i.descricao, quantidade: n(i.quantidade) })), `${dia}T12:00:00Z`, false), dia, r.unidade_id);
  }
  // ISS das NFS-e de serviço (o retido pelo tomador já vem descontado no que o cliente paga)
  let nfse = 0;
  for (const s of opc.nfse ?? []) {
    if (!s.valida || !s.data) continue;
    nfse++;
    if (!s.iss_retido) lanc("pagar", "deducao", CAT_NOTAS.iss, n(s.valor_iss), s.data.slice(0, 10), s.unidade_id);
  }
  return { lancamentos: out, vendas, semCusto, notasVenda, devolucoes, nfse };
}

/** Compras de mercadoria e matéria-prima: no DRE pelas notas o CMV entra no lugar delas. */
const COMPRA_MERCADORIA = /^fornecedores$|mat[eé]ria[- ]prima|mercadoria/;

/**
 * Contas e extratos que ficam no DRE pelas notas: sai o que as notas já contam — venda de produtos (categoria vendas,
 * sem categoria ou recebimento solto no extrato), impostos sobre a venda e compras de mercadoria. A receita de
 * serviços (assistência técnica, com NFS-e) continua vindo das contas a receber.
 */
export function contasSemNotas(lancs: LancDre[], categorias: CategoriaFin[]) {
  const mapa = new Map(categorias.map((c) => [`${c.tipo}|${norm(c.nome)}`, c.grupo]));
  return lancs.filter((l) => {
    const grupo = l.grupo ?? mapa.get(`${l.tipo === "receber" ? "receita" : "despesa"}|${norm(l.categoria)}`) ?? (l.tipo === "receber" ? "receita" : "despesa_operacional");
    if (grupo === "deducao") return false;
    if (grupo === "receita") return l.origem !== "extrato" && !!norm(l.categoria) && !/^vendas?\b/.test(norm(l.categoria));
    return !(grupo === "custo" && COMPRA_MERCADORIA.test(norm(l.categoria)));
  });
}

// ---------------------------------------------------------------------
// Fixa × variável, margem de contribuição e ponto de equilíbrio
// ---------------------------------------------------------------------
export type Comportamento = "fixa" | "variavel";
export type CategoriaComp = CategoriaFin & { comportamento?: Comportamento | null };

const VARIAVEL_PELO_NOME = /comiss|frete|antecipa|taxa|marketplace|embalag|cmv|devolu|difal|icms|ipi|pis|cofins|gnre|mercadoria|mat[eé]ria/;

/** Fixa ou variável: o que está gravado na categoria ou a sugestão (impostos, custos, comissões, fretes e taxas: variável). */
export function comportamentoDe(grupo: GrupoDre | undefined, nome: string, salvo?: Comportamento | null): { valor: Comportamento; sugerido: boolean } {
  if (salvo === "fixa" || salvo === "variavel") return { valor: salvo, sugerido: false };
  const variavel = grupo === "deducao" || grupo === "custo" || VARIAVEL_PELO_NOME.test(norm(nome));
  return { valor: variavel ? "variavel" : "fixa", sugerido: true };
}

const GRUPO_DA_LINHA: Record<string, GrupoDre> = { deducao: "deducao", custo: "custo", despesas: "despesa_operacional", financeiro: "despesa_financeira" };

export type Contribuicao = {
  receita: number[]; variaveis: number[]; mc: number[]; mcPct: (number | null)[]; fixas: number[];
  pe: (number | null)[]; seguranca: (number | null)[];
  total: { receita: number; variaveis: number; mc: number; mcPct: number | null; fixas: number; pe: number | null; seguranca: number | null };
  categorias: { categoria: string; comportamento: Comportamento; sugerido: boolean; total: number }[];
};

/**
 * A partir das linhas do DRE: margem de contribuição (receita − impostos, custos e despesas variáveis), despesas fixas,
 * ponto de equilíbrio (fixas ÷ margem %) e margem de segurança. "Outras receitas e despesas" e as receitas
 * financeiras ficam fora (não são do dia a dia).
 */
export function contribuicao(linhas: LinhaDre[], categorias: CategoriaComp[], nMeses: number): Contribuicao {
  const porNome = new Map(categorias.map((c) => [norm(c.nome), c]));
  const receita = linhas.find((l) => l.chave === "receita")?.valores ?? Array(nMeses).fill(0);
  const variaveis = Array(nMeses).fill(0), fixas = Array(nMeses).fill(0);
  const cats = new Map<string, Contribuicao["categorias"][number]>();
  for (const l of linhas) {
    const grupoLinha = GRUPO_DA_LINHA[l.chave];
    if (!grupoLinha) continue;
    for (const d of l.detalhes) {
      const cat = porNome.get(norm(d.categoria));
      const c = comportamentoDe(cat?.grupo ?? grupoLinha, d.categoria, cat?.comportamento);
      let soma = 0;
      d.valores.forEach((v, i) => {
        if (v >= 0) return; // entrada (ex.: rendimento) não é custo
        (c.valor === "variavel" ? variaveis : fixas)[i] += -v;
        soma += -v;
      });
      if (soma) {
        const k = norm(d.categoria);
        const atual = cats.get(k);
        cats.set(k, { categoria: d.categoria, comportamento: c.valor, sugerido: c.sugerido, total: r2((atual?.total ?? 0) + soma) });
      }
    }
  }
  const mc = receita.map((r, i) => r2(r - variaveis[i]));
  const mcPct = mc.map((m, i) => (receita[i] > 0 ? m / receita[i] : null));
  const pe = fixas.map((f, i) => (mcPct[i] && mcPct[i]! > 0 ? r2(f / mcPct[i]!) : null));
  const seguranca = pe.map((p, i) => (p !== null && receita[i] > 0 ? (receita[i] - p) / receita[i] : null));
  const soma = (a: number[]) => r2(a.reduce((s, x) => s + x, 0));
  const tR = soma(receita), tV = soma(variaveis), tF = soma(fixas), tMc = r2(tR - tV);
  const tPct = tR > 0 ? tMc / tR : null;
  const tPe = tPct && tPct > 0 ? r2(tF / tPct) : null;
  return {
    receita, variaveis: variaveis.map(r2), mc, mcPct, fixas: fixas.map(r2), pe, seguranca,
    total: { receita: tR, variaveis: tV, mc: tMc, mcPct: tPct, fixas: tF, pe: tPe, seguranca: tPe !== null && tR > 0 ? (tR - tPe) / tR : null },
    categorias: [...cats.values()].sort((a, b) => b.total - a.total),
  };
}

/** Lançamentos de uma unidade (só os dela) ou de todas; quantos estão sem unidade. */
export function daUnidade<T extends { unidade_id?: string | null }>(lancs: T[], unidade: string | null) {
  return unidade ? lancs.filter((l) => l.unidade_id === unidade) : lancs;
}

// ---------------------------------------------------------------------
// Juros e descontos das baixas, taxas por canal e o mesmo mês do ano anterior
// ---------------------------------------------------------------------
type ContaBaixa = LancDre & { id?: string; conta_origem_id?: string | null };

/**
 * Juros, multas e descontos pela diferença entre o valor pago e o valor da conta (só no regime de competência; no
 * de caixa o valor pago já entra). A conta que foi paga em parte e virou "restante" não conta (o valor dela já é o pago).
 */
export function jurosDescontosDasBaixas(lancs: ContaBaixa[]): LancDre[] {
  const pais = new Set(lancs.map((l) => l.conta_origem_id).filter(Boolean) as string[]);
  const out: LancDre[] = [];
  for (const l of lancs) {
    if (l.origem && l.origem !== "conta") continue;
    if (l.status !== "pago" || !l.data_pagamento || l.valor_pago == null || (l.id && pais.has(l.id))) continue;
    const dif = r2(Number(l.valor_pago) - Number(l.valor));
    if (Math.abs(dif) < 0.01) continue;
    const pago = l.tipo === "pagar";
    // pagar a mais = juros pagos; pagar a menos = desconto obtido; receber a mais = juros recebidos; a menos = desconto concedido
    const despesa = pago ? dif > 0 : dif < 0;
    out.push({
      tipo: despesa ? "pagar" : "receber", grupo: despesa ? "despesa_financeira" : "receita_financeira",
      categoria: pago ? (dif > 0 ? "juros e multas pagos (nas baixas)" : "descontos obtidos (nas baixas)") : (dif > 0 ? "juros recebidos (nas baixas)" : "descontos concedidos (nas baixas)"),
      valor: Math.abs(dif), status: "aberto", vencimento: l.data_pagamento, competencia: l.data_pagamento, unidade_id: l.unidade_id ?? null, origem: "baixa",
    });
  }
  return out;
}

const CANAIS: [RegExp, string][] = [
  [/mercado ?livre|mercadolivre|\bmeli\b|mercado ?pago/, "Mercado Livre / Mercado Pago"], [/infinite ?pay/, "InfinitePay"], [/olist|\btiny\b/, "Olist"],
  [/shopee/, "Shopee"], [/tik ?tok/, "TikTok Shop"], [/amazon/, "Amazon"], [/stone/, "Stone"], [/cielo/, "Cielo"], [/getnet/, "Getnet"],
  [/pag ?seguro|pag ?bank/, "PagBank"], [/\binter\b/, "Banco Inter"], [/unicred/, "Unicred"], [/itau|itaú/, "Itaú"], [/bradesco/, "Bradesco"],
  [/santander/, "Santander"], [/caixa econ|\bcef\b/, "Caixa"], [/banco do brasil|\bbb\b/, "Banco do Brasil"], [/sicoob/, "Sicoob"], [/sicredi/, "Sicredi"],
];
/** Taxa de canal: tarifas, taxas de cartão/maquininha, antecipação e comissão de marketplace (compras em marketplace não). */
const EH_TAXA = /tarifa|taxa|antecipa|maquininha|comiss[aã]o (do |de )?(marketplace|mercado)|intermedia/;

/** Canal da taxa: pela conta do banco (extrato), pelo fornecedor, pela descrição ou pela origem da conta. */
export function canalDaTaxa(l: LancDre & { fornecedor?: { nome?: string | null } | null; id_externo?: string | null }) {
  const txt = norm([l.canal, l.fornecedor?.nome, l.descricao, l.id_externo, l.categoria].filter(Boolean).join(" "));
  return CANAIS.find(([re]) => re.test(txt))?.[1] ?? "Outros bancos e tarifas";
}

/** Taxas e tarifas por canal, mês a mês (valores positivos = o que saiu). */
export function taxasPorCanal(lancs: LancDre[], meses: string[]) {
  const mapa = new Map<string, number[]>();
  for (const l of lancs) {
    if (l.tipo !== "pagar" || l.status === "cancelado" || /compra/.test(norm(l.categoria))) continue;
    if (!EH_TAXA.test(norm(`${l.categoria ?? ""} ${l.descricao ?? ""}`))) continue;
    const i = meses.indexOf((l.competencia ?? l.vencimento).slice(0, 7));
    if (i < 0) continue;
    const canal = canalDaTaxa(l);
    const v = mapa.get(canal) ?? meses.map(() => 0);
    v[i] = r2(v[i] + Number(l.valor));
    mapa.set(canal, v);
  }
  return [...mapa.entries()].map(([canal, valores]) => ({ canal, valores, total: r2(valores.reduce((s, x) => s + x, 0)) }))
    .sort((a, b) => b.total - a.total);
}

/** Os mesmos meses um ano antes ("2026-10" → "2025-10"). */
export const mesesAnoAnterior = (meses: string[]) => meses.map((m) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`);

/** Nº de notas de venda e ticket médio por mês (só as vendas da unidade escolhida). */
export function vendasPorMes(vendas: VendaDre[], meses: string[], unidade: string | null) {
  const nNotas = meses.map(() => 0), valor = meses.map(() => 0);
  for (const v of vendas) {
    if (unidade && v.unidade_id !== unidade) continue;
    const i = meses.indexOf(v.dia.slice(0, 7));
    if (i < 0) continue;
    nNotas[i]++; valor[i] += v.valor;
  }
  return { nNotas, ticket: nNotas.map((q, i) => (q ? r2(valor[i] / q) : null)) };
}
