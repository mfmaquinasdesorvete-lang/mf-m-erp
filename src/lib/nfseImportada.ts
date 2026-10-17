// NFS-e feitas fora do ERP (Notas fiscais → NFS-e → Importar): lê o XML da nota (padrão ABRASF das prefeituras ou
// NFS-e Nacional), o ZIP com vários XMLs e o relatório "Notas fiscais de serviço" do Tiny, e devolve os itens de
// importar_nfse. O banco decide se a nota é emitida pela MF ou recebida (tomada) pelo CNPJ das unidades.
// Leitura por texto (sem DOMParser) para funcionar igual na tela e nos testes.

export type SituacaoNfseImportada = "normal" | "sem_numero" | "cancelada";
/** De onde veio: relatório do Tiny, XML da nota ou lançado na tela (serviço tomado pela descrição, com ou sem nota). */
export type OrigemNfseImportada = "tiny" | "xml" | "manual";

export type NfseImportada = {
  id: string; tipo: "emitida" | "tomada"; unidade_id: string; numero: string | null; rps: string | null;
  codigo_verificacao: string | null; chave_acesso: string | null; data_emissao: string; competencia: string | null;
  prestador_doc: string | null; prestador_nome: string | null; tomador_doc: string | null; tomador_nome: string | null;
  municipio: string | null; cliente_id: string | null; fornecedor_id: string | null;
  valor_servicos: number; valor_iss: number | null; iss_retido: boolean;
  valor_ir: number; valor_inss: number; valor_pis: number; valor_cofins: number; valor_csll: number; valor_liquido: number | null;
  discriminacao: string | null; codigo_servico: string | null; situacao: SituacaoNfseImportada; origem: OrigemNfseImportada; created_at: string;
  conta_pagar_id?: string | null;
};

/** Item enviado para importar_nfse. */
export type ItemNfse = {
  origem: "tiny" | "xml"; arquivo: string; tipo?: "emitida"; unidade_id?: string;
  numero: string; rps: string; codigo_verificacao: string; chave_acesso: string; data_emissao: string; competencia: string;
  prestador_doc: string; prestador_nome: string; tomador_doc: string; tomador_nome: string; municipio: string;
  valor_servicos: string; valor_iss: number | null; iss_retido: boolean | null;
  valor_ir: number; valor_inss: number; valor_pis: number; valor_cofins: number; valor_csll: number; valor_liquido: number | null;
  discriminacao: string; codigo_servico: string; situacao: "normal" | "cancelada";
};

export const SITUACAO_IMPORTADA: Record<SituacaoNfseImportada, { label: string; cor: string; ajuda: string }> = {
  normal: { label: "Autorizada", cor: "bg-emerald-100 text-emerald-800", ajuda: "Nota com número" },
  sem_numero: { label: "Sem número", cor: "bg-amber-100 text-amber-800", ajuda: "Só o RPS: confira na prefeitura se virou nota e importe o XML" },
  cancelada: { label: "Cancelada", cor: "bg-slate-200 text-slate-700", ajuda: "Cancelada na prefeitura" },
};

export const ORIGEM_IMPORTADA: Record<OrigemNfseImportada, string> = { tiny: "Tiny", xml: "XML", manual: "Lançado na tela" };

/** Situação para mostrar: o serviço lançado na tela sem o número é "Sem nota" (não é um RPS esperando a prefeitura). */
export function situacaoImportada(n: Pick<NfseImportada, "situacao" | "origem">) {
  if (n.origem === "manual" && n.situacao === "sem_numero") {
    return { label: "Sem nota", cor: "bg-amber-100 text-amber-800", ajuda: "Lançado sem o número da NFS-e: quando a nota chegar, ponha o número (Corrigir) e importe o XML, que completa este lançamento" };
  }
  return SITUACAO_IMPORTADA[n.situacao];
}

type Valores = Pick<NfseImportada, "valor_ir" | "valor_inss" | "valor_pis" | "valor_cofins" | "valor_csll" | "valor_iss" | "iss_retido">;

/** Retenções da nota (o que o tomador desconta e recolhe). */
export const retencoes = (n: Valores) =>
  Number(n.valor_ir) + Number(n.valor_inss) + Number(n.valor_pis) + Number(n.valor_cofins) + Number(n.valor_csll) + (n.iss_retido ? Number(n.valor_iss ?? 0) : 0);

