// Analista fiscal virtual: lê as notas (saídas e entradas), as contas a pagar e o cadastro e devolve
// 1) a apuração estimada do mês (débitos das saídas x créditos das entradas) no Lucro Real,
// 2) a auditoria (o que está errado ou arriscado, com a ação e quem faz) e
// 3) as estratégias legais para pagar menos imposto, com a economia estimada quando dá para calcular.
// Tudo é estimativa gerencial para conversar com o contador: a apuração oficial (SPED, LALUR) é dele.

import { comDestaque } from "./destaque";
import { cbenefObrigatorio } from "../../supabase/functions/_shared/nfe-conferencia";
import { pl } from "@/lib/format";

const r2 = (n: number) => Math.round(n * 100) / 100;
const dig = (v?: string | null) => (v ?? "").replace(/\D/g, "");
const norm = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/* ------------------------------------------------------------------ dados ------------------------------------------------------------------ */

export type NotaSaida = {
  id: string; unidade_id: string | null; status: string; ambiente?: string | null; valor_total: number; created_at: string;
  transferencia_id?: string | null; finalidade?: string | null; tipo_operacao?: string | null; excluida_em?: string | null;
  pedido_id?: string | null; payload?: { items?: Record<string, any>[] } | null;
};
export type NotaEntrada = {
  id: string; unidade_id: string | null; valor_total: number; data_emissao: string | null; emitente_nome?: string | null;
  manifestacao?: string | null; situacao?: string | null; excluida_em?: string | null; origem?: string | null; processamento?: string | null;
  itens?: { cfop?: string | null; ncm?: string | null; valor_total?: number | null }[] | null;
};
export type ContaPagarF = {
  id: string; descricao: string; categoria?: string | null; valor: number; valor_pago?: number | null; status: string;
  vencimento: string; competencia?: string | null; unidade_id?: string | null;
};
export type UnidadeF = {
  id: string; nome: string; codigo?: string; uf?: string | null; regime_tributario?: number | null; fabrica?: boolean;
  icms_aliquota_interna?: number | null; pis_cofins_exclui_icms?: boolean | null; transf_icms_cst?: string | null;
  transf_cbenef?: string | null;
};
export type ProdutoF = { id: string; descricao: string; tipo?: string | null; ncm?: string | null; ipi_aliquota?: number | null; ativo?: boolean | null; vendavel?: boolean | null; kit?: boolean | null };
export type PedidoF = {
  id: string; numero?: number | null; status: string; created_at: string; valor_total?: number | null; unidade_id?: string | null;
  /** NF da venda emitida por outra empresa (empresa ligada) */
  nf_outra_numero?: string | null; nf_outra_empresa?: string | null; nf_outra_data?: string | null;
};

export type Impostos = { icms: number; ipi: number; pis: number; cofins: number; difal: number; fcp: number; ibs: number; cbs: number };
const ZERO: Impostos = { icms: 0, ipi: 0, pis: 0, cofins: 0, difal: 0, fcp: 0, ibs: 0, cbs: 0 };

export const PIS = 1.65, COFINS = 7.6, PIS_COFINS = PIS + COFINS;

/** Mês (aaaa-mm) da conta pela competência (conta fixa) ou pelo vencimento. */
export const mesDaConta = (c: ContaPagarF) => (c.competencia ?? c.vencimento ?? "").slice(0, 7);

/** Os n meses que terminam em `ate` (aaaa-mm), do mais antigo para o mais novo. */
export function mesesAte(ate: string, n: number) {
  const [a, m] = ate.split("-").map(Number);
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - k), 1));
    return d.toISOString().slice(0, 7);
  });
}

/* ------------------------------------------------------------------ saídas ------------------------------------------------------------------ */

/**
 * CFOP de venda (é receita): x1xx de produção ou revenda (menos x15x, transferência) e x40x com substituição tributária.
 * Remessas e retornos (x9xx: conserto, comodato, demonstração, industrialização), devoluções (x2xx), transferências
 * (x15x) e venda de ativo (x55x) não são faturamento.
 */
export function cfopDeVenda(cfop?: string | null) {
  const c = dig(cfop);
  if (c.length !== 4 || !"567".includes(c[0])) return false;
  const r = c.slice(1);
  return (r[0] === "1" && !r.startsWith("15")) || r.startsWith("40");
}
const transferencia = (cfop?: string | null) => /^[567]15\d$/.test(dig(cfop));

/** Saídas que entram na apuração: autorizadas, de produção, de saída e que não são transferência entre SC e SP. */
export const saidaDeVenda = (n: NotaSaida) => {
  if (n.status !== "autorizada" || n.ambiente === "homologacao" || n.excluida_em || n.transferencia_id) return false;
  if ((n.tipo_operacao ?? "saida") === "entrada") return false;
  const itens = n.payload?.items ?? [];
  // nota importada de outro sistema não tem o vínculo da transferência: reconhece pelo CFOP
  return !(itens.length && itens.every((i) => transferencia(i.cfop)));
};

/** Quanto da nota é venda: a nota toda quando todos os itens têm CFOP de venda, nada quando nenhum tem
 *  (transferência, remessa de conserto, comodato, demonstração, devolução) e a soma dos itens de venda quando mistura. */
export function valorDeVenda(n: Pick<NotaSaida, "valor_total" | "transferencia_id" | "tipo_operacao" | "payload">) {
  if (n.transferencia_id || (n.tipo_operacao ?? "saida") === "entrada") return 0;
  const itens = n.payload?.items ?? [];
  if (!itens.length) return Number(n.valor_total ?? 0);
  const vendas = itens.filter((i) => cfopDeVenda(i.cfop));
  if (vendas.length === itens.length) return Number(n.valor_total ?? 0);
  return r2(vendas.reduce((s, i) => s + Number(i.valor_bruto ?? i.valor_total ?? 0) - Number(i.valor_desconto ?? 0), 0));
}

