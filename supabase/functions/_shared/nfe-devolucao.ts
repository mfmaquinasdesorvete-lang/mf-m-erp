// NF-e de devolução (finalidade 4), montada a partir da nota original:
//   * devolução de venda: a MF emite nota de ENTRADA para o próprio cliente (comum quando o cliente é pessoa
//     física ou não contribuinte; o cliente contribuinte normalmente emite a dele, que chega em NF-e recebidas);
//   * devolução de compra: a MF emite nota de SAÍDA para o fornecedor, referenciando a NF dele.
// Os impostos acompanham a nota original na proporção devolvida (ICMS e ST pela base/alíquota da original,
// IPI no grupo de "IPI devolvido", PIS/COFINS em "outras operações"). Sem dependências: testável.
//
// ATENÇÃO: CST de PIS/COFINS e o tratamento do crédito variam por empresa. Confira com o contador e teste
// em homologação.
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { type ConfigIbsCbs, grupoIbsCbs } from "./nfe-impostos.ts";

export type TipoDevolucao = "venda" | "compra";

export type Participante = {
  nome: string; doc: string; ie: string | null; indIEDest: number | null;
  logradouro: string; numero: string; complemento: string | null; bairro: string; municipio: string; uf: string; cep: string;
  telefone: string | null; email: string | null;
};

export type ItemOriginal = {
  numero: number; codigo: string; ean: string | null; descricao: string; ncm: string; cest: string | null; cfop: string; unidade: string;
  quantidade: number; valor_unitario: number; valor_bruto: number; desconto: number; frete: number; seguro: number; outras: number; origem: number;
  icms: { cst: string; csosn: boolean; vBC: number; pICMS: number; vICMS: number; pRedBC: number; modBCST: number | null; pMVAST: number; vBCST: number; pICMSST: number; vICMSST: number; pCredSN: number; vCredICMSSN: number };
  ipi: { cst: string | null; vBC: number; pIPI: number; vIPI: number; cEnq: string | null };
  pis: { cst: string; vBC: number; p: number; v: number };
  cofins: { cst: string; vBC: number; p: number; v: number };
  ibscbs: { cst: string; classTrib: string } | null;
  /** partilha do ICMS (DIFAL) da venda a consumidor final de outra UF */
  difal: { vBC: number; pFCP: number; pInterna: number; pInter: number; pPart: number; vFCP: number; vDest: number; vRemet: number } | null;
};

