// Impostos dos itens da NF-e no lucro real (ICMS, IPI, PIS, COFINS, DIFAL e IBS/CBS), por unidade emitente.
// Arquivo sem dependências (testável e usado também pelo ERP para mostrar a prévia dos impostos).
//
// ATENÇÃO: são regras gerais. CST, alíquotas, benefícios e a TIPI de cada NCM
// precisam ser conferidos pelo contador, e tudo testado em homologação.

export type UnidadeFiscal = {
  uf: string; fabrica: boolean;
  natureza_operacao: string; cfop_venda_producao: string; cfop_venda_revenda: string;
  icms_cst: string; icms_aliquota_interna: number; icms_reducao_base: number;
  pis_cst: string; pis_aliquota: number; cofins_cst: string; cofins_aliquota: number; pis_cofins_exclui_icms: boolean;
  ipi_cst: string; ipi_enquadramento: string; difal_ativo: boolean;
  transf_icms_cst: string; transf_pis_cofins_cst: string; transf_destacar_ipi: boolean;
  /** Reforma Tributária: CST e classificação tributária (cClassTrib) do IBS/CBS na venda e na transferência. */
  ibs_cbs_cst?: string; ibs_cbs_class_trib?: string; transf_ibs_cbs_cst?: string; transf_ibs_cbs_class_trib?: string;
  /** CST do IPI quando a alíquota da TIPI é zero (51 = saída tributada com alíquota zero). */
  ipi_cst_aliquota_zero?: string;
};

/** Alíquotas do IBS/CBS do ano (Configurações da NF-e). 2026: CBS 0,9% e IBS 0,1%, sem recolhimento. */
export type ConfigIbsCbs = { ativo: boolean; cbs: number; ibs_uf: number; ibs_mun: number };

export type ItemBase = {
  codigo: string; descricao: string; ncm: string; cest?: string | null; unidade: string;
  origem: number;                 // 0 nacional; 1, 2, 3, 8 = conteúdo importado
  tipo: string;                   // maquina | peca | acessorio | insumo
  quantidade: number; valor_unitario: number;
  desconto?: number; frete?: number;
  cfop?: string | null;           // CFOP próprio do produto (sobrepõe a regra)
  ipi_aliquota?: number | null;
};

export type AliquotasUf = Record<string, { aliquota_interna: number; fcp: number }>;

/**
 * Regra de tributação (Configurações → Regras de tributação). Condições vazias valem para tudo;
 * vale a primeira regra que combinar, pela prioridade (menor primeiro). Campos de resultado vazios
 * mantêm o cálculo padrão da unidade.
 */
export type RegraTributaria = {
  id?: string; nome: string; ativo?: boolean; prioridade: number;
  unidade_id?: string | null; operacao?: string | null; destino?: string | null; tipo_cliente?: string | null;
  tipo_produto?: string | null; ncm_prefixo?: string | null; origem_mercadoria?: string | null; cfop?: string | null;
  cfop_saida?: string | null; icms_cst?: string | null; icms_aliquota?: number | null; icms_reducao_base?: number | null;
  difal?: boolean | null; ipi_cst?: string | null; ipi_aliquota?: number | null; ipi_enquadramento?: string | null;
  pis_cst?: string | null; pis_aliquota?: number | null; cofins_cst?: string | null; cofins_aliquota?: number | null;
  observacao_nfe?: string | null;
  /** Só para estas UFs de destino (vazio = qualquer). */
  ufs_destino?: string[] | null;
  ibs_cbs_cst?: string | null; ibs_cbs_class_trib?: string | null;
};

export type ContextoRegra = {
  operacao: "venda" | "transferencia"; interestadual: boolean; contribuinte: boolean;
  tipo: string; ncm: string; origem: number; cfop: string; unidade_id?: string | null; uf_destino?: string;
};

const vazio = (v: unknown) => v === null || v === undefined || v === "";
const IMPORTADA = [1, 2, 3, 6, 7, 8];

