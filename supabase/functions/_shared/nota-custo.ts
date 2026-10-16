// Nota de fornecedor: a conta do custo de entrada de cada item, sem tela, sem banco e sem Deno.
// O mesmo arquivo serve à tela (src/lib/notaFornecedor.ts re-exporta) e à entrada automática das notas
// (_shared/nfe-recebidas.ts), para as duas fazerem a mesma conta. Testes em src/lib/__tests__/notaFornecedor.test.ts.
//  * lê o XML da NF-e (itens com frete, seguro, desconto, IPI, ICMS, ICMS-ST, PIS e COFINS);
//  * rateia frete, seguro, outras despesas e desconto pelo valor dos itens;
//  * calcula o custo de entrada e os créditos do Lucro Real (estimativa: confirmar com o contador).

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Alíquotas do Lucro Real (não cumulativo), as mesmas do Analista fiscal (src/lib/analistaFiscal.ts). */
export const ALIQUOTA_PIS = 1.65;
export const ALIQUOTA_COFINS = 7.6;

/**
 * Compra que dá crédito, pelo CFOP do fornecedor (a mesma regra do Analista fiscal): venda de produção ou revenda
 * (x1xx) e venda com substituição tributária (x4xx: crédito de PIS/COFINS, não de ICMS). Remessa, retorno,
 * transferência, ativo e devolução ficam de fora.
 */
export function cfopDeCompra(cfop?: string | null): "compra" | "st" | null {
  const c = String(cfop ?? "").replace(/\D/g, "");
  if (c.length !== 4 || !"567".includes(c[0])) return null;
  const resto = c.slice(1);
  if (resto[0] === "1" && !resto.startsWith("15")) return "compra";
  if (resto[0] === "4") return "st";
  return null;
}

/* ------------------------------------------------------------------ leitura do XML ------------------------------------------------------------------ */

export type ItemXmlNota = {
  numero: number; codigo: string; ean: string | null; descricao: string; ncm: string | null; cfop: string | null; unidade: string;
  quantidade: number; valor_unitario: number; valor_produto: number;
  /** despesas e desconto que vieram no próprio item (0 quando o fornecedor só pôs no total) */
  frete: number; seguro: number; outras: number; desconto: number;
  ipi: number; icms: number; icms_st: number; fcp_st: number;
  /** crédito de ICMS que o fornecedor do Simples Nacional informa (vCredICMSSN) */
  credito_sn: number;
  /** PIS e COFINS destacados pelo fornecedor (só para conferência: o crédito é calculado pela alíquota da MF) */
  pis: number; cofins: number;
  /** CST ou CSOSN do ICMS */
  cst_icms: string | null;
};

export type TotaisNota = {
  produtos: number; frete: number; seguro: number; outras: number; desconto: number;
  ipi: number; icms: number; icms_st: number; fcp_st: number; total: number;
};

const ENTIDADES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'", "&amp;": "&" };
const decodificar = (s: string) => s.replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENTIDADES[m] ?? m);