export type NotaOriginal = {
  chave: string; numero: string; serie: string; data: string | null; emitente: Participante; destinatario: Participante; itens: ItemOriginal[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const n = (v: unknown) => Number(v ?? 0) || 0;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();
const lista = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const digitos = (v: unknown) => s(v).replace(/\D/g, "");

// ---------------------------------------------------------------------
// Leitura da nota original
// ---------------------------------------------------------------------
function participante(p: any, end: any): Participante {
  const ie = s(p?.IE);
  return {
    nome: s(p?.xNome), doc: digitos(p?.CNPJ ?? p?.CPF), ie: ie || null,
    indIEDest: p?.indIEDest !== undefined ? n(p.indIEDest) : ie ? (ie.toUpperCase() === "ISENTO" ? 2 : 1) : null,
    logradouro: s(end?.xLgr), numero: s(end?.nro) || "S/N", complemento: s(end?.xCpl) || null, bairro: s(end?.xBairro),
    municipio: s(end?.xMun), uf: s(end?.UF).toUpperCase(), cep: digitos(end?.CEP), telefone: digitos(end?.fone) || null, email: s(p?.email) || null,
  };
}

/** Primeiro grupo de dentro de ICMS/PIS/COFINS (ICMS00, ICMSSN101, PISAliq…). */
const grupo = (g: any) => (g && typeof g === "object" ? Object.values(g)[0] as any : null) ?? {};

/** Lê a NF-e (XML do sistema anterior ou do fornecedor) com tudo o que a devolução precisa. */
export function lerNotaCompleta(xml: string): NotaOriginal {
  const d = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false }).parse(xml);
  const inf = d?.nfeProc?.NFe?.infNFe ?? d?.NFe?.infNFe;
  if (!inf) throw new Error("XML não é uma NF-e válida");
  const chave = s(inf["@_Id"]).replace(/^NFe/, "");
  const itens = lista(inf.det).map((det: any, i: number): ItemOriginal => {
    const p = det.prod ?? {}, imp = det.imposto ?? {};
    const icms = grupo(imp.ICMS), pis = grupo(imp.PIS), cofins = grupo(imp.COFINS);
    const ipiTrib = imp.IPI?.IPITrib, ipiNT = imp.IPI?.IPINT;
    const ibs = imp.IBSCBS, uf = imp.ICMSUFDest;
    const ean = s(p.cEAN);
    return {
      numero: n(det["@_nItem"]) || i + 1, codigo: s(p.cProd), ean: ean && ean !== "SEM GTIN" ? ean : null, descricao: s(p.xProd),
      ncm: s(p.NCM), cest: s(p.CEST) || null, cfop: s(p.CFOP), unidade: s(p.uCom) || "UN",
      quantidade: n(p.qCom), valor_unitario: n(p.vUnCom), valor_bruto: n(p.vProd), desconto: n(p.vDesc), frete: n(p.vFrete),
      seguro: n(p.vSeg), outras: n(p.vOutro), origem: n(icms.orig),
      icms: {
        cst: s(icms.CST ?? icms.CSOSN), csosn: icms.CSOSN !== undefined, vBC: n(icms.vBC), pICMS: n(icms.pICMS), vICMS: n(icms.vICMS),
        pRedBC: n(icms.pRedBC), modBCST: icms.modBCST !== undefined ? n(icms.modBCST) : null, pMVAST: n(icms.pMVAST), vBCST: n(icms.vBCST),
        pICMSST: n(icms.pICMSST), vICMSST: n(icms.vICMSST), pCredSN: n(icms.pCredSN), vCredICMSSN: n(icms.vCredICMSSN),
      },
      ipi: { cst: s(ipiTrib?.CST ?? ipiNT?.CST) || null, vBC: n(ipiTrib?.vBC), pIPI: n(ipiTrib?.pIPI), vIPI: n(ipiTrib?.vIPI), cEnq: s(imp.IPI?.cEnq) || null },
      pis: { cst: s(pis.CST), vBC: n(pis.vBC), p: n(pis.pPIS), v: n(pis.vPIS) },
      cofins: { cst: s(cofins.CST), vBC: n(cofins.vBC), p: n(cofins.pCOFINS), v: n(cofins.vCOFINS) },
      ibscbs: ibs?.CST ? { cst: s(ibs.CST), classTrib: s(ibs.cClassTrib) } : null,
      difal: uf ? { vBC: n(uf.vBCUFDest), pFCP: n(uf.pFCPUFDest), pInterna: n(uf.pICMSUFDest), pInter: n(uf.pICMSInter), pPart: n(uf.pICMSInterPart),
        vFCP: n(uf.vFCPUFDest), vDest: n(uf.vICMSUFDest), vRemet: n(uf.vICMSUFRemet) } : null,
    };
  });
  return {
    chave, numero: s(inf.ide?.nNF), serie: s(inf.ide?.serie), data: s(inf.ide?.dhEmi ?? inf.ide?.dEmi) || null,
    emitente: participante(inf.emit, inf.emit?.enderEmit), destinatario: participante(inf.dest, inf.dest?.enderDest), itens,
  };
}