/** Primeira regra ativa que combina com a operação e o item (ou null). */
export function regraAplicavel(regras: RegraTributaria[] | undefined, c: ContextoRegra): RegraTributaria | null {
  if (!regras?.length) return null;
  const ok = (r: RegraTributaria) =>
    r.ativo !== false &&
    (vazio(r.unidade_id) || vazio(c.unidade_id) || r.unidade_id === c.unidade_id) &&
    (vazio(r.operacao) || r.operacao === c.operacao) &&
    (vazio(r.destino) || r.destino === (c.interestadual ? "interestadual" : "interna")) &&
    (vazio(r.tipo_cliente) || r.tipo_cliente === (c.contribuinte ? "contribuinte" : "nao_contribuinte")) &&
    (vazio(r.tipo_produto) || r.tipo_produto === c.tipo) &&
    (vazio(r.ncm_prefixo) || c.ncm.startsWith(String(r.ncm_prefixo).replace(/\D/g, ""))) &&
    (vazio(r.origem_mercadoria) || r.origem_mercadoria === (IMPORTADA.includes(Number(c.origem)) ? "importada" : "nacional")) &&
    (vazio(r.cfop) || String(r.cfop).replace(/\D/g, "") === c.cfop) &&
    (!r.ufs_destino?.length || r.ufs_destino.map((x) => String(x).trim().toUpperCase()).includes(String(c.uf_destino ?? "").toUpperCase()));
  return [...regras].sort((a, b) => Number(a.prioridade) - Number(b.prioridade)).find(ok) ?? null;
}

/** Unidade com os valores da regra por cima (o que a regra deixou vazio continua igual). */
function comRegra(u: UnidadeFiscal, r: RegraTributaria | null): UnidadeFiscal {
  if (!r) return u;
  const x = { ...u };
  if (!vazio(r.icms_cst)) x.icms_cst = r.icms_cst!;
  if (!vazio(r.icms_reducao_base)) x.icms_reducao_base = Number(r.icms_reducao_base);
  if (!vazio(r.difal)) x.difal_ativo = !!r.difal;
  if (!vazio(r.ipi_cst)) x.ipi_cst = r.ipi_cst!;
  if (!vazio(r.ipi_enquadramento)) x.ipi_enquadramento = r.ipi_enquadramento!;
  if (!vazio(r.pis_cst)) x.pis_cst = r.pis_cst!;
  if (!vazio(r.pis_aliquota)) x.pis_aliquota = Number(r.pis_aliquota);
  if (!vazio(r.cofins_cst)) x.cofins_cst = r.cofins_cst!;
  if (!vazio(r.cofins_aliquota)) x.cofins_aliquota = Number(r.cofins_aliquota);
  if (!vazio(r.ibs_cbs_cst)) { x.ibs_cbs_cst = r.ibs_cbs_cst!; x.transf_ibs_cbs_cst = r.ibs_cbs_cst!; }
  if (!vazio(r.ibs_cbs_class_trib)) { x.ibs_cbs_class_trib = r.ibs_cbs_class_trib!; x.transf_ibs_cbs_class_trib = r.ibs_cbs_class_trib!; }
  return x;
}

export type OpcoesRegras = { regras?: RegraTributaria[]; unidade_id?: string | null; usadas?: Set<RegraTributaria>; ibsCbs?: ConfigIbsCbs | null };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const SUL_SUDESTE = ["SP", "RJ", "MG", "PR", "SC", "RS"]; // ES fica de fora (recebe 7%)

/** Alíquota interestadual: 4% importado; 7% de S/SE (menos ES) para N, NE, CO e ES; 12% nos demais casos. */
export function aliquotaInterestadual(ufOrigem: string, ufDestino: string, origemMercadoria: number) {
  if ([1, 2, 3, 8].includes(Number(origemMercadoria))) return 4;
  return SUL_SUDESTE.includes(ufOrigem) && !SUL_SUDESTE.includes(ufDestino) ? 7 : 12;
}

const trocarParaInterestadual = (cfop: string, inter: boolean) => (inter && cfop.startsWith("5") ? "6" + cfop.slice(1) : cfop);

function base(i: ItemBase) {
  const bruto = r2(i.quantidade * i.valor_unitario);
  return { bruto, liquido: r2(bruto - (i.desconto ?? 0) + (i.frete ?? 0)) };
}