/** Conteúdo do primeiro grupo <nome>…</nome> (não confunde ICMS com ICMS00 nem COFINS com COFINSST). */
function grupo(xml: string, nome: string): string | null {
  const m = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`).exec(xml);
  return m ? m[1] : null;
}
/** Texto da primeira tag <nome>valor</nome>. */
function texto(xml: string | null, nome: string): string | null {
  if (!xml) return null;
  const m = new RegExp(`<${nome}(?:\\s[^>]*)?>([^<]*)</${nome}>`).exec(xml);
  return m ? decodificar(m[1].trim()) : null;
}
const valor = (xml: string | null, nome: string) => num(texto(xml, nome));

/**
 * Itens e totais do XML da NF-e (layout 4.00). Devolve null quando não há itens
 * (ex.: só o resumo da SEFAZ, sem o XML completo).
 */
export function lerXmlNota(xml: string | null | undefined): { itens: ItemXmlNota[]; totais: TotaisNota | null } | null {
  if (!xml) return null;
  // tira prefixos de namespace (<nfe:det> → <det>)
  const limpo = xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, "<$1");
  const itens: ItemXmlNota[] = [];
  // <det nItem="1"> (e não <detPag> nem <detExport>)
  const reDet = /<det(?=[\s>])([^>]*)>([\s\S]*?)<\/det>/g;
  let m: RegExpExecArray | null;
  while ((m = reDet.exec(limpo))) {
    const nItem = /nItem="(\d+)"/.exec(m[1])?.[1];
    const corpo = m[2];
    const prod = grupo(corpo, "prod");
    const imposto = grupo(corpo, "imposto");
    const icms = imposto ? grupo(imposto, "ICMS") : null;
    const ipi = imposto ? grupo(imposto, "IPI") : null;
    const pis = imposto ? grupo(imposto, "PIS") : null;
    const cofins = imposto ? grupo(imposto, "COFINS") : null;
    const ean = (texto(prod, "cEAN") ?? "").trim();
    itens.push({
      numero: Number(nItem ?? itens.length + 1),
      codigo: (texto(prod, "cProd") ?? "").trim(),
      ean: /^\d{8,14}$/.test(ean) ? ean : null,
      descricao: (texto(prod, "xProd") ?? "").trim(),
      ncm: texto(prod, "NCM"),
      cfop: texto(prod, "CFOP"),
      unidade: (texto(prod, "uCom") ?? "UN").trim().toUpperCase(),
      quantidade: valor(prod, "qCom"),
      valor_unitario: valor(prod, "vUnCom"),
      valor_produto: valor(prod, "vProd"),
      frete: valor(prod, "vFrete"), seguro: valor(prod, "vSeg"), outras: valor(prod, "vOutro"), desconto: valor(prod, "vDesc"),
      ipi: valor(ipi, "vIPI"),
      icms: valor(icms, "vICMS"),
      icms_st: valor(icms, "vICMSST"),
      fcp_st: valor(icms, "vFCPST"),
      credito_sn: valor(icms, "vCredICMSSN"),
      pis: valor(pis, "vPIS"),
      cofins: valor(cofins, "vCOFINS"),
      cst_icms: texto(icms, "CST") ?? texto(icms, "CSOSN"),
    });
  }
  if (!itens.length) return null;
  const tot = grupo(limpo, "ICMSTot");
  const totais: TotaisNota | null = tot ? {
    produtos: valor(tot, "vProd"), frete: valor(tot, "vFrete"), seguro: valor(tot, "vSeg"), outras: valor(tot, "vOutro"),
    desconto: valor(tot, "vDesc"), ipi: valor(tot, "vIPI"), icms: valor(tot, "vICMS"), icms_st: valor(tot, "vST"),
    fcp_st: valor(tot, "vFCPST"), total: valor(tot, "vNF"),
  } : null;
  return { itens, totais };
}

/** Item vindo só da lista de itens da nota (sem o XML completo): sem impostos nem despesas. */
export function itemSemImpostos(i: { numero: number; codigo: string; descricao: string; ncm?: string | null; cfop?: string | null; unidade?: string | null;
  quantidade: number; valor_unitario: number; valor_total: number; ean?: string | null }): ItemXmlNota {
  return {
    numero: i.numero, codigo: String(i.codigo ?? ""), ean: i.ean ?? null, descricao: i.descricao, ncm: i.ncm ?? null, cfop: i.cfop ?? null,
    unidade: String(i.unidade ?? "UN").toUpperCase(), quantidade: num(i.quantidade), valor_unitario: num(i.valor_unitario),
    valor_produto: num(i.valor_total), frete: 0, seguro: 0, outras: 0, desconto: 0, ipi: 0, icms: 0, icms_st: 0, fcp_st: 0,
    credito_sn: 0, pis: 0, cofins: 0, cst_icms: null,
  };
}

/* ------------------------------------------------------------------ rateio ------------------------------------------------------------------ */

/**
 * Divide um valor entre as partes, na proporção dos pesos (ex.: o valor de cada item), em centavos.
 * A soma das partes é sempre igual ao total (o centavo que sobra vai para quem tem a maior fração).
 */
export function ratear(total: number, pesos: number[]): number[] {
  const n = pesos.length;
  if (!n) return [];
  const sinal = total < 0 ? -1 : 1;
  const centavos = Math.round(Math.abs(total) * 100);
  const positivos = pesos.map((p) => (p > 0 ? p : 0));
  const soma = positivos.reduce((s, p) => s + p, 0);
  const fracoes = soma > 0 ? positivos.map((p) => p / soma) : pesos.map(() => 1 / n);
  const brutos = fracoes.map((f) => centavos * f);
  const partes = brutos.map((b) => Math.floor(b + 1e-9));
  let resto = centavos - partes.reduce((s, p) => s + p, 0);
  const ordem = brutos.map((b, i) => ({ i, f: b - Math.floor(b + 1e-9) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; resto > 0; k++, resto--) partes[ordem[k % n].i]++;
  return partes.map((p) => (sinal * p) / 100);
}

export type Acessorias = { frete: number; seguro: number; outras: number; desconto: number };
const CAMPOS_ACESSORIAS: (keyof Acessorias)[] = ["frete", "seguro", "outras", "desconto"];

/**
 * Frete, seguro, outras despesas e desconto de cada item: o que veio no item e, se o total da nota for
 * maior que a soma dos itens, a diferença rateada pelo valor dos produtos.
 */
export function distribuirAcessorias(
  itens: (Pick<ItemXmlNota, "valor_produto"> & Partial<Acessorias>)[], totais: Partial<Acessorias> | null,
): Acessorias[] {
  const saida = itens.map((i) => ({ frete: num(i.frete), seguro: num(i.seguro), outras: num(i.outras), desconto: num(i.desconto) }));
  if (!totais) return saida;
  const pesos = itens.map((i) => num(i.valor_produto));
  for (const campo of CAMPOS_ACESSORIAS) {
    const somaItens = saida.reduce((s, i) => s + i[campo], 0);
    const falta = r2(num(totais[campo]) - somaItens);
    if (falta <= 0.004) continue;
    ratear(falta, pesos).forEach((v, k) => { saida[k][campo] = r2(saida[k][campo] + v); });
  }
  return saida;
}

/* ------------------------------------------------------------------ custo e créditos ------------------------------------------------------------------ */

/** Quantidade na unidade do ERP (3 casas). */
export const quantidadeErp = (qtd: number, fator: number) => Math.round(num(qtd) * (fator > 0 ? fator : 1) * 1000) / 1000;

/** Para que é a compra: muda o que dá crédito. */
export type Finalidade = "revenda" | "industrializacao" | "consumo";
export const FINALIDADES: { value: Finalidade; label: string; detalhe: string }[] = [
  { value: "revenda", label: "Revenda", detalhe: "Crédito de ICMS, PIS e COFINS. IPI entra no custo." },
  { value: "industrializacao", label: "Industrialização", detalhe: "Crédito de ICMS, IPI, PIS e COFINS." },
  { value: "consumo", label: "Uso e consumo", detalhe: "Sem crédito: tudo entra no custo." },
];

export type OpcoesCusto = {
  finalidade: Finalidade;
  /** true = custo líquido (desconta os créditos que a MF aproveita); false = custo cheio */
  descontarCreditos: boolean;
};

export type ItemCusto = Pick<ItemXmlNota, "cfop" | "quantidade" | "valor_produto" | "ipi" | "icms" | "icms_st" | "fcp_st" | "credito_sn">
  & Acessorias & { extra?: number };

export type Creditos = { icms: number; ipi: number; pis: number; cofins: number; base_pis_cofins: number; total: number };

/**
 * Créditos estimados de um item (Lucro Real). Estimativa: confirmar a regra com o contador.
 *  * ICMS: o destacado (ou o crédito do Simples, vCredICMSSN) em compra para revenda ou industrialização.
 *    Compra com ICMS-ST (CFOP x4xx) não dá crédito de ICMS.
 *  * IPI: só na compra para industrialização.
 *  * PIS 1,65% e COFINS 7,6%: sobre o valor da compra (com frete, seguro e outras despesas, menos o desconto e
 *    com o IPI que não é recuperado), sem o ICMS destacado (Lei 14.592/2023). ICMS-ST fica fora da base (conservador).
 *  * Uso e consumo e operação que não é compra (remessa, devolução…): sem crédito.
 */
export function creditosItem(i: ItemCusto, finalidade: Finalidade): Creditos {
  const tipo = cfopDeCompra(i.cfop);
  if (finalidade === "consumo" || !tipo) return { icms: 0, ipi: 0, pis: 0, cofins: 0, base_pis_cofins: 0, total: 0 };
  const icms = tipo === "compra" ? r2(i.icms > 0 ? i.icms : num(i.credito_sn)) : 0;
  const ipi = finalidade === "industrializacao" ? r2(i.ipi) : 0;
  const base = Math.max(0, r2(i.valor_produto + i.frete + i.seguro + i.outras - i.desconto + (i.ipi - ipi) - i.icms));
  const pis = r2(base * ALIQUOTA_PIS / 100);
  const cofins = r2(base * ALIQUOTA_COFINS / 100);
  return { icms, ipi, pis, cofins, base_pis_cofins: base, total: r2(icms + ipi + pis + cofins) };
}

export type ContaCusto = Acessorias & {
  valor_produto: number; ipi: number; icms_st: number; extra: number;
  /** valor do produto + despesas − desconto + IPI + ICMS-ST (+ FCP-ST) + despesa extra */
  custo_cheio: number;
  creditos: Creditos;
  /** custo cheio, menos os créditos quando "descontar créditos" está ligado */
  custo_total: number;
  fator: number; quantidade_erp: number;
  /** custo de uma unidade do ERP (4 casas) */
  custo_unitario: number;
};

/** Custo de entrada de um item, com a conta inteira para mostrar na tela. */
export function custoItem(i: ItemCusto, fator: number, o: OpcoesCusto): ContaCusto {
  const f = fator > 0 ? fator : 1;
  const extra = num(i.extra);
  const icmsSt = r2(i.icms_st + num(i.fcp_st));
  const cheio = r2(i.valor_produto + i.frete + i.seguro + i.outras - i.desconto + i.ipi + icmsSt + extra);
  const creditos = creditosItem(i, o.finalidade);
  const total = r2(o.descontarCreditos ? cheio - creditos.total : cheio);
  const qtd = quantidadeErp(i.quantidade, f);
  return {
    valor_produto: r2(i.valor_produto), frete: r2(i.frete), seguro: r2(i.seguro), outras: r2(i.outras), desconto: r2(i.desconto),
    ipi: r2(i.ipi), icms_st: icmsSt, extra: r2(extra), custo_cheio: cheio, creditos, custo_total: total,
    fator: f, quantidade_erp: qtd, custo_unitario: qtd > 0 ? r4(total / qtd) : 0,
  };
}

/**
 * Custo de todos os itens da nota: distribui as despesas do total, rateia a despesa extra
 * (ex.: frete pago à parte para a transportadora, sem crédito) pelo valor e calcula cada item.
 */
export function custosDaNota(
  itens: ItemXmlNota[], totais: TotaisNota | null, fatores: number[], o: OpcoesCusto & { despesaExtra?: number },
): ContaCusto[] {
  const acessorias = distribuirAcessorias(itens, totais);
  const extras = num(o.despesaExtra) > 0 ? ratear(num(o.despesaExtra), itens.map((i) => i.valor_produto)) : itens.map(() => 0);
  return itens.map((i, k) => custoItem({ ...i, ...acessorias[k], extra: extras[k] }, fatores[k] ?? 1, o));
}

/** Diferença entre a soma dos custos cheios e o total da nota (+ despesa extra). Perto de zero = a conta fecha. */
export function conferirTotal(contas: ContaCusto[], totais: TotaisNota | null, despesaExtra = 0): number | null {
  if (!totais || !(totais.total > 0)) return null;
  return r2(contas.reduce((s, c) => s + c.custo_cheio, 0) - totais.total - num(despesaExtra));
}

/* ------------------------------------------------------------------ padrão e gravação ------------------------------------------------------------------ */

/**
 * Opções do custo quando ninguém escolhe (entrada automática e tela aberta pela primeira vez):
 * configuracoes.precificacao.custo_nota ("cheio" = sem descontar créditos; padrão: líquido) e
 * configuracoes.precificacao.finalidade_nota (padrão: revenda).
 */
export function opcoesPadraoNota(precificacao: unknown): OpcoesCusto {
  const p = (precificacao && typeof precificacao === "object" ? precificacao : {}) as { custo_nota?: unknown; finalidade_nota?: unknown };
  const fin = String(p.finalidade_nota ?? "");
  return {
    finalidade: fin === "industrializacao" || fin === "consumo" ? fin : "revenda",
    descontarCreditos: p.custo_nota !== "cheio",
  };
}

/** Item da nota já ligado ao produto (o que a entrada no estoque usa). */
export type ItemLigado = { numero: number; codigo: string; descricao: string; produto_id: string | null; quantidade: number; fator?: number | null };

/** Uma linha da conta no formato das funções do banco (nfe_custos_itens). */
export function linhaCusto(i: ItemLigado, c: ContaCusto) {
  return {
    numero: i.numero, codigo: i.codigo, descricao: i.descricao, produto_id: i.produto_id, quantidade: i.quantidade,
    fator: c.fator, quantidade_erp: c.quantidade_erp, valor_produto: c.valor_produto, frete: c.frete, seguro: c.seguro, outras: c.outras,
    desconto: c.desconto, ipi: c.ipi, icms_st: c.icms_st, extra: c.extra, credito_icms: c.creditos.icms, credito_ipi: c.creditos.ipi,
    credito_pis: c.creditos.pis, credito_cofins: c.creditos.cofins, custo_total: c.custo_total, custo_unitario: c.custo_unitario,
  };
}

/**
 * Entrada automática: a conta completa dos itens ligados a produto, pelo XML da nota (sem o XML, só o valor dos
 * produtos). Itens sem produto entram no rateio, mas não na lista.
 */
export function custosAutomaticos(
  xml: string | null | undefined, itens: (ItemLigado & { valor_unitario: number; valor_total: number; cfop?: string | null; unidade?: string | null })[],
  opcoes: OpcoesCusto,
) {
  const lido = lerXmlNota(xml);
  const base = lido?.itens.length ? lido.itens : itens.map((i) => itemSemImpostos({ ...i, codigo: i.codigo ?? "" }));
  const porNumero = new Map(itens.map((i) => [i.numero, i]));
  const fatores = base.map((b) => Number(porNumero.get(b.numero)?.fator) || 1);
  const contas = custosDaNota(base, lido?.totais ?? null, fatores, opcoes);
  return base.flatMap((b, k) => {
    const i = porNumero.get(b.numero);
    // custo zero (brinde) ou abaixo de 1 centavo por unidade (fator errado?): fica de fora, o custo do produto não muda
    if (!i?.produto_id || !(contas[k].custo_unitario >= 0.005)) return [];
    return [{ ...linhaCusto(i, contas[k]), atualizar_custo: true }];
  });
}
