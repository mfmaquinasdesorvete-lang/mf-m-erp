// Leitura do XML da NF-e (layout 4.00 da SEFAZ): itens e duplicatas.
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

export type ItemNota = {
  numero: number;
  codigo: string;
  ean: string | null;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
};

export type Duplicata = { numero: string | null; vencimento: string; valor: number };

const lista = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const doc = (xml: string) => new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false }).parse(xml);

function infNFe(xml: string): any {
  // parseTagValue: false mantém tudo como texto (preserva zeros à esquerda em códigos)
  const d = doc(xml);
  const inf = d?.nfeProc?.NFe?.infNFe ?? d?.NFe?.infNFe;
  if (!inf) throw new Error("XML não é uma NF-e válida");
  return inf;
}

export type Cabecalho = {
  chave: string; numero: string; emitente_cnpj: string; emitente_nome: string;
  destinatario_cnpj: string | null; valor_total: number; data_emissao: string | null;
  /** Pelo protocolo que vem junto no XML (o Tiny exporta a cancelada com cStat 101). */
  situacao: "autorizada" | "cancelada" | "sem_protocolo";
};

const CSTAT_AUTORIZADA = ["100", "150"], CSTAT_CANCELADA = ["101", "151", "135", "155"];

/** Dados principais da nota (para importar o XML enviado pelo fornecedor). */
export function lerCabecalho(xml: string): Cabecalho {
  const inf = infNFe(xml);
  const cStat = String(doc(xml)?.nfeProc?.protNFe?.infProt?.cStat ?? "");
  const chave = String(inf["@_Id"] ?? "").replace(/^NFe/, "");
  if (!/^\d{44}$/.test(chave)) throw new Error("XML sem chave de acesso válida");
  return {
    chave,
    numero: String(inf.ide?.nNF ?? ""),
    emitente_cnpj: String(inf.emit?.CNPJ ?? inf.emit?.CPF ?? ""),
    emitente_nome: String(inf.emit?.xNome ?? ""),
    destinatario_cnpj: inf.dest?.CNPJ ? String(inf.dest.CNPJ) : null,
    valor_total: Number(inf.total?.ICMSTot?.vNF ?? 0),
    data_emissao: inf.ide?.dhEmi ? String(inf.ide.dhEmi) : inf.ide?.dEmi ? String(inf.ide.dEmi) : null,
    situacao: CSTAT_AUTORIZADA.includes(cStat) ? "autorizada" : CSTAT_CANCELADA.includes(cStat) ? "cancelada" : "sem_protocolo",
  };
}

export function lerNfe(xml: string): { itens: ItemNota[]; duplicatas: Duplicata[] } {
  const inf = infNFe(xml);

  const itens = lista(inf.det).map((d: any, i: number): ItemNota => {
    const p = d.prod ?? {};
    const ean = String(p.cEAN ?? "").trim();
    return {
      numero: Number(d["@_nItem"] ?? i + 1),
      codigo: String(p.cProd ?? "").trim(),
      ean: ean && ean !== "SEM GTIN" ? ean : null,
      descricao: String(p.xProd ?? "").trim(),
      ncm: p.NCM ? String(p.NCM) : null,
      cfop: p.CFOP ? String(p.CFOP) : null,
      unidade: String(p.uCom ?? "UN").trim(),
      quantidade: Number(p.qCom ?? 0),
      valor_unitario: Number(p.vUnCom ?? 0),
      valor_total: Number(p.vProd ?? 0),
    };
  });

  const duplicatas = lista(inf.cobr?.dup)
    .map((d: any): Duplicata => ({
      numero: d.nDup ? String(d.nDup) : null,
      vencimento: String(d.dVenc ?? "").slice(0, 10),
      valor: Number(d.vDup ?? 0),
    }))
    .filter((d) => d.vencimento && d.valor > 0);

  return { itens, duplicatas };
}

const n = (v: unknown) => Number(v ?? 0) || 0;
/** Primeiro grupo de dentro de ICMS/PIS/COFINS (ICMS00, ICMS20, PISAliq…). */
const grupo = (g: any) => (g && typeof g === "object" ? Object.values(g)[0] as any : null) ?? {};

export type NotaEmitida = Cabecalho & {
  serie: string; natureza: string; protocolo: string | null;
  /** finNFe 4 = devolução; tpNF 0 = entrada; refNFe = nota referenciada */
  finalidade: "normal" | "devolucao" | "complementar" | "ajuste"; tipo_operacao: "saida" | "entrada"; chave_referenciada: string | null;
  destinatario_nome: string; destinatario_doc: string; destinatario_uf: string | null;
  /** No formato dos itens enviados à Focus, para os relatórios do contador (CFOP, bases e impostos). */
  items: Record<string, unknown>[];
};

/** NF-e emitida pela própria empresa (XML do sistema anterior, ex.: Tiny). */
export function lerNotaEmitida(xml: string): NotaEmitida {
  const cab = lerCabecalho(xml);
  const d = doc(xml);
  const inf = d?.nfeProc?.NFe?.infNFe ?? d?.NFe?.infNFe;
  const prot = d?.nfeProc?.protNFe?.infProt;
  return {
    ...cab,
    serie: String(inf.ide?.serie ?? ""),
    natureza: String(inf.ide?.natOp ?? ""),
    protocolo: prot?.nProt ? String(prot.nProt) : null,
    finalidade: ({ "2": "complementar", "3": "ajuste", "4": "devolucao" } as const)[String(inf.ide?.finNFe ?? "1") as "2" | "3" | "4"] ?? "normal",
    tipo_operacao: String(inf.ide?.tpNF ?? "1") === "0" ? "entrada" : "saida",
    chave_referenciada: lista(inf.ide?.NFref).map((r: any) => r?.refNFe).find(Boolean) ? String(lista(inf.ide?.NFref).map((r: any) => r?.refNFe).find(Boolean)) : null,
    destinatario_nome: String(inf.dest?.xNome ?? ""),
    destinatario_doc: String(inf.dest?.CNPJ ?? inf.dest?.CPF ?? ""),
    destinatario_uf: inf.dest?.enderDest?.UF ? String(inf.dest.enderDest.UF) : null,
    items: lista(inf.det).map((det: any) => {
      const p = det.prod ?? {}, imp = det.imposto ?? {};
      const icms = grupo(imp.ICMS), pis = grupo(imp.PIS), cofins = grupo(imp.COFINS);
      return {
        codigo_produto: String(p.cProd ?? ""), descricao: String(p.xProd ?? ""), cfop: String(p.CFOP ?? ""), codigo_ncm: String(p.NCM ?? ""),
        quantidade_comercial: n(p.qCom), valor_bruto: n(p.vProd),
        icms_base_calculo: n(icms.vBC), icms_valor: n(icms.vICMS), ipi_valor: n(imp.IPI?.IPITrib?.vIPI),
        pis_valor: n(pis.vPIS), cofins_valor: n(cofins.vCOFINS),
      };
    }),
  };
}

/** Evento de NF-e (procEventoNFe): chave, tipo (110111 = cancelamento) e se foi registrado. */
export function lerEvento(xml: string): { chave: string; tipo: string; registrado: boolean } | null {
  const d = doc(xml);
  const proc = d?.procEventoNFe;
  const ev = proc?.evento?.infEvento;
  if (!ev?.chNFe) return null;
  const cStat = String(proc?.retEvento?.infEvento?.cStat ?? "");
  return { chave: String(ev.chNFe), tipo: String(ev.tpEvento ?? ""), registrado: ["135", "136", "155"].includes(cStat) };
}