function camposProduto(i: ItemBase, n: number, cfop: string, valorUnitario = i.valor_unitario) {
  const bruto = r2(i.quantidade * valorUnitario);
  return {
    numero_item: n,
    codigo_produto: i.codigo,
    descricao: i.descricao,
    cfop,
    codigo_ncm: i.ncm,
    ...(i.cest ? { cest: i.cest } : {}),
    unidade_comercial: i.unidade,
    quantidade_comercial: i.quantidade,
    valor_unitario_comercial: valorUnitario,
    unidade_tributavel: i.unidade,
    quantidade_tributavel: i.quantidade,
    valor_unitario_tributavel: valorUnitario,
    valor_bruto: bruto,
    ...(i.desconto ? { valor_desconto: r2(i.desconto) } : {}),
    ...(i.frete ? { valor_frete: r2(i.frete) } : {}),
    inclui_no_total: 1,
    icms_origem: i.origem,
  };
}

/** CST do IBS/CBS sem valores: isenção (400) e imunidade/não incidência (410) levam só os códigos. */
const IBS_CBS_SEM_VALOR = ["400", "410"];

/**
 * Grupo IBS/CBS do item (Reforma Tributária, NT 2025.002). A base é o valor da operação sem ICMS,
 * PIS e COFINS (regra da transição); o IPI não entra. Sem configuração ou desligado: não manda o grupo.
 */
export function grupoIbsCbs(cst: string | undefined, classTrib: string | undefined, base: number, cfg?: ConfigIbsCbs | null) {
  if (!cfg?.ativo || !cst) return {};
  const codigos = { ibs_cbs_situacao_tributaria: cst, ibs_cbs_classificacao_tributaria: classTrib || `${cst}001` };
  if (IBS_CBS_SEM_VALOR.includes(cst)) return codigos;
  const b = r2(Math.max(0, base));
  const ibsUf = r2(b * Number(cfg.ibs_uf) / 100), ibsMun = r2(b * Number(cfg.ibs_mun) / 100), cbs = r2(b * Number(cfg.cbs) / 100);
  return {
    ...codigos,
    ibs_cbs_base_calculo: b,
    ibs_uf_aliquota: Number(cfg.ibs_uf), ibs_uf_valor: ibsUf,
    ibs_mun_aliquota: Number(cfg.ibs_mun), ibs_mun_valor: ibsMun,
    ibs_valor: r2(ibsUf + ibsMun),
    cbs_aliquota: Number(cfg.cbs), cbs_valor: cbs,
  };
}

/** CST do IPI que não leva base/alíquota (grupo IPINT): 01–05 e 51–55. */
const IPI_NAO_TRIBUTADO = ["01", "02", "03", "04", "05", "51", "52", "53", "54", "55"];