/** Itens de uma nota emitida pelo ERP (o payload enviado à Focus). */
export function itensDoPayload(payload: any): ItemOriginal[] {
  return lista(payload?.items).map((x: any, i: number): ItemOriginal => ({
    numero: n(x.numero_item) || i + 1, codigo: s(x.codigo_produto), ean: null, descricao: s(x.descricao), ncm: s(x.codigo_ncm), cest: s(x.cest) || null,
    cfop: s(x.cfop), unidade: s(x.unidade_comercial) || "UN", quantidade: n(x.quantidade_comercial), valor_unitario: n(x.valor_unitario_comercial),
    valor_bruto: n(x.valor_bruto), desconto: n(x.valor_desconto), frete: n(x.valor_frete), seguro: n(x.valor_seguro), outras: n(x.valor_outras_despesas),
    origem: n(x.icms_origem),
    icms: {
      cst: s(x.icms_situacao_tributaria), csosn: false, vBC: n(x.icms_base_calculo), pICMS: n(x.icms_aliquota), vICMS: n(x.icms_valor),
      pRedBC: n(x.icms_reducao_base_calculo), modBCST: x.icms_modalidade_base_calculo_st != null ? n(x.icms_modalidade_base_calculo_st) : null,
      pMVAST: n(x.icms_margem_valor_adicionado_st), vBCST: n(x.icms_base_calculo_st), pICMSST: n(x.icms_aliquota_st), vICMSST: n(x.icms_valor_st),
      pCredSN: 0, vCredICMSSN: 0,
    },
    ipi: { cst: s(x.ipi_situacao_tributaria) || null, vBC: n(x.ipi_base_calculo), pIPI: n(x.ipi_aliquota), vIPI: n(x.ipi_valor), cEnq: s(x.ipi_codigo_enquadramento_legal) || null },
    pis: { cst: s(x.pis_situacao_tributaria), vBC: n(x.pis_base_calculo), p: n(x.pis_aliquota_porcentual), v: n(x.pis_valor) },
    cofins: { cst: s(x.cofins_situacao_tributaria), vBC: n(x.cofins_base_calculo), p: n(x.cofins_aliquota_porcentual), v: n(x.cofins_valor) },
    ibscbs: x.ibs_cbs_situacao_tributaria ? { cst: s(x.ibs_cbs_situacao_tributaria), classTrib: s(x.ibs_cbs_classificacao_tributaria) } : null,
    difal: x.icms_base_calculo_uf_destino != null ? {
      vBC: n(x.icms_base_calculo_uf_destino), pFCP: n(x.fcp_percentual_uf_destino), pInterna: n(x.icms_aliquota_interna_uf_destino),
      pInter: n(x.icms_aliquota_interestadual), pPart: n(x.icms_percentual_partilha), vFCP: n(x.fcp_valor_uf_destino),
      vDest: n(x.icms_valor_uf_destino), vRemet: n(x.icms_valor_uf_remetente),
    } : null,
  }));
}

/** Destinatário de uma nota emitida pelo ERP (do payload enviado à Focus). */
export function destinatarioDoPayload(p: any): Participante {
  return {
    nome: s(p?.nome_destinatario), doc: digitos(p?.cnpj_destinatario ?? p?.cpf_destinatario), ie: s(p?.inscricao_estadual_destinatario) || null,
    indIEDest: p?.indicador_inscricao_estadual_destinatario != null ? n(p.indicador_inscricao_estadual_destinatario) : null,
    logradouro: s(p?.logradouro_destinatario), numero: s(p?.numero_destinatario) || "S/N", complemento: s(p?.complemento_destinatario) || null,
    bairro: s(p?.bairro_destinatario), municipio: s(p?.municipio_destinatario), uf: s(p?.uf_destinatario).toUpperCase(), cep: digitos(p?.cep_destinatario),
    telefone: digitos(p?.telefone_destinatario) || null, email: s(p?.email_destinatario) || null,
  };
}

// ---------------------------------------------------------------------
// CFOP da devolução
// ---------------------------------------------------------------------
const VENDA_PRODUCAO = ["101", "103", "105", "107", "109", "111", "113", "116", "118", "122", "124", "125"];
const VENDA_REVENDA = ["102", "104", "106", "108", "110", "112", "114", "115", "117", "119", "120", "123"];

/** CFOPs que a tela oferece para a devolução de compra (sem o 1º dígito). */
export const CFOPS_DEVOLUCAO_COMPRA: [string, string][] = [
  ["202", "compra para comercialização"], ["201", "compra para industrialização"], ["411", "compra para comercialização com ST"],
  ["410", "compra para industrialização com ST"], ["556", "compra de material de uso ou consumo"], ["553", "compra de ativo imobilizado"],
  ["949", "outra saída não especificada"],
];

/**
 * Devolução de venda: espelha a venda original (5101 → 1201, 6102 → 2202, ST 5405 → 1411…).
 * Devolução de compra: depende do uso que a MF deu à mercadoria (comercialização 5202, industrialização 5201…);
 * o padrão é comercialização ou, para insumo, industrialização. A tela deixa trocar.
 */
