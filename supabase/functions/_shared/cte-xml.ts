// Leitura do XML do CT-e (modelo 57, layout 3.00/4.00) e do CT-e OS (modelo 67), sem biblioteca: quem emitiu
// (a transportadora), remetente, destinatário, quem paga o frete (o tomador), o valor, a carga, as notas
// transportadas (chaves) e a fatura/duplicatas quando a transportadora informa no próprio CT-e.
// Arquivo puro (testado em src/lib/__tests__/cteSefaz.test.ts).

export type ParteCte = { cnpj: string | null; nome: string | null; uf: string | null };
export type PapelTomador = "remetente" | "expedidor" | "recebedor" | "destinatario" | "outros";
export type CobrancaCte = { fatura: string | null; valor: number | null; duplicatas: { numero: string | null; vencimento: string | null; valor: number | null }[] };

export type CteXml = {
  chave: string; modelo: "57" | "67"; numero: string; serie: string; tipo: string; emissao: string;
  cfop: string | null; uf_inicio: string | null; municipio_inicio: string | null; uf_fim: string | null; municipio_fim: string | null;
  emitente: ParteCte; remetente: ParteCte | null; destinatario: ParteCte | null; expedidor: ParteCte | null; recebedor: ParteCte | null;
  tomador: PapelTomador | null; tomador_cnpj: string | null; tomador_nome: string | null;
  valor: number; valor_receber: number | null; valor_carga: number | null; produto: string | null;
  peso_kg: number | null; volumes: number | null; icms: number | null;
  nfe_chaves: string[]; nf_numeros: string[]; prev_entrega: string | null;
  cobranca: CobrancaCte | null;
  situacao: "autorizado" | "denegado" | "sem_protocolo";
};

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const texto = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : ENTIDADES[e] ?? m)
    .trim();