/** Itens de uma venda: CFOP (produção x revenda, dentro x fora do estado) e todos os impostos. */
export function itensVenda(unidade: UnidadeFiscal, dest: { uf: string; contribuinte: boolean }, itens: ItemBase[], ufs: AliquotasUf, opc: OpcoesRegras = {}) {
  const inter = dest.uf.toUpperCase() !== unidade.uf.toUpperCase();
  const consumidorFinal = !dest.contribuinte;
  return itens.map((i, idx) => {
    const { liquido } = base(i);
    const produzido = i.tipo === "maquina" && unidade.fabrica;
    const cfopPadrao = trocarParaInterestadual(i.cfop || (produzido ? unidade.cfop_venda_producao : unidade.cfop_venda_revenda), inter);
    const regra = regraAplicavel(opc.regras, { operacao: "venda", interestadual: inter, contribuinte: dest.contribuinte, tipo: i.tipo, ncm: i.ncm, origem: i.origem, cfop: cfopPadrao, unidade_id: opc.unidade_id, uf_destino: dest.uf.toUpperCase() });
    if (regra) opc.usadas?.add(regra);
    const u = comRegra(unidade, regra);
    const cfop = regra?.cfop_saida ? String(regra.cfop_saida).replace(/\D/g, "") : cfopPadrao;

    // IPI: só na saída do que esta unidade fabrica (a regra pode definir outra alíquota)
    const ipiAliq = !vazio(regra?.ipi_aliquota) ? Number(regra!.ipi_aliquota) : produzido ? Number(i.ipi_aliquota ?? 0) : 0;
    const ipiValor = ipiAliq > 0 ? r2(liquido * ipiAliq / 100) : 0;
    // TIPI 0% no que a unidade fabrica (ou a regra definiu o CST): manda o CST de alíquota zero, sem base
    const cstIpiZero = !vazio(regra?.ipi_cst) ? regra!.ipi_cst! : produzido ? u.ipi_cst_aliquota_zero : undefined;
    const ipi = ipiAliq > 0
      ? { ipi_situacao_tributaria: u.ipi_cst, ipi_codigo_enquadramento_legal: u.ipi_enquadramento, ipi_base_calculo: liquido, ipi_aliquota: ipiAliq, ipi_valor: ipiValor }
      : cstIpiZero
        ? (IPI_NAO_TRIBUTADO.includes(cstIpiZero)
          ? { ipi_situacao_tributaria: cstIpiZero, ipi_codigo_enquadramento_legal: u.ipi_enquadramento }
          : { ipi_situacao_tributaria: cstIpiZero, ipi_codigo_enquadramento_legal: u.ipi_enquadramento, ipi_base_calculo: liquido, ipi_aliquota: 0, ipi_valor: 0 })
        : {};

    // ICMS: IPI entra na base quando o comprador é consumidor final
    const aliq = !vazio(regra?.icms_aliquota) ? Number(regra!.icms_aliquota) : inter ? aliquotaInterestadual(u.uf, dest.uf, i.origem) : Number(u.icms_aliquota_interna);
    const tributado = ["00", "10", "20", "70", "90"].includes(u.icms_cst);
    const icmsBase = tributado ? r2((liquido + (consumidorFinal ? ipiValor : 0)) * (1 - Number(u.icms_reducao_base) / 100)) : 0;
    const icmsValor = r2(icmsBase * aliq / 100);
    const icms = tributado
      ? { icms_situacao_tributaria: u.icms_cst, icms_modalidade_base_calculo: 3, icms_base_calculo: icmsBase, icms_aliquota: aliq, icms_valor: icmsValor,
          ...(Number(u.icms_reducao_base) > 0 ? { icms_reducao_base_calculo: Number(u.icms_reducao_base) } : {}) }
      : { icms_situacao_tributaria: u.icms_cst };

    // DIFAL: venda para consumidor final não contribuinte de outro estado
    let difal: Record<string, number> = {};
    const uf = ufs[dest.uf.toUpperCase()];
    if (inter && consumidorFinal && u.difal_ativo && tributado && uf) {
      const dif = Math.max(0, Number(uf.aliquota_interna) - aliq);
      difal = {
        icms_base_calculo_uf_destino: icmsBase,
        fcp_base_calculo_uf_destino: icmsBase,
        fcp_percentual_uf_destino: Number(uf.fcp),
        icms_aliquota_interna_uf_destino: Number(uf.aliquota_interna),
        icms_aliquota_interestadual: aliq,
        icms_percentual_partilha: 100,
        fcp_valor_uf_destino: r2(icmsBase * Number(uf.fcp) / 100),
        icms_valor_uf_destino: r2(icmsBase * dif / 100),
        icms_valor_uf_remetente: 0,
      };
    }

    // PIS/COFINS não cumulativos; ICMS fora da base (Tema 69/STF) se configurado
    const pcBase = r2(liquido - (u.pis_cofins_exclui_icms ? icmsValor : 0));
    const comValor = (cst: string) => ["01", "02"].includes(cst);
    const pis = comValor(u.pis_cst)
      ? { pis_situacao_tributaria: u.pis_cst, pis_base_calculo: pcBase, pis_aliquota_porcentual: Number(u.pis_aliquota), pis_valor: r2(pcBase * Number(u.pis_aliquota) / 100) }
      : { pis_situacao_tributaria: u.pis_cst };
    const cofins = comValor(u.cofins_cst)
      ? { cofins_situacao_tributaria: u.cofins_cst, cofins_base_calculo: pcBase, cofins_aliquota_porcentual: Number(u.cofins_aliquota), cofins_valor: r2(pcBase * Number(u.cofins_aliquota) / 100) }
      : { cofins_situacao_tributaria: u.cofins_cst };

    const pisValor = Number((pis as any).pis_valor ?? 0), cofinsValor = Number((cofins as any).cofins_valor ?? 0);
    const ibsCbs = grupoIbsCbs(u.ibs_cbs_cst, u.ibs_cbs_class_trib,
      liquido - (tributado ? icmsValor : 0) - pisValor - cofinsValor - Number(difal.icms_valor_uf_destino ?? 0) - Number(difal.fcp_valor_uf_destino ?? 0), opc.ibsCbs);

    return { ...camposProduto(i, idx + 1, cfop), ...icms, ...difal, ...ipi, ...pis, ...cofins, ...ibsCbs };
  });
}