export function cfopDevolucao(cfopOriginal: string, tipo: TipoDevolucao, interestadual: boolean, tipoProduto?: string | null): string {
  const fim = cfopOriginal.slice(1);
  if (tipo === "venda") {
    const prefixo = { "5": "1", "6": "2", "7": "3" }[cfopOriginal[0]] ?? (interestadual ? "2" : "1");
    const sufixo = VENDA_PRODUCAO.includes(fim) ? "201" : VENDA_REVENDA.includes(fim) ? "202"
      : ["401", "402"].includes(fim) ? "410" : ["403", "405"].includes(fim) ? "411" : fim === "551" ? "553" : "949";
    return prefixo + sufixo;
  }
  const prefixo = interestadual ? "6" : "5";
  const st = ["401", "403", "405"].includes(fim);
  const industrializacao = tipoProduto === "insumo";
  return prefixo + (st ? (industrializacao ? "410" : "411") : industrializacao ? "201" : "202");
}

// ---------------------------------------------------------------------
// Itens da devolução
// ---------------------------------------------------------------------
export type ItemDevolvido = { numero: number; quantidade: number; cfop?: string | null };
type Unidade = { ibs_cbs_cst?: string; ibs_cbs_class_trib?: string };

const ICMS_COM_VALOR = ["00", "10", "20", "51", "70", "90"];
const ICMS_SEM_VALOR = ["40", "41", "50", "60"];

function icmsDevolvido(o: ItemOriginal, r: number, valorItem: number) {
  const ic = o.icms;
  if (ic.vICMS > 0 || ic.vICMSST > 0) {
    const cst = !ic.csosn && ICMS_COM_VALOR.includes(ic.cst) ? ic.cst : "90";
    const base: Record<string, unknown> = { icms_situacao_tributaria: cst };
    if (ic.vICMS > 0) Object.assign(base, { icms_modalidade_base_calculo: 3, icms_base_calculo: r2(ic.vBC * r), icms_aliquota: ic.pICMS, icms_valor: r2(ic.vICMS * r) });
    if (ic.pRedBC > 0 && ["20", "70"].includes(cst)) base.icms_reducao_base_calculo = ic.pRedBC;
    if (ic.vICMSST > 0) Object.assign(base, {
      icms_modalidade_base_calculo_st: ic.modBCST ?? 4, icms_margem_valor_adicionado_st: ic.pMVAST || undefined,
      icms_base_calculo_st: r2(ic.vBCST * r), icms_aliquota_st: ic.pICMSST, icms_valor_st: r2(ic.vICMSST * r),
    });
    return base;
  }
  // fornecedor do Simples com crédito de ICMS: a devolução estorna o crédito aproveitado
  if (ic.csosn && ic.vCredICMSSN > 0) {
    return { icms_situacao_tributaria: "90", icms_modalidade_base_calculo: 3, icms_base_calculo: r2(valorItem), icms_aliquota: ic.pCredSN, icms_valor: r2(ic.vCredICMSSN * r) };
  }
  if (!ic.csosn && ICMS_SEM_VALOR.includes(ic.cst)) return { icms_situacao_tributaria: ic.cst };
  if (ic.csosn && ic.cst === "500") return { icms_situacao_tributaria: "60" };
  return { icms_situacao_tributaria: "90" };
}