/** Receita (só itens com CFOP de venda) e impostos destacados em todas as saídas apuráveis. */
export function impostosDasNotas(notas: NotaSaida[]) {
  const t = { ...ZERO, receita: 0, notas: 0, producao: 0, ipiProducao: 0 };
  for (const n of notas) {
    const itens = n.payload?.items ?? [];
    const vendas = itens.filter((i) => cfopDeVenda(i.cfop));
    if (vendas.length || !itens.length) t.notas++;
    t.receita += itens.length ? vendas.reduce((s, i) => s + Number(i.valor_bruto ?? i.valor_total ?? 0) - Number(i.valor_desconto ?? 0), 0) : Number(n.valor_total ?? 0);
    for (const i of vendas) if (dig(i.cfop).slice(1) === "101") { t.producao += Number(i.valor_bruto ?? 0); t.ipiProducao += Number(i.ipi_valor ?? 0); }
    for (const i of itens) {
      t.icms += Number(i.icms_valor ?? 0); t.ipi += Number(i.ipi_valor ?? 0);
      t.pis += Number(i.pis_valor ?? 0); t.cofins += Number(i.cofins_valor ?? 0);
      t.difal += Number(i.icms_valor_uf_destino ?? 0); t.fcp += Number(i.fcp_valor_uf_destino ?? 0);
      t.ibs += Number(i.ibs_valor ?? 0); t.cbs += Number(i.cbs_valor ?? 0);
    }
  }
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, r2(v)])) as typeof t;
}

/* ------------------------------------------------------------------ entradas ------------------------------------------------------------------ */

export type TotaisXml = { vProd: number; vICMS: number; vST: number; vIPI: number; vPIS: number; vCOFINS: number; vFrete: number; vNF: number };

/** Totais da NF-e (grupo ICMSTot do XML). Sem o XML completo (só o resumo da SEFAZ) devolve null. */
export function totaisXml(xml: string | null | undefined): TotaisXml | null {
  if (!xml) return null;
  const bloco = /<ICMSTot>([\s\S]*?)<\/ICMSTot>/.exec(xml)?.[1];
  if (!bloco) return null;
  const v = (tag: string) => Number(new RegExp(`<${tag}>([\\d.]+)</${tag}>`).exec(bloco)?.[1] ?? 0);
  return { vProd: v("vProd"), vICMS: v("vICMS"), vST: v("vST"), vIPI: v("vIPI"), vPIS: v("vPIS"), vCOFINS: v("vCOFINS"), vFrete: v("vFrete"), vNF: v("vNF") };
}

/**
 * Compra que dá crédito, pelo CFOP do fornecedor: venda de produção ou revenda (x1xx) e venda com
 * substituição tributária (x4xx, crédito de PIS/COFINS, não de ICMS). Remessas, retornos, transferências,
 * ativo imobilizado e devoluções (x9xx, x15x, x55x, x2xx) ficam de fora.
 */
export function cfopDeCompra(cfop?: string | null) {
  const c = dig(cfop);
  if (c.length !== 4 || !"567".includes(c[0])) return null;
  const resto = c.slice(1);
  if (resto[0] === "1" && !resto.startsWith("15")) return "compra" as const;
  if (resto[0] === "4") return "st" as const;
  return null;
}

/** Créditos estimados das entradas: ICMS e IPI destacados (do XML) e PIS/COFINS de 9,25% sobre a compra sem o ICMS. */
export function creditosEntradas(entradas: NotaEntrada[], xmls: Map<string, TotaisXml | null>) {
  let base = 0, icms = 0, ipi = 0, semXml = 0, valorSemXml = 0, notas = 0;
  for (const n of entradas) {
    if (n.excluida_em || n.situacao === "cancelada") continue;
    const itens = n.itens ?? [];
    const elegivel = itens.length ? itens.filter((i) => cfopDeCompra(i.cfop)) : [];
    if (!elegivel.length) continue;
    notas++;
    const valor = elegivel.reduce((s, i) => s + Number(i.valor_total ?? 0), 0);
    const parte = itens.length ? valor / Math.max(0.01, itens.reduce((s, i) => s + Number(i.valor_total ?? 0), 0)) : 1;
    const t = xmls.get(n.id);
    if (t) {
      const soCompra = elegivel.some((i) => cfopDeCompra(i.cfop) === "compra");
      icms += soCompra ? t.vICMS * parte : 0;
      ipi += t.vIPI * parte;
      base += valor - (soCompra ? t.vICMS * parte : 0); // Lei 14.592/2023: o ICMS destacado sai da base do crédito
    } else {
      if (xmls.has(n.id) || xmls.size) { semXml++; valorSemXml += valor; }
      base += valor;
    }
  }
  return {
    notas, base: r2(base), icms: r2(icms), ipi: r2(ipi),
    pis: r2(base * PIS / 100), cofins: r2(base * COFINS / 100), semXml, valorSemXml: r2(valorSemXml),
  };
}

/* ------------------------------------------------------------------ despesas com crédito ------------------------------------------------------------------ */

/**
 * Despesas que dão crédito de PIS/COFINS no Lucro Real (Leis 10.637/2002 e 10.833/2003, art. 3º, e o conceito de
 * insumo do STJ, REsp 1.221.170): energia, aluguel pago a empresa, frete na venda, manutenção das máquinas da fábrica.
 */
export const DESPESAS_COM_CREDITO: { chave: string; rotulo: string; teste: (cat: string, desc: string) => boolean; base: string }[] = [
  { chave: "energia", rotulo: "Energia elétrica", teste: (c, d) => c.includes("energia") || d.includes("energia") || d.includes("celesc") || d.includes("enel"), base: "art. 3º, III" },
  { chave: "aluguel", rotulo: "Aluguel (pago a empresa)", teste: (c) => c.includes("aluguel"), base: "art. 3º, IV" },
  { chave: "frete", rotulo: "Frete na venda", teste: (c, d) => c.includes("frete") || d.includes("frete"), base: "art. 3º, IX" },
  { chave: "manutencao", rotulo: "Manutenção de máquinas", teste: (c) => c.includes("manuten"), base: "art. 3º, II (insumo)" },
];

export function despesasComCredito(contas: ContaPagarF[], meses: string[]) {
  const dentro = new Set(meses);
  const porTipo = new Map<string, number>();
  for (const c of contas) {
    if (c.status === "cancelado" || !dentro.has(mesDaConta(c))) continue;
    const cat = norm(c.categoria), desc = norm(c.descricao);
    if (cat.includes("imposto") || cat.includes("folha")) continue;
    const t = DESPESAS_COM_CREDITO.find((x) => x.teste(cat, desc));
    if (t) porTipo.set(t.chave, (porTipo.get(t.chave) ?? 0) + Number(c.valor_pago ?? c.valor));
  }
  const linhas = DESPESAS_COM_CREDITO.map((t) => ({ ...t, valor: r2(porTipo.get(t.chave) ?? 0) })).filter((l) => l.valor > 0);
  const total = r2(linhas.reduce((s, l) => s + l.valor, 0));
  return { linhas, total, credito: r2(total * PIS_COFINS / 100) };
}