/** Itens de transferência entre unidades (valor = custo; CFOP 5151/6151 produção, 5152/6152 demais). */
export function itensTransferencia(unidade: UnidadeFiscal, ufDestino: string, itens: ItemBase[], opc: OpcoesRegras = {}) {
  const inter = ufDestino.toUpperCase() !== unidade.uf.toUpperCase();
  return itens.map((i, idx) => {
    const produzido = i.tipo === "maquina" && unidade.fabrica;
    const cfopPadrao = trocarParaInterestadual(produzido ? "5151" : "5152", inter);
    const regra = regraAplicavel(opc.regras, { operacao: "transferencia", interestadual: inter, contribuinte: true, tipo: i.tipo, ncm: i.ncm, origem: i.origem, cfop: cfopPadrao, unidade_id: opc.unidade_id, uf_destino: ufDestino.toUpperCase() });
    if (regra) opc.usadas?.add(regra);
    const origem = { ...unidade, ...(regra && !vazio(regra.icms_cst) ? { transf_icms_cst: regra.icms_cst! } : {}),
      ...(regra && !vazio(regra.pis_cst) ? { transf_pis_cofins_cst: regra.pis_cst! } : {}),
      ...(regra && !vazio(regra.ipi_cst) ? { ipi_cst: regra.ipi_cst! } : {}),
      ...(regra && !vazio(regra.ibs_cbs_cst) ? { transf_ibs_cbs_cst: regra.ibs_cbs_cst! } : {}),
      ...(regra && !vazio(regra.ibs_cbs_class_trib) ? { transf_ibs_cbs_class_trib: regra.ibs_cbs_class_trib! } : {}) };
    const cfop = regra?.cfop_saida ? String(regra.cfop_saida).replace(/\D/g, "") : cfopPadrao;
    const { liquido } = base(i);
    const ipiAliq = !vazio(regra?.ipi_aliquota) ? Number(regra!.ipi_aliquota) : produzido && origem.transf_destacar_ipi ? Number(i.ipi_aliquota ?? 0) : 0;
    const ipi = ipiAliq > 0
      ? { ipi_situacao_tributaria: origem.ipi_cst, ipi_codigo_enquadramento_legal: origem.ipi_enquadramento, ipi_base_calculo: liquido, ipi_aliquota: ipiAliq, ipi_valor: r2(liquido * ipiAliq / 100) }
      : {};
    const aliq = !vazio(regra?.icms_aliquota) ? Number(regra!.icms_aliquota) : inter ? aliquotaInterestadual(origem.uf, ufDestino, i.origem) : Number(origem.icms_aliquota_interna);
    const icms = origem.transf_icms_cst === "00"
      ? { icms_situacao_tributaria: "00", icms_modalidade_base_calculo: 3, icms_base_calculo: liquido, icms_aliquota: aliq, icms_valor: r2(liquido * aliq / 100) }
      : { icms_situacao_tributaria: origem.transf_icms_cst };
    // IBS/CBS: transferência entre estabelecimentos do mesmo contribuinte não tem incidência (CST 410 / 410002)
    const ibsCbs = grupoIbsCbs(origem.transf_ibs_cbs_cst ?? "410", origem.transf_ibs_cbs_class_trib ?? "410002",
      liquido - Number((icms as any).icms_valor ?? 0), opc.ibsCbs);
    return {
      ...camposProduto(i, idx + 1, cfop), ...icms, ...ipi,
      pis_situacao_tributaria: origem.transf_pis_cofins_cst,
      cofins_situacao_tributaria: origem.transf_pis_cofins_cst,
      ...ibsCbs,
    };
  });
}

/** Soma dos tributos (para conferência na tela). */
export function resumoImpostos(items: Record<string, any>[]) {
  const s = (k: string) => r2(items.reduce((t, i) => t + Number(i[k] ?? 0), 0));
  return { icms: s("icms_valor"), ipi: s("ipi_valor"), pis: s("pis_valor"), cofins: s("cofins_valor"), difal: s("icms_valor_uf_destino"), fcp: s("fcp_valor_uf_destino"),
    ibs: s("ibs_valor"), cbs: s("cbs_valor") };
}