/** Itens no formato da Focus, proporcionais à quantidade devolvida. */
export function itensDevolucao(
  originais: ItemOriginal[], devolvidos: ItemDevolvido[], opc: { tipo: TipoDevolucao; interestadual: boolean; unidade: Unidade; ibsCbs: ConfigIbsCbs | null; tiposProduto?: Record<number, string | null> },
) {
  return devolvidos.map((d, idx) => {
    const o = originais.find((x) => x.numero === d.numero);
    if (!o) throw new Error(`item ${d.numero} não existe na nota original`);
    if (!(d.quantidade > 0) || d.quantidade > o.quantidade + 1e-9) throw new Error(`item ${d.numero} (${o.descricao}): devolva de 0 a ${o.quantidade}`);
    const r = d.quantidade / o.quantidade;
    const bruto = r2(d.quantidade * o.valor_unitario);
    const desconto = r2(o.desconto * r), frete = r2(o.frete * r), seguro = r2(o.seguro * r), outras = r2(o.outras * r);
    const liquido = r2(bruto - desconto + frete + seguro + outras);
    const cfop = (d.cfop && /^\d{4}$/.test(d.cfop)) ? d.cfop : cfopDevolucao(o.cfop, opc.tipo, opc.interestadual, opc.tiposProduto?.[o.numero]);
    const icms = icmsDevolvido(o, r, bruto - desconto);
    // IPI: vai no grupo "IPI devolvido" (impostoDevol), proporcional
    const ipi = o.ipi.vIPI > 0 ? { percentual_devolvido: r2(r * 100), valor_ipi_devolvido: r2(o.ipi.vIPI * r) } : {};
    // DIFAL: a devolução de venda a consumidor de outra UF espelha a partilha da venda
    const difal = opc.tipo === "venda" && o.difal ? {
      icms_base_calculo_uf_destino: r2(o.difal.vBC * r), fcp_base_calculo_uf_destino: r2(o.difal.vBC * r), fcp_percentual_uf_destino: o.difal.pFCP,
      icms_aliquota_interna_uf_destino: o.difal.pInterna, icms_aliquota_interestadual: o.difal.pInter, icms_percentual_partilha: o.difal.pPart || 100,
      fcp_valor_uf_destino: r2(o.difal.vFCP * r), icms_valor_uf_destino: r2(o.difal.vDest * r), icms_valor_uf_remetente: r2(o.difal.vRemet * r),
    } : {};
    const cstPc = opc.tipo === "venda" ? "98" : "49";
    const pis = { pis_situacao_tributaria: cstPc, pis_base_calculo: r2(o.pis.vBC * r), pis_aliquota_porcentual: o.pis.p, pis_valor: r2(o.pis.v * r) };
    const cofins = { cofins_situacao_tributaria: cstPc, cofins_base_calculo: r2(o.cofins.vBC * r), cofins_aliquota_porcentual: o.cofins.p, cofins_valor: r2(o.cofins.v * r) };
    const ibsCbs = grupoIbsCbs(o.ibscbs?.cst ?? opc.unidade.ibs_cbs_cst, o.ibscbs?.classTrib || opc.unidade.ibs_cbs_class_trib,
      liquido - Number((icms as any).icms_valor ?? 0) - pis.pis_valor - cofins.cofins_valor
        - Number((difal as any).icms_valor_uf_destino ?? 0) - Number((difal as any).fcp_valor_uf_destino ?? 0), opc.ibsCbs);
    return {
      numero_item: idx + 1,
      codigo_produto: o.codigo || String(o.numero),
      descricao: o.descricao,
      cfop,
      codigo_ncm: o.ncm,
      ...(o.cest ? { cest: o.cest } : {}),
      unidade_comercial: o.unidade, quantidade_comercial: d.quantidade, valor_unitario_comercial: o.valor_unitario,
      unidade_tributavel: o.unidade, quantidade_tributavel: d.quantidade, valor_unitario_tributavel: o.valor_unitario,
      valor_bruto: bruto,
      ...(desconto ? { valor_desconto: desconto } : {}),
      ...(frete ? { valor_frete: frete } : {}),
      ...(seguro ? { valor_seguro: seguro } : {}),
      ...(outras ? { valor_outras_despesas: outras } : {}),
      inclui_no_total: 1,
      icms_origem: o.origem,
      ...icms, ...difal, ...ipi, ...pis, ...cofins, ...ibsCbs,
    };
  });
}

/** Campos do destinatário no formato da Focus. */
export function camposDestinatario(p: Participante) {
  const ind = p.indIEDest ?? (p.ie ? 1 : 9);
  return {
    nome_destinatario: p.nome,
    ...(p.doc.length === 14 ? { cnpj_destinatario: p.doc } : { cpf_destinatario: p.doc }),
    indicador_inscricao_estadual_destinatario: p.doc.length === 11 ? 9 : ind,
    ...(ind === 1 && p.ie && p.ie.toUpperCase() !== "ISENTO" ? { inscricao_estadual_destinatario: digitos(p.ie) } : {}),
    logradouro_destinatario: p.logradouro, numero_destinatario: p.numero, complemento_destinatario: p.complemento || undefined,
    bairro_destinatario: p.bairro, municipio_destinatario: p.municipio, uf_destinatario: p.uf, cep_destinatario: p.cep,
    telefone_destinatario: p.telefone || undefined, email_destinatario: p.email || undefined,
  };
}

/** O que falta no cadastro do destinatário para a SEFAZ aceitar. */
export function faltasDestinatario(p: Participante) {
  return [
    !p.nome && "nome", ![11, 14].includes(p.doc.length) && "CPF/CNPJ", !p.logradouro && "logradouro", !p.bairro && "bairro",
    !p.municipio && "município", p.uf.length !== 2 && "UF", p.cep.length !== 8 && "CEP",
  ].filter(Boolean) as string[];
}