/** Conteúdo de todas as tags com esse nome (aceita prefixo de namespace, ex.: <cte:rem>). */
function blocos(xml: string | null | undefined, tag: string): string[] {
  if (!xml) return [];
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]);
}
const bloco = (xml: string | null | undefined, tag: string) => blocos(xml, tag)[0] ?? null;
/** Texto da primeira tag (sem filhos) com esse nome; null se não houver ou vier vazia. */
function valor(xml: string | null | undefined, tag: string): string | null {
  const b = bloco(xml, tag);
  return b == null ? null : texto(b) || null;
}
const numero = (s: string | null) => (s == null || s === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const digitos = (s: string | null) => (s ?? "").replace(/\D/g, "") || null;

function parte(xml: string | null, endereco: string): ParteCte | null {
  if (!xml) return null;
  return { cnpj: digitos(valor(xml, "CNPJ") ?? valor(xml, "CPF")), nome: valor(xml, "xNome"), uf: valor(bloco(xml, endereco), "UF") };
}

const TOMADOR: PapelTomador[] = ["remetente", "expedidor", "recebedor", "destinatario", "outros"];
const TIPO: Record<string, string> = { "0": "CT-e", "1": "CT-e complementar", "2": "CT-e de anulação", "3": "CT-e substituto" };

/** Peso em kg e volumes pelas quantidades da carga (cUnid 01 = kg, 02 = tonelada, 03 = unidade). */
function pesoEVolumes(infCarga: string | null) {
  const qs = blocos(infCarga, "infQ").map((q) => ({ unid: valor(q, "cUnid"), med: valor(q, "tpMed") ?? "", qtd: numero(valor(q, "qCarga")) }));
  const pesos = qs.filter((q) => (q.unid === "01" || q.unid === "02") && q.qtd != null)
    .map((q) => ({ ...q, kg: q.unid === "02" ? q.qtd! * 1000 : q.qtd! }));
  // o peso real/bruto vale mais que o cubado ou o "base de cálculo"
  const peso = pesos.find((p) => /real|bruto/i.test(p.med)) ?? pesos[0];
  const vol = qs.find((q) => q.unid === "03" && q.qtd != null);
  return { peso_kg: peso ? Math.round(peso.kg * 10000) / 10000 : null, volumes: vol ? Math.round(vol.qtd!) : null };
}

/** Lê o CT-e (o cteProc com protocolo ou só o CTe). Lança erro se não for um CT-e. */
export function lerCte(xml: string): CteXml {
  const inf = bloco(xml, "infCte");
  if (!inf) throw new Error("o arquivo não é o XML de um CT-e");
  const id = xml.match(/<(?:[\w-]+:)?infCte[^>]*\sId="CTe(\d{44})"/)?.[1] ?? digitos(valor(xml, "chCTe"));
  if (!id || !/^\d{44}$/.test(id)) throw new Error("CT-e sem chave de acesso válida");
  const ide = bloco(inf, "ide");
  const modelo = (valor(ide, "mod") ?? id.slice(20, 22)) === "67" ? "67" : "57";
  const dhEmi = valor(ide, "dhEmi") ?? valor(ide, "dEmi");
  const emitente = parte(bloco(inf, "emit"), "enderEmit") ?? { cnpj: null, nome: null, uf: null };

  const remetente = parte(bloco(inf, "rem"), "enderReme");
  const destinatario = parte(bloco(inf, "dest"), "enderDest");
  const expedidor = parte(bloco(inf, "exped"), "enderExped");
  const recebedor = parte(bloco(inf, "receb"), "enderReceb");

  let tomador: PapelTomador | null = null;
  let tomadorParte: ParteCte | null = null;
  if (modelo === "67") {
    // CT-e OS: o tomador vem em bloco próprio (com CNPJ), não por código
    tomadorParte = parte(bloco(inf, "toma"), "enderToma");
    tomador = tomadorParte ? "outros" : null;
  } else {
    const t4 = bloco(ide, "toma4");
    const codigo = valor(bloco(ide, "toma3") ?? bloco(ide, "toma03") ?? t4, "toma");
    tomador = codigo != null ? TOMADOR[Number(codigo)] ?? null : null;
    tomadorParte = tomador === "remetente" ? remetente : tomador === "expedidor" ? expedidor : tomador === "recebedor" ? recebedor
      : tomador === "destinatario" ? destinatario : tomador === "outros" ? parte(t4, "enderToma") : null;
  }

  const vPrest = bloco(inf, "vPrest");
  const imp = bloco(inf, "imp");
  const norm = bloco(inf, "infCTeNorm");
  const carga = bloco(norm, "infCarga");
  const infDoc = bloco(norm, "infDoc");
  const cobr = bloco(norm, "cobr");
  const fat = bloco(cobr, "fat");
  const dups = blocos(cobr, "dup").map((d) => ({ numero: valor(d, "nDup"), vencimento: valor(d, "dVenc"), valor: numero(valor(d, "vDup")) }));
  const cStat = valor(bloco(xml, "protCTe"), "cStat");

  return {
    chave: id, modelo,
    numero: (valor(ide, "nCT") ?? id.slice(25, 34)).replace(/^0+(?=\d)/, ""),
    serie: (valor(ide, "serie") ?? id.slice(22, 25)).replace(/^0+(?=\d)/, ""),
    tipo: modelo === "67" ? "CT-e OS" : TIPO[valor(ide, "tpCTe") ?? "0"] ?? "CT-e",
    emissao: (dhEmi ?? "").slice(0, 10),
    cfop: valor(ide, "CFOP"),
    uf_inicio: valor(ide, "UFIni"), municipio_inicio: valor(ide, "xMunIni"), uf_fim: valor(ide, "UFFim"), municipio_fim: valor(ide, "xMunFim"),
    emitente, remetente, destinatario, expedidor, recebedor,
    tomador, tomador_cnpj: tomadorParte?.cnpj ?? null, tomador_nome: tomadorParte?.nome ?? null,
    valor: numero(valor(vPrest, "vTPrest")) ?? 0, valor_receber: numero(valor(vPrest, "vRec")),
    valor_carga: numero(valor(carga, "vCarga")), produto: valor(carga, "proPred"),
    ...pesoEVolumes(carga),
    icms: numero(valor(imp, "vICMS") ?? valor(imp, "vICMSOutraUF") ?? valor(imp, "vICMSSTRet")),
    nfe_chaves: [...new Set(blocos(infDoc, "infNFe").map((b) => digitos(valor(b, "chave"))).filter((c): c is string => !!c && c.length === 44))],
    nf_numeros: blocos(infDoc, "infNF").map((b) => valor(b, "nDoc")).filter((n): n is string => !!n),
    prev_entrega: valor(infDoc, "dPrev") ?? valor(bloco(inf, "compl"), "dProg"),
    cobranca: fat || dups.length ? { fatura: valor(fat, "nFat"), valor: numero(valor(fat, "vLiq") ?? valor(fat, "vOrig")), duplicatas: dups } : null,
    situacao: cStat === "100" || cStat === "150" ? "autorizado" : ["110", "205", "301", "302"].includes(cStat ?? "") ? "denegado" : "sem_protocolo",
  };
}

/** Situação que a Focus informa na lista ("autorizado", "cancelado", "denegado"…) no padrão do ERP. */
export function situacaoFocus(s: string | null | undefined): "autorizado" | "cancelado" | "denegado" {
  const t = String(s ?? "").toLowerCase();
  return /cancel/.test(t) ? "cancelado" : /deneg/.test(t) ? "denegado" : "autorizado";
}

/** Número, série e modelo pela chave de acesso (posições fixas: modelo 21–22, série 23–25, número 26–34). */
export const dadosDaChave = (chave: string) => ({
  modelo: chave.slice(20, 22), serie: chave.slice(22, 25).replace(/^0+(?=\d)/, ""), numero: chave.slice(25, 34).replace(/^0+(?=\d)/, ""),
  emitente_cnpj: chave.slice(6, 20),
});
