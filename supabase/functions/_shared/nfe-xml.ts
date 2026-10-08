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

function infNFe(xml: string): any {
  // parseTagValue: false mantém tudo como texto (preserva zeros à esquerda em códigos)
  const doc = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false }).parse(xml);
  const inf = doc?.nfeProc?.NFe?.infNFe ?? doc?.NFe?.infNFe;
  if (!inf) throw new Error("XML não é uma NF-e válida");
  return inf;
}

export type Cabecalho = {
  chave: string; numero: string; emitente_cnpj: string; emitente_nome: string;
  destinatario_cnpj: string | null; valor_total: number; data_emissao: string | null;
};

/** Dados principais da nota (para importar o XML enviado pelo fornecedor). */
export function lerCabecalho(xml: string): Cabecalho {
  const inf = infNFe(xml);
  const chave = String(inf["@_Id"] ?? "").replace(/^NFe/, "");
  if (!/^\d{44}$/.test(chave)) throw new Error("XML sem chave de acesso válida");
  return {
    chave,
    numero: String(inf.ide?.nNF ?? ""),
    emitente_cnpj: String(inf.emit?.CNPJ ?? inf.emit?.CPF ?? ""),
    emitente_nome: String(inf.emit?.xNome ?? ""),
    destinatario_cnpj: inf.dest?.CNPJ ? String(inf.dest.CNPJ) : null,
    valor_total: Number(inf.total?.ICMSTot?.vNF ?? 0),
    data_emissao: inf.ide?.dhEmi ? String(inf.ide.dhEmi) : null,
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