/** O que a MF paga ao prestador: o líquido da nota ou o valor do serviço menos as retenções. */
export const liquidoNfse = (n: Valores & Pick<NfseImportada, "valor_servicos" | "valor_liquido">) =>
  n.valor_liquido != null ? Number(n.valor_liquido) : Math.round((Number(n.valor_servicos) - retencoes(n)) * 100) / 100;

/* ------------------------------------------- XML ------------------------------------------- */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decod = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => e[0] === "#"
    ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    : ENT[e] ?? m);

/** Conteúdo do primeiro elemento com esse nome (com ou sem prefixo de namespace). */
function bloco(xml: string, tag: string): string {
  const m = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`).exec(xml);
  return m ? m[1] : "";
}
/** Texto do primeiro desses elementos que tiver valor. */
function texto(xml: string, ...tags: string[]): string {
  for (const t of tags) {
    const v = decod(bloco(xml, t)).replace(/\s+/g, " ").trim();
    if (v && !v.startsWith("<")) return v;
  }
  return "";
}
/** Tira os elementos com esse nome (para não pegar o "Numero" do RPS como número da nota). */
const sem = (xml: string, ...tags: string[]) =>
  tags.reduce((s, t) => s.replace(new RegExp(`<(?:[\\w.-]+:)?${t}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w.-]+:)?${t}>`, "g"), ""), xml);

const dig = (s: string) => s.replace(/\D/g, "");
const dataXml = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : dataBr(s));
function dataBr(s: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s.trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/** "1.234,56", "1234.56" ou número -> número (vazio = 0). */
export function valorNumero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const opc = (s: string) => (s ? r2(valorNumero(s)) : null);

function vazio(arquivo: string, origem: ItemNfse["origem"]): ItemNfse {
  return {
    origem, arquivo, numero: "", rps: "", codigo_verificacao: "", chave_acesso: "", data_emissao: "", competencia: "",
    prestador_doc: "", prestador_nome: "", tomador_doc: "", tomador_nome: "", municipio: "", valor_servicos: "0.00",
    valor_iss: null, iss_retido: null, valor_ir: 0, valor_inss: 0, valor_pis: 0, valor_cofins: 0, valor_csll: 0, valor_liquido: null,
    discriminacao: "", codigo_servico: "", situacao: "normal",
  };
}

/** Uma NFS-e no padrão ABRASF (CompNfse / InfNfse), versões 1 e 2 das prefeituras. */
function lerAbrasf(xml: string, arquivo: string): ItemNfse | null {
  const inf = bloco(xml, "InfNfse");
  if (!inf) return null;
  const it = vazio(arquivo, "xml");
  it.numero = texto(sem(inf, "IdentificacaoRps", "DeclaracaoPrestacaoServico", "Rps", "NfseSubstituida"), "Numero");
  it.rps = texto(bloco(xml, "IdentificacaoRps"), "Numero");
  it.codigo_verificacao = texto(inf, "CodigoVerificacao");
  it.data_emissao = dataXml(texto(inf, "DataEmissao", "DataEmissaoRps"));
  it.competencia = dataXml(texto(xml, "Competencia"));
  const prest = bloco(xml, "PrestadorServico") || bloco(xml, "Prestador");
  const prestDecl = bloco(xml, "Prestador") || prest;
  it.prestador_doc = dig(texto(prest, "Cnpj", "Cpf") || texto(prestDecl, "Cnpj", "Cpf"));
  it.prestador_nome = texto(prest, "RazaoSocial", "NomeFantasia") || texto(prestDecl, "RazaoSocial");
  const toma = bloco(xml, "TomadorServico") || bloco(xml, "Tomador");
  it.tomador_doc = dig(texto(toma, "Cnpj", "Cpf"));
  it.tomador_nome = texto(toma, "RazaoSocial", "NomeFantasia");
  const val = bloco(xml, "Valores") || xml;
  it.valor_servicos = r2(valorNumero(texto(val, "ValorServicos"))).toFixed(2);
  it.valor_iss = opc(texto(val, "ValorIss") || texto(xml, "ValorIss"));
  const retido = texto(val, "IssRetido") || texto(xml, "IssRetido");
  it.iss_retido = retido ? retido === "1" || /^s|^true/i.test(retido) : null;
  it.valor_ir = r2(valorNumero(texto(val, "ValorIr")));
  it.valor_inss = r2(valorNumero(texto(val, "ValorInss")));
  it.valor_pis = r2(valorNumero(texto(val, "ValorPis")));
  it.valor_cofins = r2(valorNumero(texto(val, "ValorCofins")));
  it.valor_csll = r2(valorNumero(texto(val, "ValorCsll")));
  it.valor_liquido = opc(texto(xml, "ValorLiquidoNfse"));
  it.discriminacao = texto(xml, "Discriminacao");
  it.codigo_servico = texto(xml, "ItemListaServico", "CodigoTributacaoMunicipio");
  it.municipio = texto(xml, "MunicipioIncidencia", "CodigoMunicipio");
  if (/<(?:[\w.-]+:)?NfseCancelamento[\s>]/.test(xml)) it.situacao = "cancelada";
  return it;
}

/** NFS-e do padrão Nacional (gov.br): <NFSe><infNFSe Id="NFS…">. */
function lerNacional(xml: string, arquivo: string): ItemNfse | null {
  const inf = bloco(xml, "infNFSe");
  if (!inf) return null;
  const it = vazio(arquivo, "xml");
  it.numero = texto(inf, "nNFSe");
  it.chave_acesso = (/<(?:[\w.-]+:)?infNFSe\s[^>]*Id="NFS(\d{50})"/.exec(xml)?.[1]) ?? "";
  const dps = bloco(inf, "infDPS");
  it.rps = texto(dps, "nDPS");
  it.data_emissao = dataXml(texto(dps, "dhEmi") || texto(inf, "dhProc"));
  it.competencia = dataXml(texto(dps, "dCompet"));
  const emit = bloco(inf, "emit") || bloco(dps, "prest");
  it.prestador_doc = dig(texto(emit, "CNPJ", "CPF"));
  it.prestador_nome = texto(emit, "xNome");
  const toma = bloco(dps, "toma");
  it.tomador_doc = dig(texto(toma, "CNPJ", "CPF"));
  it.tomador_nome = texto(toma, "xNome");
  it.valor_servicos = r2(valorNumero(texto(bloco(dps, "vServPrest") || dps, "vServ"))).toFixed(2);
  const totais = sem(inf, "DPS");
  it.valor_iss = opc(texto(totais, "vISSQN"));
  const tpRet = texto(dps, "tpRetISSQN");
  it.iss_retido = tpRet ? tpRet !== "1" : null; // 1 = não retido; 2 = retido pelo tomador; 3 = pelo intermediário
  it.valor_ir = r2(valorNumero(texto(dps, "vRetIRRF")));
  it.valor_inss = r2(valorNumero(texto(dps, "vRetCP")));
  it.valor_csll = r2(valorNumero(texto(dps, "vRetCSLL")));
  // PIS e COFINS só contam como retenção quando a nota diz que foram retidos (confirmar com o contador)
  if (texto(dps, "tpRetPisCofins") === "1") {
    it.valor_pis = r2(valorNumero(texto(dps, "vPis")));
    it.valor_cofins = r2(valorNumero(texto(dps, "vCofins")));
  }
  it.valor_liquido = opc(texto(totais, "vLiq"));
  it.discriminacao = texto(dps, "xDescServ");
  it.codigo_servico = texto(dps, "cTribNac");
  it.municipio = texto(inf, "xLocPrestacao", "xLocIncid", "xLocEmi");
  return it;
}

/** Todas as NFS-e de um XML (um arquivo pode trazer uma nota ou a lista da consulta da prefeitura). */
export function lerXmlNfse(xml: string, arquivo = "nota.xml"): ItemNfse[] {
  const comps = [...xml.matchAll(/<(?:[\w.-]+:)?CompNfse[\s>][\s\S]*?<\/(?:[\w.-]+:)?CompNfse>/g)].map((m) => m[0]);
  if (comps.length) return comps.map((c) => lerAbrasf(c, arquivo)).filter((x): x is ItemNfse => !!x);
  const nacionais = [...xml.matchAll(/<(?:[\w.-]+:)?NFSe[\s>][\s\S]*?<\/(?:[\w.-]+:)?NFSe>/g)].map((m) => m[0]);
  if (nacionais.length) return nacionais.map((n) => lerNacional(n, arquivo)).filter((x): x is ItemNfse => !!x);
  const um = lerNacional(xml, arquivo) ?? lerAbrasf(xml, arquivo);
  return um ? [um] : [];
}

/* ----------------------------------- relatório do Tiny ----------------------------------- */

const semAcento = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Relatório "Notas fiscais de serviço" do Tiny (Número RPS, Número NFSe, Cliente, Data de emissão, Valor Líquido,
 * Valor IR, INSS, ISS, Cofins, PIS, CSLL, Total serviços). Não traz CNPJ: entra como emitida pela unidade escolhida.
 */
export function lerRelatorioTinyNfse(linhas: unknown[][], unidadeId: string, arquivo = "relatorio-tiny"): ItemNfse[] {
  const iCab = linhas.slice(0, 10).findIndex((l) => l.some((c) => semAcento(c) === "numero rps") || l.some((c) => semAcento(c) === "numero nfse"));
  if (iCab < 0) return [];
  const cab = linhas[iCab].map(semAcento);
  const col = (r: unknown[], ...nomes: string[]) => {
    const i = cab.findIndex((c) => nomes.includes(c));
    return i < 0 ? "" : r[i];
  };
  const dataCel = (v: unknown) => {
    if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
    return dataXml(String(v ?? "").trim());
  };
  return linhas.slice(iCab + 1).filter((r) => r.some((c) => String(c ?? "").trim())).map((r) => {
    const it = vazio(arquivo, "tiny");
    it.tipo = "emitida";
    it.unidade_id = unidadeId;
    it.rps = String(col(r, "numero rps") ?? "").trim();
    it.numero = String(col(r, "numero nfse", "numero da nfse") ?? "").trim();
    it.tomador_nome = String(col(r, "cliente", "tomador") ?? "").trim();
    it.data_emissao = dataCel(col(r, "data de emissao", "data emissao"));
    it.valor_servicos = r2(valorNumero(col(r, "total servicos", "total dos servicos", "valor servicos"))).toFixed(2);
    it.valor_liquido = opc(String(col(r, "valor liquido") ?? ""));
    it.valor_ir = r2(valorNumero(col(r, "valor ir")));
    it.valor_inss = r2(valorNumero(col(r, "valor inss")));
    it.valor_iss = opc(String(col(r, "valor iss") ?? ""));
    it.valor_cofins = r2(valorNumero(col(r, "valor cofins")));
    it.valor_pis = r2(valorNumero(col(r, "valor pis")));
    it.valor_csll = r2(valorNumero(col(r, "valor csll")));
    return it;
  }).filter((it) => it.rps || it.numero);
}

/* ----------------------------------------- arquivos ----------------------------------------- */

/** XML em UTF-8 ou ISO-8859-1 (conforme a declaração do arquivo). */
function textoXml(bytes: Uint8Array): string {
  const cabeca = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const enc = /encoding=["']([\w-]+)["']/i.exec(cabeca)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(/8859|latin|1252/.test(enc) ? "latin1" : "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}

/** Lê os arquivos escolhidos: .xml, .zip (com XMLs dentro) e o relatório do Tiny (.xls, .xlsx, .csv). */
export async function lerArquivosNfse(arquivos: File[], unidadeTiny: string): Promise<{ itens: ItemNfse[]; erros: string[] }> {
  const itens: ItemNfse[] = [];
  const erros: string[] = [];
  for (const f of arquivos) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (/\.zip$/i.test(f.name)) {
        const { unzipSync } = await import("fflate");
        const conteudo = unzipSync(bytes, { filter: (e) => /\.xml$/i.test(e.name) });
        const antes = itens.length;
        for (const [nome, b] of Object.entries(conteudo)) itens.push(...lerXmlNfse(textoXml(b), nome.split("/").pop() ?? nome));
        if (itens.length === antes) erros.push(`${f.name}: nenhuma NFS-e nos XMLs do ZIP`);
      } else if (/\.xml$/i.test(f.name)) {
        const lidas = lerXmlNfse(textoXml(bytes), f.name);
        if (!lidas.length) erros.push(`${f.name}: não é XML de NFS-e (ABRASF ou Nacional)`);
        itens.push(...lidas);
      } else {
        const XLSX = await import("xlsx");
        const { abrirPlanilha } = await import("./planilha");
        const wb = await abrirPlanilha(XLSX, f);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
        const lidas = lerRelatorioTinyNfse(linhas, unidadeTiny, f.name);
        if (!lidas.length) erros.push(`${f.name}: não achei as colunas do relatório de notas de serviço do Tiny`);
        itens.push(...lidas);
      }
    } catch (e) {
      erros.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  return { itens, erros };
}