/* ------------------------------------------------------------------ apuração ------------------------------------------------------------------ */

/** IRPJ (15% + 10% do que passar de R$ 20 mil no mês) e CSLL (9%) sobre o lucro do mês (estimativa por balancete). */
export function irpjCsll(lucro: number, meses = 1) {
  if (lucro <= 0) return { irpj: 0, csll: 0 };
  return { irpj: r2(lucro * 0.15 + Math.max(0, lucro - 20000 * meses) * 0.10), csll: r2(lucro * 0.09) };
}

export type LinhaApuracao = { imposto: string; debito: number; credito: number; saldo: number; nota?: string };

export function apuracao(saidas: ReturnType<typeof impostosDasNotas>, entradas: ReturnType<typeof creditosEntradas>, despesas: { credito: number }, lucro: number | null) {
  const linha = (imposto: string, debito: number, credito: number, nota?: string): LinhaApuracao =>
    ({ imposto, debito: r2(debito), credito: r2(credito), saldo: r2(debito - credito), nota });
  const credPis = entradas.pis + despesas.credito * PIS / PIS_COFINS;
  const credCofins = entradas.cofins + despesas.credito * COFINS / PIS_COFINS;
  const ir = lucro === null ? null : irpjCsll(lucro);
  const linhas = [
    linha("ICMS", saidas.icms, entradas.icms, "crédito do ICMS destacado nas compras com XML completo"),
    linha("IPI", saidas.ipi, entradas.ipi),
    linha("PIS", saidas.pis, credPis, "crédito de 1,65% sobre compras e despesas que dão crédito"),
    linha("COFINS", saidas.cofins, credCofins, "crédito de 7,6% sobre compras e despesas que dão crédito"),
  ];
  if (saidas.difal || saidas.fcp) linhas.push(linha("DIFAL + FCP (UF do cliente)", saidas.difal + saidas.fcp, 0, "venda a consumidor final de outro estado"));
  if (ir) linhas.push(linha("IRPJ (estimativa)", ir.irpj, 0, "15% + 10% acima de R$ 20 mil, sobre o lucro do DRE"), linha("CSLL (estimativa)", ir.csll, 0, "9% sobre o lucro do DRE"));
  const total = r2(linhas.reduce((s, l) => s + Math.max(0, l.saldo), 0));
  return { linhas, total };
}

/* ------------------------------------------------------------------ Lucro Real x Presumido ------------------------------------------------------------------ */

/**
 * Comparação anual, só dos tributos que mudam com o regime (IRPJ, CSLL, PIS, COFINS). ICMS e IPI são iguais
 * nos dois. Presumido de indústria/comércio: base de 8% (IRPJ) e 12% (CSLL), +10% na receita acima de R$ 5 mi/ano
 * (LC 224/2025), PIS/COFINS cumulativo de 3,65% sem crédito.
 */
export function comparaRegimes(a: { receita: number; icms: number; lucro: number; creditosPisCofins: number }) {
  const baseReceita = Math.max(0, a.receita - a.icms); // Tema 69: o ICMS sai da base nos dois regimes
  const pisCofinsReal = Math.max(0, baseReceita * PIS_COFINS / 100 - a.creditosPisCofins);
  const irReal = a.lucro > 0 ? a.lucro * 0.15 + Math.max(0, a.lucro - 240000) * 0.10 : 0;
  const csllReal = a.lucro > 0 ? a.lucro * 0.09 : 0;
  // LC 224/2025: a partir de 2026 a presunção sobe 10% (8% → 8,8%; 12% → 13,2%) na parte da receita acima de R$ 5 milhões no ano
  const ate5mi = Math.min(a.receita, 5_000_000), acima = Math.max(0, a.receita - 5_000_000);
  const baseIr = ate5mi * 0.08 + acima * 0.088, baseCsll = ate5mi * 0.12 + acima * 0.132;
  const pisCofinsPres = baseReceita * 3.65 / 100;
  const irPres = baseIr * 0.15 + Math.max(0, baseIr - 240000) * 0.10;
  const csllPres = baseCsll * 0.09;
  const real = { irpj: r2(irReal), csll: r2(csllReal), pisCofins: r2(pisCofinsReal), total: r2(irReal + csllReal + pisCofinsReal) };
  const presumido = { irpj: r2(irPres), csll: r2(csllPres), pisCofins: r2(pisCofinsPres), total: r2(irPres + csllPres + pisCofinsPres) };
  return { real, presumido, melhor: real.total <= presumido.total ? "real" as const : "presumido" as const, diferenca: r2(Math.abs(real.total - presumido.total)) };
}

/* ------------------------------------------------------------------ auditoria ------------------------------------------------------------------ */

export type Achado = {
  id: string; nivel: "problema" | "alerta" | "ok"; titulo: string; detalhe: string; acao?: string;
  quem?: "Você" | "Contador" | "Você e o contador"; link?: string; valor?: number;
  /** state da navegação do botão "Abrir": a aba da tela e só os registros apontados (destaque) */
  estado?: Record<string, unknown>;
};

export type Estrategia = {
  id: string; titulo: string; porque: string; economia?: number; economiaTexto?: string; como: string[];
  quem: "Você" | "Contador" | "Você e o contador"; base: string; atencao?: string; situacao: "aplicar" | "avaliar" | "ja_aplica";
};

