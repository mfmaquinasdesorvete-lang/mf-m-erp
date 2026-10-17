// DRE pelas notas (como no Tiny) e margem de contribuição:
//  • Receita bruta, impostos destacados (ICMS, IPI, PIS, COFINS, DIFAL e FCP), devoluções de venda e o custo dos
//    produtos vendidos (CMV, pelo custo do cadastro) saem das NF-e, no mês da emissão. As despesas continuam vindo
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
};
export type NotaDre = Omit<NotaVenda, "payload"> & { transferencia_id?: string | null; payload?: { items?: ItemNotaDre[] } | null };
export type DevolucaoRecebida = { id: string; data_emissao: string | null; valor_total: number | string | null; unidade_id?: string | null;
  finalidade?: string | null; situacao?: string | null; excluida_em?: string | null };

/** Categorias que as notas criam no DRE (nomes mostrados no detalhe das linhas). */
export const CAT_NOTAS = {
  receita: "vendas (NF-e)", icms: "ICMS destacado", ipi: "IPI destacado", pis: "PIS destacado", cofins: "COFINS destacado",
  difal: "DIFAL e FCP", devolucoes: "devoluções de vendas", cmv: "CMV (custo do cadastro)",
} as const;

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (x: number) => Math.round(x * 100) / 100;
/** Dia da emissão em Brasília (a nota guarda o instante em UTC). */
export const diaBrasilia = (iso: string) => new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);

/** Nota de venda que entra no DRE: autorizada, de produção, saída normal, fora as transferências entre as unidades. */
export const notaDeVendaDre = (nf: NotaDre) => nf.status === "autorizada" && nf.ambiente !== "homologacao" && !nf.excluida_em
  && (nf.tipo_operacao ?? "saida") === "saida" && (nf.finalidade ?? "normal") === "normal" && !nf.transferencia_id;

/** Lançamentos do DRE tirados das NF-e (receita, deduções e CMV), com quantos itens ficaram sem custo no cadastro. */
export function notasParaDre(notas: NotaDre[], recebidas: DevolucaoRecebida[], produtos: Produto[]) {
  const achar = indiceProdutos(produtos);
  const out: LancDre[] = [];
  let semCusto = 0, notasVenda = 0;
  const lanc = (tipo: LancDre["tipo"], grupo: GrupoDre, categoria: string, valor: number, dia: string, unidade_id?: string | null) => {
    if (Math.abs(valor) < 0.005) return;
    out.push({ tipo, grupo, categoria, valor: r2(valor), status: "aberto", vencimento: dia, competencia: dia, unidade_id: unidade_id ?? null, origem: "nota" });
  };
  for (const nf of notas) {
    const dia = diaBrasilia(nf.created_at);
    // devolução de venda emitida pela MF (NF-e de entrada de devolução)
    if (nf.finalidade === "devolucao" && nf.tipo_operacao === "entrada") {
      if (nf.status === "autorizada" && nf.ambiente !== "homologacao" && !nf.excluida_em) lanc("pagar", "deducao", CAT_NOTAS.devolucoes, n(nf.valor_total), dia, nf.unidade_id);
      continue;
    }
    if (!notaDeVendaDre(nf)) continue;
    const itens = (nf.payload?.items ?? []).filter((i) => CFOP_VENDA.test(String(i.cfop ?? "").replace(/\D/g, "")));
    if (!itens.length) continue;
    notasVenda++;
    const s = (f: (i: ItemNotaDre) => number) => itens.reduce((t, i) => t + f(i), 0);
    const ipi = s((i) => n(i.ipi_valor));
    lanc("receber", "receita", CAT_NOTAS.receita, s((i) => n(i.valor_bruto) - n(i.valor_desconto)) + ipi, dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.icms, s((i) => n(i.icms_valor)), dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.ipi, ipi, dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.pis, s((i) => n(i.pis_valor)), dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.cofins, s((i) => n(i.cofins_valor)), dia, nf.unidade_id);
    lanc("pagar", "deducao", CAT_NOTAS.difal, s((i) => n(i.icms_valor_uf_destino) + n(i.fcp_valor_uf_destino)), dia, nf.unidade_id);
    let cmv = 0;
    for (const i of itens) {
      const p = achar(i);
      const custo = n(p?.preco_custo);
      if (!custo) { semCusto++; continue; }
      cmv += custo * (n(i.quantidade_comercial) || 1);
    }
    lanc("pagar", "custo", CAT_NOTAS.cmv, cmv, dia, nf.unidade_id);
  }
  // devolução de venda que o cliente emitiu (chegou da SEFAZ)
  for (const r of recebidas) {
    if (r.finalidade !== "devolucao" || r.excluida_em || r.situacao === "cancelada" || !r.data_emissao) continue;
    lanc("pagar", "deducao", CAT_NOTAS.devolucoes, n(r.valor_total), r.data_emissao.slice(0, 10), r.unidade_id);
  }
  return { lancamentos: out, semCusto, notasVenda };
}

/** Compras de mercadoria e matéria-prima: no DRE pelas notas o CMV entra no lugar delas. */
const COMPRA_MERCADORIA = /^fornecedores$|mat[eé]ria[- ]prima|mercadoria/;

/** Contas e extratos que ficam no DRE pelas notas: sai o que as notas já contam (vendas, impostos sobre a venda, compras). */
export function contasSemNotas(lancs: LancDre[], categorias: CategoriaFin[]) {
  const mapa = new Map(categorias.map((c) => [`${c.tipo}|${norm(c.nome)}`, c.grupo]));
  return lancs.filter((l) => {
    const grupo = l.grupo ?? mapa.get(`${l.tipo === "receber" ? "receita" : "despesa"}|${norm(l.categoria)}`) ?? (l.tipo === "receber" ? "receita" : "despesa_operacional");
    if (grupo === "receita" || grupo === "deducao") return false;
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