export type ContextoFiscal = {
  hoje: string;
  /** meses do período analisado (12), do mais antigo para o mais novo */
  meses: string[];
  unidades: UnidadeF[];
  produtos: ProdutoF[];
  saidas: NotaSaida[];
  entradas: NotaEntrada[];
  contas: ContaPagarF[];
  categorias: { nome: string }[];
  pedidos: PedidoF[];
  /** lucro do DRE (competência) em cada mês de `meses` */
  lucroMeses: number[];
  /** notas de entrada do mês em foco com o XML lido (para saber quais estão sem XML) */
  xmlsMes: Map<string, TotaisXml | null>;
  mesFoco: string;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const noPeriodo = (d: string | null | undefined, meses: string[]) => !!d && meses.includes(d.slice(0, 7));
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

export function analisar(ctx: ContextoFiscal) {
  const { meses } = ctx;
  const vendas = ctx.saidas.filter((n) => saidaDeVenda(n) && noPeriodo(n.created_at, meses));
  const s12 = impostosDasNotas(vendas);
  const entradas12 = ctx.entradas.filter((n) => noPeriodo(n.data_emissao, meses));
  const c12 = creditosEntradas(entradas12, new Map());
  const d12 = despesasComCredito(ctx.contas, meses);
  const lucro12 = r2(ctx.lucroMeses.reduce((s, v) => s + v, 0));
  // o lucro vem do DRE gerencial (contas a pagar e a receber): com poucos meses lançados ele não serve para decidir regime
  const mesesComContas = meses.filter((m) => ctx.contas.some((c) => c.status !== "cancelado" && mesDaConta(c) === m)).length;
  const dadosFinanceiros = mesesComContas >= 10;
  const ir12 = irpjCsll(lucro12, 12);
  const regimes = comparaRegimes({ receita: s12.receita, icms: s12.icms, lucro: lucro12, creditosPisCofins: c12.pis + c12.cofins + d12.credito });
  const lucroReal = ctx.unidades.every((u) => (u.regime_tributario ?? 3) === 3);
  const fabricaVendeu = (c: ContextoFiscal) => c.unidades.some((u) => u.fabrica);

  /* ---------- auditoria ---------- */
  const achados: Achado[] = [];
  const add = (a: Achado) => achados.push(a);

  const semExclusao = ctx.unidades.filter((u) => u.pis_cofins_exclui_icms === false);
  if (semExclusao.length) add({
    id: "tema69", nivel: "problema", titulo: "PIS/COFINS sendo calculado com o ICMS dentro",
    detalhe: `${semExclusao.map((u) => u.nome).join(", ")}: o STF decidiu (Tema 69) que o ICMS não entra na base do PIS/COFINS.`,
    acao: "Ligar \"Excluir o ICMS da base do PIS/COFINS\" em Notas fiscais → Configurações e pedir ao contador a recuperação dos últimos 5 anos.",
    quem: "Você e o contador", link: "/notas", estado: { aba: "config" }, valor: r2(s12.icms * PIS_COFINS / 100),
  });
  else add({ id: "tema69", nivel: "ok", titulo: "ICMS fora da base do PIS/COFINS", detalhe: "As notas já saem sem o ICMS na base (Tema 69 do STF)." });

  const foraReal = ctx.unidades.filter((u) => (u.regime_tributario ?? 3) !== 3);
  if (foraReal.length) add({
    id: "regime", nivel: "alerta", titulo: "Unidade fora do Lucro Real no cadastro",
    detalhe: `${foraReal.map((u) => u.nome).join(", ")} não está marcada como Lucro Real. As notas podem sair com o regime errado.`,
    acao: "Conferir o regime com o contador e corrigir em Configurações → Unidades.", quem: "Você e o contador", link: "/configuracoes/unidades",
  });

  // SC rejeita a nota sem o código de benefício (cBenef) quando o ICMS sai sem destaque (CST 40, 41, 50…)
  const transfSemCbenef = ctx.unidades.filter((u) => cbenefObrigatorio(u.uf, u.transf_icms_cst) && !(u.transf_cbenef ?? "").trim());
  if (transfSemCbenef.length) add({
    id: "transf_cbenef", nivel: "problema", titulo: "Transferência SC → SP será rejeitada sem o cBenef",
    detalhe: `${transfSemCbenef.map((u) => u.nome).join(", ")}: transferência com CST ${transfSemCbenef.map((u) => u.transf_icms_cst).join("/")} sem o código de benefício fiscal. A SEFAZ recusa a nota (rejeição "CST com benefício fiscal e não informado o código").`,
    acao: "Pedir ao contador o cBenef da transferência (ou a opção de destacar o ICMS, CST 00) e informar em Configurações da NF-e → Transferência.",
    quem: "Você e o contador", link: "/notas", estado: { aba: "config" },
  });

  const transfComIcms = ctx.unidades.filter((u) => u.transf_icms_cst === "00");
  if (transfComIcms.length) add({
    id: "transf", nivel: "alerta", titulo: "Transferência entre SC e SP com ICMS destacado",
    detalhe: `${transfComIcms.map((u) => u.nome).join(", ")}: a transferência sai com ICMS (CST 00), que vira débito na origem e crédito no destino. É uma opção da empresa (LC 87/1996, art. 12, § 5º, com a LC 204/2023; Convênio ICMS 178/2023); a outra é sair sem ICMS (STF, ADC 49).`,
    acao: "Confirmar com o contador que é a opção da empresa (Configurações da NF-e → Transferência).", quem: "Você e o contador", link: "/notas", estado: { aba: "config" },
  });
  else if (ctx.unidades.length > 1 && !transfSemCbenef.length) add({ id: "transf", nivel: "ok", titulo: "Transferências SC ↔ SP sem ICMS", detalhe: "Configuradas sem destaque do ICMS (STF, ADC 49), com o código de benefício quando a UF exige." });

  const pendentes = ctx.saidas.filter((n) => ["erro", "denegada", "contingencia"].includes(n.status) && n.ambiente !== "homologacao" && !n.excluida_em);
  if (pendentes.length) add({
    id: "nfe_pendente", nivel: "problema", titulo: `${pendentes.length} NF-e com erro, denegada ou em contingência`,
    detalhe: "Nota sem autorização não vale: a venda fica sem documento fiscal e o imposto não é apurado.",
    acao: "Abrir em Notas fiscais, corrigir e reenviar (ou cancelar o pedido).", quem: "Você", link: "/notas",
    estado: comDestaque(pendentes.map((n) => n.id), "NF-e com erro, denegada ou em contingência", { aba: "emitidas" }),
  });

  // venda entregue ou faturada sem NF-e autorizada nos últimos 90 dias
  const comNota = new Set(ctx.saidas.filter((n) => n.status === "autorizada" && n.pedido_id).map((n) => n.pedido_id));
  const semNota = ctx.pedidos.filter((p) => ["faturado", "entregue"].includes(p.status) && diasEntre(p.created_at, ctx.hoje) <= 90 && !comNota.has(p.id) && !p.nf_outra_numero);
  if (semNota.length) add({
    id: "venda_sem_nota", nivel: "alerta", titulo: `${semNota.length} ${pl(semNota.length, "venda", "vendas")} ${pl(semNota.length, "entregue", "entregues")} ou ${pl(semNota.length, "faturada", "faturadas")} sem NF-e no ERP`,
    detalhe: `Pedidos ${semNota.slice(0, 6).map((p) => `#${p.numero ?? "?"}`).join(", ")}${semNota.length > 6 ? "…" : ""}. Se a nota foi emitida fora do ERP, importe o XML; se não foi, é risco fiscal.`,
    acao: "Emitir a NF-e pelo pedido ou importar o XML da nota emitida em outro sistema.", quem: "Você", link: "/pedidos",
    estado: comDestaque(semNota.map((p) => p.id), "vendas entregues ou faturadas sem NF-e"),
    valor: r2(semNota.reduce((s, p) => s + Number(p.valor_total ?? 0), 0)),
  });

  // venda da MF faturada com a NF de outra empresa (empresa ligada): a receita e o imposto são de quem emitiu a nota
  const outraEmpresa = ctx.pedidos.filter((p) => p.nf_outra_numero && !comNota.has(p.id));
  if (outraEmpresa.length) add({
    id: "nf_outra_empresa", nivel: "alerta", titulo: `${outraEmpresa.length} ${pl(outraEmpresa.length, "venda faturada", "vendas faturadas")} com a NF de outra empresa`,
    detalhe: `Pedidos ${outraEmpresa.slice(0, 6).map((p) => `#${p.numero ?? "?"} (NF ${p.nf_outra_numero}${p.nf_outra_empresa ? ` de ${p.nf_outra_empresa}` : ""})`).join(", ")}${outraEmpresa.length > 6 ? "…" : ""}. `
      + "A receita e os impostos são de quem emitiu a nota; o pedido fica no ERP para o histórico do cliente e da máquina. Confirmar com o contador como acertar entre as empresas.",
    acao: "Mostrar ao contador a lista desses pedidos com o número das notas.", quem: "Contador", link: "/pedidos",
    estado: comDestaque(outraEmpresa.map((p) => p.id), "vendas faturadas com a NF de outra empresa"),
    valor: r2(outraEmpresa.reduce((s, p) => s + Number(p.valor_total ?? 0), 0)),
  });

  // mesma regra do Compliance fiscal: nota importada por XML ou ignorada não precisa de manifestação
  const semManif = ctx.entradas.filter((n) => !n.excluida_em && n.situacao !== "cancelada" && n.origem !== "xml" && n.processamento !== "ignorada" && n.data_emissao
    && !["confirmacao", "desconhecimento", "nao_realizada"].includes(n.manifestacao ?? "") && diasEntre(n.data_emissao, ctx.hoje) > 30);
  if (semManif.length) add({
    id: "manifestacao", nivel: semManif.some((n) => diasEntre(n.data_emissao!, ctx.hoje) > 150) ? "problema" : "alerta",
    titulo: `${semManif.length} ${pl(semManif.length, "nota", "notas")} de fornecedor sem manifestação conclusiva`,
    detalhe: "Sem \"Confirmação da operação\" a nota fica sem o XML completo e o crédito de ICMS/IPI não aparece. O prazo legal é de 180 dias.",
    acao: "Em Notas fiscais → Recebidas, confirmar as compras (ou marcar \"desconhecida\" se não for sua).", quem: "Você", link: "/notas",
    estado: comDestaque(semManif.map((n) => n.id), "notas de fornecedor sem manifestação conclusiva", { aba: "recebidas" }),
  });

  const entradasMes = ctx.entradas.filter((n) => (n.data_emissao ?? "").startsWith(ctx.mesFoco) && !n.excluida_em && (n.itens ?? []).some((i) => cfopDeCompra(i.cfop)));
  const semXml = entradasMes.filter((n) => ctx.xmlsMes.has(n.id) && !ctx.xmlsMes.get(n.id));
  if (semXml.length) add({
    id: "sem_xml", nivel: "alerta", titulo: `${semXml.length} ${pl(semXml.length, "compra", "compras")} do mês sem o XML completo`,
    detalhe: `${brl(semXml.reduce((s, n) => s + Number(n.valor_total), 0))} em notas só com o resumo da SEFAZ: o ICMS e o IPI delas não entram nos créditos.`,
    acao: "Confirmar a operação (manifestação) para a SEFAZ liberar o XML, ou importar o XML que o fornecedor mandou por e-mail.", quem: "Você", link: "/notas",
    estado: comDestaque(semXml.map((n) => n.id), "compras do mês sem o XML completo", { aba: "recebidas" }),
  });

  const das = ctx.contas.filter((c) => noPeriodo(mesDaConta(c) + "-01", meses) && /\b(das|simples nacional)\b/.test(norm(c.descricao)));
  if (das.length && lucroReal) add({
    id: "das", nivel: "problema", titulo: "Guia do Simples Nacional numa empresa do Lucro Real",
    detalhe: `${das.length} ${pl(das.length, "conta", "contas")} a pagar com "DAS/Simples" na descrição (${brl(das.reduce((s, c) => s + Number(c.valor), 0))}). No Lucro Real não existe DAS: pode ser lançamento errado ou pagamento indevido.`,
    acao: "Conferir com o contador; se foi pago, pedir restituição. Corrigir a descrição/categoria da conta.", quem: "Você e o contador", link: "/financeiro",
    estado: comDestaque(das.map((c) => c.id), "contas com DAS/Simples na descrição", { aba: "pagar" }),
  });

  const nomesPlano = new Set(ctx.categorias.map((c) => norm(c.nome)));
  const contas12 = ctx.contas.filter((c) => c.status !== "cancelado" && meses.includes(mesDaConta(c)));
  const semCat = contas12.filter((c) => !norm(c.categoria) || ["outros", "outras", "diversos"].includes(norm(c.categoria)));
  if (semCat.length) add({
    id: "sem_categoria", nivel: "alerta", titulo: `${semCat.length} ${pl(semCat.length, "conta", "contas")} a pagar sem categoria (ou "outros")`,
    detalhe: `${brl(semCat.reduce((s, c) => s + Number(c.valor), 0))} em 12 meses. Sem a categoria certa o DRE fica errado e o contador pode deixar de aproveitar crédito (energia, frete, aluguel, manutenção).`,
    acao: "Dar a categoria certa às contas (Financeiro → Contas a pagar → Editar).", quem: "Você", link: "/financeiro",
    estado: comDestaque(semCat.map((c) => c.id), "contas a pagar sem categoria (ou \"outros\")", { aba: "pagar" }),
  });
  const foraPlano = [...new Set(contas12.map((c) => (c.categoria ?? "").trim()).filter((c) => c && !nomesPlano.has(norm(c))))];
  if (foraPlano.length && nomesPlano.size) add({
    id: "fora_plano", nivel: "alerta", titulo: `Categoria${foraPlano.length > 1 ? "s" : ""} fora do plano de contas`,
    detalhe: `${foraPlano.slice(0, 8).map((c) => `"${c}"`).join(", ")}: contas com nome diferente do plano entram no DRE como despesa genérica.`,
    acao: "Unificar o nome (ex.: \"fretes\" → \"frete\") ou criar a categoria no Plano de contas.", quem: "Você", link: "/financeiro",
    estado: comDestaque(contas12.filter((c) => foraPlano.includes((c.categoria ?? "").trim())).map((c) => c.id), "contas com categoria fora do plano de contas", { aba: "pagar" }),
  });

  const ativos = ctx.produtos.filter((p) => p.ativo !== false && p.vendavel !== false && !p.kit);
  const semNcm = ativos.filter((p) => dig(p.ncm).length !== 8);
  if (semNcm.length) add({
    id: "ncm", nivel: "problema", titulo: `${semNcm.length} ${pl(semNcm.length, "produto", "produtos")} sem NCM válido`,
    detalhe: `${semNcm.slice(0, 5).map((p) => p.descricao).join("; ")}${semNcm.length > 5 ? "…" : ""}. O NCM define IPI, ICMS-ST e a alíquota na Reforma; errado, a nota é rejeitada ou o imposto sai errado.`,
    acao: "Corrigir o NCM no cadastro do produto.", quem: "Você", link: "/estoque",
    estado: comDestaque(semNcm.map((p) => p.id), "produtos sem NCM válido"),
  });
  const fabrica = ctx.unidades.some((u) => u.fabrica);
  const maqSemIpi = fabrica ? ativos.filter((p) => p.tipo === "maquina" && p.ipi_aliquota == null) : [];
  if (maqSemIpi.length) add({
    id: "ipi", nivel: "alerta", titulo: `${maqSemIpi.length} ${pl(maqSemIpi.length, "máquina", "máquinas")} ${pl(maqSemIpi.length, "fabricada", "fabricadas")} sem alíquota de IPI`,
    detalhe: "A alíquota vem da TIPI pelo NCM. Sem ela a nota pode sair sem IPI (risco de autuação) ou com IPI a mais.",
    acao: "Conferir na TIPI com o contador e preencher a alíquota no cadastro.", quem: "Você e o contador", link: "/estoque",
    estado: comDestaque(maqSemIpi.map((p) => p.id), "máquinas fabricadas sem alíquota de IPI"),
  });

  if (fabricaVendeu(ctx) && s12.producao > 0 && s12.ipiProducao === 0) add({
    id: "ipi_producao", nivel: "alerta", titulo: `${brl(s12.producao)} em vendas de produção própria sem IPI`,
    detalhe: "Nenhuma venda com CFOP 5101/6101 dos últimos 12 meses tem IPI destacado. Se a TIPI dá alíquota para o NCM das máquinas, falta IPI (risco de autuação). Se a alíquota é zero, o IPI pago nas compras vira saldo credor que pode ser recuperado.",
    acao: "Confirmar com o contador a alíquota da TIPI de cada máquina e preencher no cadastro do produto.", quem: "Você e o contador", link: "/estoque",
    estado: comDestaque(ativos.filter((p) => p.tipo === "maquina").map((p) => p.id), "máquinas: conferir a alíquota do IPI"),
  });

  if (s12.difal + s12.fcp > 0) add({
    id: "difal", nivel: "alerta", titulo: `${brl(s12.difal + s12.fcp)} de DIFAL nos últimos 12 meses`,
    detalhe: "DIFAL só é devido na venda a consumidor final não contribuinte de outro estado. Cliente com inscrição estadual (contribuinte) não paga DIFAL na revenda.",
    acao: "Conferir se esses clientes não têm IE (cadastro em Clientes → Receita) antes das próximas vendas.", quem: "Você", link: "/clientes",
  });

  /* ---------- estratégias ---------- */
  const est: Estrategia[] = [];
  const energia = d12.linhas.find((l) => l.chave === "energia")?.valor ?? 0;

  est.push({
    id: "credito_despesas", situacao: d12.total ? "avaliar" : "aplicar",
    titulo: "Crédito de PIS/COFINS sobre energia, aluguel, fretes e manutenção",
    porque: "No Lucro Real, 9,25% dessas despesas voltam como crédito, desde que pagas a empresas e ligadas à operação.",
    economia: d12.credito || undefined, economiaTexto: d12.total ? `${brl(d12.total)} dessas despesas em 12 meses` : "Classifique as despesas para o ERP calcular",
    como: ["Confirme com o contador se esses créditos já entram na EFD-Contribuições.", "Mantenha a categoria certa nas contas a pagar (energia, aluguel, frete, manutenção).", "Guarde as notas/faturas: o crédito depende do documento."],
    quem: "Você e o contador", base: "Leis 10.637/2002 e 10.833/2003, art. 3º; STJ REsp 1.221.170 (conceito de insumo)",
  });
  est.push({
    id: "credito_compras", situacao: "avaliar",
    titulo: "Crédito de PIS/COFINS sobre todas as compras de insumos (inclusive de fornecedor do Simples)",
    porque: "Peças, matéria-prima e embalagens compradas para a produção dão crédito de 9,25%, mesmo quando o fornecedor é do Simples Nacional.",
    economia: r2(c12.pis + c12.cofins) || undefined,
    economiaTexto: c12.base ? `${brl(c12.base)} em compras com nota nos últimos 12 meses` : undefined,
    como: ["Confirmar as notas de compra (manifestação) para ter o XML.", "Revisar com o contador se compras do Simples e embalagens estão gerando crédito."],
    quem: "Contador", base: "Lei 10.833/2003, art. 3º, II; IN RFB 2.121/2022",
  });
  if (energia > 0) est.push({
    id: "icms_energia", situacao: "avaliar",
    titulo: "Crédito de ICMS da energia usada na fábrica",
    porque: "A energia consumida no processo de industrialização dá crédito do ICMS cobrado na conta de luz.",
    economia: r2(energia * 0.12), economiaTexto: "estimativa: ~12% da conta de energia da produção",
    como: ["Separar (laudo técnico simples ou medidor) quanto da energia é da produção.", "O contador lança o crédito na apuração do ICMS."],
    quem: "Você e o contador", base: "LC 87/1996 (Lei Kandir), art. 33, II, b",
  });
  if (fabricaVendeu(ctx) && s12.producao > 0 && s12.ipiProducao === 0) est.push({
    id: "ipi_saldo", situacao: "avaliar",
    titulo: "Saldo credor de IPI: compensar com outros tributos ou pedir de volta",
    porque: "Se as máquinas saem com IPI zero e as compras de insumos vêm com IPI, esse IPI pago vira saldo credor. Ele pode ser compensado com outros tributos federais (como o PIS/COFINS ou o IRPJ) ou ressarcido em dinheiro.",
    economiaTexto: "o IPI destacado nas notas de compra de insumos (veja a Apuração do mês)",
    como: ["Confirmar com o contador que a alíquota das máquinas na TIPI é zero.", "Conferir o saldo credor no livro de IPI (EFD ICMS/IPI).", "Pedir o ressarcimento/compensação trimestral pelo PER/DCOMP."],
    quem: "Contador", base: "Lei 9.779/1999, art. 11; IN RFB 2.055/2021",
  });
  est.push({
    id: "ativo", situacao: "avaliar",
    titulo: "Crédito sobre máquinas e equipamentos comprados para a fábrica",
    porque: "Máquina nova da produção dá crédito de PIS/COFINS (9,25%) e de ICMS (em 48 parcelas, pelo CIAP).",
    economiaTexto: "~9,25% do valor da máquina em PIS/COFINS + ICMS da nota em 48 meses",
    como: ["Lançar a compra do equipamento com a NF-e (não como despesa).", "Pedir ao contador o controle do CIAP e o crédito de PIS/COFINS do ativo."],
    quem: "Contador", base: "Lei 10.833/2003, art. 3º, VI; LC 87/1996, art. 20, §5º (CIAP)",
  });
  est.push({
    id: "lei_bem", situacao: "avaliar",
    titulo: "Lei do Bem: desconto no IRPJ/CSLL por desenvolver máquinas",
    porque: "Projetos de desenvolvimento e melhoria de máquinas (P&D) permitem excluir de 60% a 80% (até 100% com patente) desses gastos do lucro, além do gasto normal.",
    economiaTexto: "≈ R$ 20 a R$ 27 de economia a cada R$ 100 gastos em P&D",
    como: ["Registrar os projetos (objetivo, horas da equipe, protótipos, testes).", "O contador faz a exclusão no LALUR e o envio anual ao MCTI (FORMP&D)."],
    quem: "Você e o contador", base: "Lei 11.196/2005, arts. 17 a 26; Decreto 5.798/2006",
    atencao: "Só vale no Lucro Real e quando há lucro fiscal no ano.",
  });
  est.push({
    id: "jcp", situacao: "avaliar",
    titulo: "Juros sobre capital próprio (JCP) em vez de só distribuir lucro",
    porque: "O JCP pago aos sócios é dedutível (economiza 34% de IRPJ/CSLL) e o sócio paga 15% na fonte: sobra ~19% de economia sobre o valor pago.",
    economiaTexto: "até ~19% do JCP pago (limite pela TJLP sobre o patrimônio líquido; precisa de lucro no ano)",
    como: ["O contador calcula o limite (TJLP × patrimônio líquido ajustado).", "Deliberar e pagar/creditar o JCP aos sócios no período."],
    quem: "Contador", base: "Lei 9.249/1995, art. 9º (com as mudanças da Lei 14.789/2023)",
  });
  // só os meses com contas lançadas: mês vazio no financeiro não é prejuízo
  const temContas = meses.map((m) => ctx.contas.some((c) => c.status !== "cancelado" && mesDaConta(c) === m));
  const mesesPrejuizo = ctx.lucroMeses.filter((v, k) => temContas[k] && v <= 0).length;
  const receitaMeses = meses.map((m) => impostosDasNotas(vendas.filter((n) => n.created_at.startsWith(m))).receita);
  const antecipacaoEvitavel = dadosFinanceiros
    ? r2(ctx.lucroMeses.reduce((s, v, k) => s + (temContas[k] && v <= 0 ? receitaMeses[k] * (0.08 * 0.15 + 0.12 * 0.09) : 0), 0)) : 0;
  est.push({
    id: "suspensao", situacao: mesesPrejuizo ? "aplicar" : "avaliar",
    titulo: "Pagar IRPJ/CSLL mensal pelo lucro real do mês (suspensão/redução)",
    porque: "Na estimativa mensal sobre o faturamento você antecipa imposto mesmo em mês fraco. Com o balancete, paga só sobre o lucro de verdade.",
    economia: antecipacaoEvitavel || undefined,
    economiaTexto: mesesPrejuizo ? `${mesesPrejuizo} ${pl(mesesPrejuizo, "mês", "meses")} com prejuízo nos últimos 12 (deixaria de antecipar)` : "ganho de caixa nos meses mais fracos",
    como: ["Pedir ao contador o balancete mensal de suspensão/redução.", "Manter o financeiro do ERP em dia (é a base do balancete)."],
    quem: "Contador", base: "Lei 8.981/1995, art. 35; Lei 9.430/1996, art. 2º",
  });
  if (ctx.contas.some((c) => norm(c.categoria).includes("folha"))) est.push({
    id: "pat", situacao: "avaliar",
    titulo: "PAT: alimentação dos funcionários com dedução no IRPJ",
    porque: "Quem dá alimentação (vale ou refeitório) inscrito no PAT deduz parte do gasto do IRPJ devido.",
    economiaTexto: "até 4% do IRPJ (parcela de 15%)",
    como: ["Inscrever a empresa no PAT (gov.br).", "O contador faz a dedução na apuração do IRPJ."],
    quem: "Você e o contador", base: "Lei 6.321/1976; Decreto 10.854/2021",
  });
  est.push({
    id: "doacoes", situacao: "avaliar",
    titulo: "Doações incentivadas: destinar parte do IRPJ sem custo",
    porque: "Parte do IRPJ pode ir para projetos (criança e adolescente, idoso, cultura, esporte) e ser abatida do imposto: o valor sai do imposto, não do caixa.",
    economiaTexto: dadosFinanceiros && ir12.irpj ? `IRPJ estimado: ${brl(ir12.irpj)} no ano` : undefined,
    como: ["Escolher os fundos/projetos com o contador até dezembro.", "Guardar os recibos para a dedução."],
    quem: "Contador", base: "Lei 8.069/1990 (FIA), Lei 12.213/2010 (Idoso), Lei 8.313/1991 (Rouanet), Lei 11.438/2006 (Esporte)",
    atencao: "Cada lei tem um limite sobre o IRPJ; só no Lucro Real.",
  });
  est.push({
    id: "tema69_passado", situacao: semExclusao.length ? "aplicar" : "ja_aplica",
    titulo: "ICMS fora da base do PIS/COFINS (e recuperar o passado)",
    porque: semExclusao.length ? "Hoje as notas ainda calculam PIS/COFINS com o ICMS dentro." : "O ERP já calcula sem o ICMS. Se antes do ERP a empresa pagou com o ICMS na base, dá para pedir de volta os últimos 5 anos.",
    economia: semExclusao.length ? r2(s12.icms * PIS_COFINS / 100) : undefined,
    economiaTexto: semExclusao.length ? undefined : "recuperação dos 5 anos anteriores, se pagou a mais",
    como: ["Pedir ao contador o levantamento dos pagamentos antigos.", "Compensar pelo PER/DCOMP."],
    quem: "Contador", base: "STF, RE 574.706 (Tema 69)",
  });
  est.push({
    id: "ncm_tipi", situacao: "avaliar",
    titulo: "Classificação fiscal (NCM) das máquinas e peças",
    porque: "O NCM decide a alíquota de IPI e, na Reforma, o IBS/CBS. Classificação errada faz pagar a mais (ou gera autuação).",
    como: ["Revisar com o contador o NCM de cada máquina na TIPI.", "Pedir Solução de Consulta à Receita se houver dúvida entre dois NCM."],
    quem: "Você e o contador", base: "TIPI (Decreto 11.158/2022) e Regras Gerais de Interpretação do SH",
  });
  if (!dadosFinanceiros) est.push({
    id: "regime", situacao: "avaliar",
    titulo: "Lucro Real x Presumido: comparar quando o financeiro tiver o ano todo",
    porque: `O lucro do ano vem do financeiro do ERP, que tem contas em só ${mesesComContas} dos 12 meses. Com isso a comparação daria um resultado enganoso.`,
    como: ["Lançar no ERP as contas a pagar e a receber dos meses que faltam (ou importar do sistema anterior).", "Enquanto isso, o contador compara com o balancete contábil, até dezembro."],
    quem: "Você e o contador", base: "Lei 9.718/1998; Lei 9.430/1996; LC 224/2025; LC 214/2025",
  });
  else est.push({
    id: "regime", situacao: lucroReal && regimes.melhor === "presumido" && regimes.diferenca > 5000 ? "avaliar" : "ja_aplica",
    titulo: regimes.melhor === "real" ? "Lucro Real é o regime mais barato hoje" : "Comparar Lucro Real x Presumido para o próximo ano",
    porque: regimes.melhor === "real"
      ? `Pela estimativa dos últimos 12 meses, o Lucro Real custa ${brl(regimes.diferenca)} a menos que o Presumido.`
      : `Pela estimativa, o Presumido custaria ${brl(regimes.diferenca)} a menos. A troca só pode ser feita em janeiro.`,
    economia: regimes.melhor === "presumido" ? regimes.diferenca : undefined,
    como: ["Ver a aba \"Real x Presumido\" com a conta detalhada.", "Decidir com o contador até dezembro (vale o ano todo).", "A partir de 2027 o PIS/COFINS vira CBS para todos: a diferença entre os regimes passa a ser só o IRPJ/CSLL."],
    quem: "Contador", base: "Lei 9.718/1998; Lei 9.430/1996; LC 224/2025 (presunção maior acima de R$ 5 mi); LC 214/2025 (CBS a partir de 2027)",
    atencao: "Estimativa com o lucro do DRE do ERP; o contador refaz com o lucro contábil.",
  });
  est.push({
    id: "reforma", situacao: "avaliar",
    titulo: "Reforma tributária: preparar compras e preços para a CBS (2027)",
    porque: "Em 2026 o IBS/CBS de teste (0,9% + 0,1%) é compensado. Em 2027 a CBS substitui PIS/COFINS com crédito amplo: fornecedor que não gera crédito encarece a compra.",
    como: ["Preferir fornecedores que destacam CBS/IBS (Simples só dá crédito pequeno, salvo se optar pelo regime regular).", "Revisar a formação de preço com o crédito novo.", "Acompanhar o split payment (pagamento já separando o imposto)."],
    quem: "Você e o contador", base: "EC 132/2023; LC 214/2025",
  });

  const resumo = {
    problemas: achados.filter((a) => a.nivel === "problema").length,
    alertas: achados.filter((a) => a.nivel === "alerta").length,
    oks: achados.filter((a) => a.nivel === "ok").length,
    /** soma das economias estimadas que ainda não estão aplicadas (a conferir com o contador: parte pode já ser aproveitada) */
    economia: r2(est.filter((e) => e.situacao !== "ja_aplica").reduce((s, e) => s + (e.economia ?? 0), 0)),
    oportunidades: est.filter((e) => e.situacao !== "ja_aplica").length,
  };
  return { achados, estrategias: est, resumo, s12, c12, d12, lucro12, ir12, regimes, vendas, mesesComContas, dadosFinanceiros };
}
