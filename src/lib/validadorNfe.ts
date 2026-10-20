// Validador de NF-e (Notas fiscais → Validar): confere o XML com as mesmas regras da SEFAZ, em quatro partes.
//  1. Estrutura: o XML contra os esquemas oficiais (XSD) do Portal Nacional da NF-e, leiaute 4.00 com a Reforma
//     (pacote PL_010, em public/xsd/nfe). É a conferência que a SEFAZ faz antes de qualquer outra.
//  2. Assinatura digital: o XML não foi mexido depois de assinado, e de quem é o certificado.
//  3. Protocolo: a nota tem a autorização da SEFAZ (cStat 100/150) para esta chave e este conteúdo (digVal).
//  4. Regras de rejeição mais comuns do Manual de Orientação do Contribuinte (chave, CFOP, totais, pagamento…).
// As partes 1 e 2 carregam bibliotecas pesadas (xmllint em WebAssembly e xmldsigjs) só quando a pessoa valida.
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export type Nivel = "ok" | "alerta" | "erro";
export type Grupo = "estrutura" | "assinatura" | "protocolo" | "regras";
export type Achado = { grupo: Grupo; nivel: Nivel; texto: string; codigo?: string };
export type ResultadoValidacao = {
  chave: string | null; numero: string | null; emitente: string | null; valor: number | null;
  achados: Achado[]; nivel: Nivel;
};

const NS = "http://www.portalfiscal.inf.br/nfe";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";

/** Nível geral: o pior dos achados. */
export function nivelGeral(achados: Achado[]): Nivel {
  return achados.some((a) => a.nivel === "erro") ? "erro" : achados.some((a) => a.nivel === "alerta") ? "alerta" : "ok";
}

// ---------------------------------------------------------------- dígitos verificadores

/** DV da chave de acesso (módulo 11, pesos 2 a 9 da direita para a esquerda; resto 0 ou 1 → 0). */
export function dvChave(chave43: string): number {
  let soma = 0;
  [...chave43].reverse().forEach((d, i) => { soma += Number(d) * (2 + (i % 8)); });
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

export function cnpjValido(v: string): boolean {
  const c = v.replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string) => {
    let soma = 0, peso = base.length - 7;
    for (const d of base) { soma += Number(d) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  return d1 === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

export function cpfValido(v: string): boolean {
  const c = v.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/** GTIN-8/12/13/14 com dígito verificador certo. */
export function gtinValido(v: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(v)) return false;
  const corpo = v.slice(0, -1);
  let soma = 0;
  [...corpo].reverse().forEach((d, i) => { soma += Number(d) * (i % 2 === 0 ? 3 : 1); });
  return (10 - (soma % 10)) % 10 === Number(v[v.length - 1]);
}

// ---------------------------------------------------------------- leitura

type El = Element;
const filhos = (el: El | null | undefined, nome: string): El[] =>
  el ? Array.from(el.getElementsByTagNameNS(NS, nome)) as El[] : [];
const um = (el: El | null | undefined, nome: string): El | null => filhos(el, nome)[0] ?? null;
/** Texto do primeiro filho com esse nome (busca em profundidade). */
const txt = (el: El | null | undefined, nome: string): string => um(el, nome)?.textContent?.trim() ?? "";
const num = (el: El | null | undefined, nome: string): number => Number(txt(el, nome) || 0);
/** Filho direto (para não pegar, por ex., o vBC de dentro do ICMS quando se quer o do total). */
const direto = (el: El | null | undefined, nome: string): El | null =>
  el ? (Array.from(el.childNodes).find((n) => (n as El).localName === nome) as El | undefined) ?? null : null;
const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function lerXml(xml: string): Document {
  const erros: string[] = [];
  const doc = new DOMParser({ onError: (nivel, msg) => { if (nivel !== "warning") erros.push(msg); } })
    .parseFromString(xml.replace(/^﻿/, ""), "text/xml") as unknown as Document;
  if (erros.length || !doc?.documentElement) throw new Error(erros[0] ?? "XML ilegível");
  return doc;
}

// ---------------------------------------------------------------- 3 e 4: protocolo e regras (sem bibliotecas)

/** Confere protocolo e regras de rejeição. `agora` entra como parâmetro para os testes. */
export function conferirRegras(xml: string, agora = new Date()): ResultadoValidacao {
  const achados: Achado[] = [];
  const add = (grupo: Grupo, nivel: Nivel, texto: string, codigo?: string) => achados.push({ grupo, nivel, texto, codigo });
  let doc: Document;
  try { doc = lerXml(xml); } catch (e) {
    add("estrutura", "erro", `O arquivo não é um XML válido: ${(e as Error).message}`);
    return { chave: null, numero: null, emitente: null, valor: null, achados, nivel: "erro" };
  }
  const raiz = doc.documentElement as unknown as El;
  const inf = um(raiz, "infNFe");
  if (!inf) {
    add("estrutura", "erro", "Não é uma NF-e: falta o grupo infNFe.");
    return { chave: null, numero: null, emitente: null, valor: null, achados, nivel: "erro" };
  }
  const ide = um(inf, "ide"), emit = um(inf, "emit"), dest = um(inf, "dest");
  const tot = um(inf, "ICMSTot");
  const id = inf.getAttribute("Id") ?? "";
  const chave = /^NFe\d{44}$/.test(id) ? id.slice(3) : null;
  const numero = txt(ide, "nNF") || null;
  const emitente = txt(emit, "xNome") || null;
  const vNF = num(tot, "vNF");

  if (inf.getAttribute("versao") !== "4.00") add("estrutura", "alerta", `Versão do leiaute ${inf.getAttribute("versao") || "?"}; a vigente é a 4.00.`);
  if (txt(ide, "mod") !== "55") add("regras", "alerta", `Modelo ${txt(ide, "mod") || "?"}: este validador é para NF-e modelo 55.`);

  // --- chave de acesso
  if (!chave) add("regras", "erro", "Chave de acesso inválida no atributo Id (precisa ser NFe + 44 números).", "502");
  else {
    if (dvChave(chave.slice(0, 43)) !== Number(chave[43])) add("regras", "erro", "Dígito verificador da chave de acesso não confere.", "502");
    const dh = txt(ide, "dhEmi");
    const docEmit = txt(emit, "CNPJ") || txt(emit, "CPF").padStart(14, "0");
    const partes: [string, string, string][] = [
      ["UF", chave.slice(0, 2), txt(ide, "cUF")],
      ["ano/mês", chave.slice(2, 6), dh ? dh.slice(2, 4) + dh.slice(5, 7) : ""],
      ["CNPJ do emitente", chave.slice(6, 20), docEmit],
      ["modelo", chave.slice(20, 22), txt(ide, "mod")],
      ["série", chave.slice(22, 25), txt(ide, "serie").padStart(3, "0")],
      ["número", chave.slice(25, 34), txt(ide, "nNF").padStart(9, "0")],
      ["tipo de emissão", chave.slice(34, 35), txt(ide, "tpEmis")],
      ["código numérico", chave.slice(35, 43), txt(ide, "cNF").padStart(8, "0")],
      ["dígito", chave.slice(43), txt(ide, "cDV")],
    ];
    const difere = partes.filter(([, a, b]) => a !== b).map(([n]) => n);
    if (difere.length) add("regras", "erro", `A chave de acesso não bate com a nota em: ${difere.join(", ")}.`, "502");
    else add("regras", "ok", "Chave de acesso e dígito verificador conferem.");
  }

  // --- participantes
  const cnpjEmit = txt(emit, "CNPJ");
  if (cnpjEmit && !cnpjValido(cnpjEmit)) add("regras", "erro", "CNPJ do emitente com dígito inválido.", "207");
  const cnpjDest = txt(dest, "CNPJ"), cpfDest = txt(dest, "CPF");
  if (cnpjDest && !cnpjValido(cnpjDest)) add("regras", "erro", "CNPJ do destinatário com dígito inválido.", "208");
  if (cpfDest && !cpfValido(cpfDest)) add("regras", "erro", "CPF do destinatário com dígito inválido.", "237");
  const ufEmit = txt(um(emit, "enderEmit"), "UF"), ufDest = txt(um(dest, "enderDest"), "UF");
  const idDest = txt(ide, "idDest"), tpNF = txt(ide, "tpNF");
  if (ufEmit && ufDest) {
    if (idDest === "1" && ufEmit !== ufDest) add("regras", "erro", `Operação marcada como interna, mas emitente (${ufEmit}) e destinatário (${ufDest}) são de estados diferentes.`, "773");
    if (idDest === "2" && ufEmit === ufDest) add("regras", "erro", `Operação marcada como interestadual, mas os dois são de ${ufEmit}.`, "772");
    if (idDest === "3" && ufDest !== "EX") add("regras", "erro", "Operação com exterior, mas o destinatário não é do exterior (UF EX).", "771");
  }

  // --- data
  const dhEmi = Date.parse(txt(ide, "dhEmi"));
  if (Number.isFinite(dhEmi) && dhEmi > agora.getTime() + 5 * 60_000) add("regras", "erro", "Data de emissão no futuro.", "703");

  // --- itens
  const dets = filhos(inf, "det");
  let somaProd = 0, somaIcms = 0, somaBc = 0, somaIpi = 0, somaSt = 0, somaFrete = 0, somaDesc = 0, somaDeson = 0;
  const errosItem: string[] = [];
  for (const det of dets) {
    const n = det.getAttribute("nItem");
    const prod = um(det, "prod"), imp = um(det, "imposto");
    const cfop = txt(prod, "CFOP"), ncm = txt(prod, "NCM");
    const vProd = num(prod, "vProd");
    if (txt(prod, "indTot") !== "0") somaProd += vProd;
    somaFrete += num(prod, "vFrete"); somaDesc += num(prod, "vDesc");
    const icms = um(imp, "ICMS");
    somaIcms += num(icms, "vICMS"); somaBc += num(icms, "vBC"); somaSt += num(icms, "vICMSST");
    if (txt(icms, "indDeduzDeson") === "1") somaDeson += num(icms, "vICMSDeson");
    somaIpi += num(um(imp, "IPITrib"), "vIPI");
    const q = num(prod, "qCom"), vu = num(prod, "vUnCom");
    if (q && vu && Math.abs(q * vu - vProd) > 0.011) errosItem.push(`item ${n}: valor ${brl(vProd)} ≠ quantidade × unitário (${brl(r2(q * vu))}) (rejeição 629)`);
    const c1 = cfop[0];
    if (tpNF === "1" && !"567".includes(c1)) errosItem.push(`item ${n}: CFOP ${cfop} é de entrada numa nota de saída (rejeição 518)`);
    if (tpNF === "0" && !"123".includes(c1)) errosItem.push(`item ${n}: CFOP ${cfop} é de saída numa nota de entrada (rejeição 518)`);
    const esperado = { "1": "15", "2": "26", "3": "37" }[idDest];
    if (esperado && c1 && !esperado.includes(c1)) errosItem.push(`item ${n}: CFOP ${cfop} não combina com o destino da operação (${idDest === "1" ? "interna" : idDest === "2" ? "interestadual" : "exterior"})`);
    if (!/^(\d{8}|00)$/.test(ncm)) errosItem.push(`item ${n}: NCM "${ncm}" precisa ter 8 números (rejeição 777)`);
    for (const campo of ["cEAN", "cEANTrib"]) {
      const g = txt(prod, campo);
      if (g && g !== "SEM GTIN" && !gtinValido(g)) errosItem.push(`item ${n}: ${campo} ${g} com dígito inválido (rejeição 611)`);
    }
  }
  if (!dets.length) add("regras", "erro", "A nota não tem itens.");
  else if (errosItem.length) errosItem.forEach((e) => add("regras", "erro", e[0].toUpperCase() + e.slice(1) + "."));
  else add("regras", "ok", `${dets.length} ${dets.length === 1 ? "item conferido" : "itens conferidos"} (CFOP, NCM, GTIN e valores).`);

  // --- totais
  if (!tot) add("regras", "erro", "Falta o grupo de totais (ICMSTot).");
  else {
    const difTotais: string[] = [];
    const cmp = (nome: string, soma: number, cod: string) => {
      const v = num(tot, nome);
      if (Math.abs(v - soma) > 0.011) difTotais.push(`${nome} do total ${brl(v)} ≠ soma dos itens ${brl(r2(soma))} (rejeição ${cod})`);
    };
    cmp("vProd", somaProd, "564"); cmp("vICMS", somaIcms, "532"); cmp("vBC", somaBc, "531"); cmp("vIPI", somaIpi, "601");
    cmp("vFrete", somaFrete, "535"); cmp("vDesc", somaDesc, "536"); cmp("vST", somaSt, "534");
    const vServ = num(um(inf, "ISSQNtot"), "vServ");
    const calc = num(tot, "vProd") - num(tot, "vDesc") - somaDeson + num(tot, "vST") + num(tot, "vFCPST") + num(tot, "vFrete")
      + num(tot, "vSeg") + num(tot, "vOutro") + num(tot, "vII") + num(tot, "vIPI") + num(tot, "vIPIDevol") + vServ;
    if (Math.abs(calc - vNF) > 0.011) difTotais.push(`valor total da nota ${brl(vNF)} ≠ produtos − descontos + frete, seguro, outras, ST e IPI (${brl(r2(calc))}) (rejeição 610)`);
    if (difTotais.length) difTotais.forEach((d) => add("regras", "erro", d[0].toUpperCase() + d.slice(1) + "."));
    else add("regras", "ok", `Totais conferem com os itens (total da nota ${brl(vNF)}).`);
  }

  // --- pagamento
  const pags = filhos(inf, "detPag");
  if (pags.length) {
    const semPag = pags.every((p) => txt(p, "tPag") === "90");
    const somaPag = pags.reduce((s, p) => s + num(p, "vPag"), 0) - num(um(inf, "pag"), "vTroco");
    if (!semPag && tpNF === "1" && txt(ide, "finNFe") === "1" && Math.abs(somaPag - vNF) > 0.011)
      add("regras", "alerta", `Pagamentos somam ${brl(r2(somaPag))} e a nota ${brl(vNF)} (rejeição 869 em alguns estados).`, "869");
  }

  // --- protocolo de autorização
  const prot = um(raiz, "infProt");
  if (!prot) add("protocolo", "alerta", "O XML não traz o protocolo de autorização da SEFAZ (é o XML enviado, não o autorizado). Peça o XML com o protocolo (nfeProc).");
  else {
    const cStat = txt(prot, "cStat"), xMotivo = txt(prot, "xMotivo");
    if (cStat === "100" || cStat === "150") add("protocolo", "ok", `Autorizada pela SEFAZ: protocolo ${txt(prot, "nProt")} em ${txt(prot, "dhRecbto").slice(0, 10).split("-").reverse().join("/")}.`);
    else if (["110", "301", "302", "303"].includes(cStat)) add("protocolo", "erro", `Uso DENEGADO pela SEFAZ (${cStat} – ${xMotivo}). Não pode ser usada.`, cStat);
    else add("protocolo", "erro", `Protocolo com situação ${cStat} – ${xMotivo}: a nota não foi autorizada.`, cStat);
    if (chave && txt(prot, "chNFe") !== chave) add("protocolo", "erro", "O protocolo é de outra chave de acesso: este XML não é o que a SEFAZ autorizou.");
    const digVal = txt(prot, "digVal");
    const digest = (raiz.getElementsByTagNameNS(NS_DS, "DigestValue")[0] as El | undefined)?.textContent?.trim() ?? "";
    if (digVal && digest && digVal !== digest) add("protocolo", "erro", "O conteúdo do XML é diferente do que a SEFAZ autorizou (o resumo digital não bate com o do protocolo). O XML foi alterado.");
    else if (digVal && digest) add("protocolo", "ok", "O conteúdo é o mesmo que a SEFAZ autorizou (resumo digital confere).");
    if (txt(prot, "tpAmb") === "2") add("protocolo", "alerta", "Nota do ambiente de TESTE (homologação): não vale como documento fiscal.");
  }

  return { chave, numero, emitente, valor: tot ? vNF : null, achados, nivel: nivelGeral(achados) };
}

// ---------------------------------------------------------------- 1: estrutura (XSD oficial)

export const ARQUIVOS_XSD = [
  "procNFe_v4.00.xsd", "nfe_v4.00.xsd", "leiauteNFe_v4.00.xsd", "tiposBasico_v4.00.xsd",
  "DFeTiposBasicos_v1.00.xsd", "xmldsig-core-schema_v1.01.xsd",
] as const;
export type CarregarXsd = (nome: string) => Promise<string>;

let xsdCache: Record<string, string> | null = null;
const carregarDoSite: CarregarXsd = async (nome) => {
  const r = await fetch(`${import.meta.env?.BASE_URL ?? "/"}xsd/nfe/${nome}`);
  if (!r.ok) throw new Error(`não achei o esquema ${nome}`);
  return r.text();
};

/** Tira a mensagem do xmllint do jeito que interessa: "Elemento X: o valor Y não é aceito". */
export function traduzirErroXsd(msg: string): string {
  const m = msg.replace(/\{http:\/\/www\.(?:portalfiscal\.inf\.br\/nfe|w3\.org\/2000\/09\/xmldsig#)\}/g, "")
    .replace(/^.*?Schemas validity error : /, "")
    .replace(/^Element '([^']+)', attribute '([^']+)':/, "$1 ($2):")
    .replace(/^Element '([^']+)':/, "$1:");
  return m
    .replace(/The value '([^']*)' does not match the fixed value constraint '([^']*)'\.?/, "o valor \"$1\" deveria ser \"$2\"")
    .replace(/\[facet 'pattern'\] The value '([^']*)' is not accepted by the pattern '[^']*'\.?/, "o valor \"$1\" não está no formato exigido")
    .replace(/\[facet 'enumeration'\] The value '([^']*)' is not an element of the set \{[^}]*\}\.?/, "o valor \"$1\" não é um dos aceitos")
    .replace(/\[facet '(?:maxLength|minLength)'\] The value '([^']*)' has a length of '(\d+)'; this (?:exceeds|underruns) the allowed (?:maximum|minimum) length of '(\d+)'\.?/, "o valor \"$1\" tem $2 caracteres (limite $3)")
    .replace(/This element is not expected\. Expected is(?: one of)? \( ?([^)]*)\)\.?/, "está fora de ordem ou sobrando; o esperado aqui é: $1")
    .replace(/Missing child element\(s\)\. Expected is(?: one of)? \( ?([^)]*)\)\.?/, "falta preencher: $1")
    .replace(/'' is not a valid value of the atomic type '[^']*'\.?/, "está vazio")
    .replace(/The value '([^']*)' is not a valid value of the atomic type '[^']*'\.?/, "o valor \"$1\" é inválido")
    .replace(/\s+/g, " ").trim();
}

/** Confere o XML com os XSD oficiais. Em teste, passe `carregar` lendo do disco. */
export async function validarEstrutura(xml: string, carregar: CarregarXsd = carregarDoSite): Promise<Achado[]> {
  try {
    if (!xsdCache) {
      const textos = await Promise.all(ARQUIVOS_XSD.map(carregar));
      xsdCache = Object.fromEntries(ARQUIVOS_XSD.map((n, i) => [n, textos[i]]));
    }
    const proc = /<nfeProc[\s>]/.test(xml);
    const principal = proc ? "procNFe_v4.00.xsd" : "nfe_v4.00.xsd";
    const { validateXML } = await import("xmllint-wasm");
    const r = await validateXML({
      xml: [{ fileName: "nota.xml", contents: xml.replace(/^﻿/, "") }],
      schema: [{ fileName: principal, contents: xsdCache[principal] }],
      preload: ARQUIVOS_XSD.filter((n) => n !== principal).map((n) => ({ fileName: n, contents: xsdCache![n] })),
    });
    if (r.valid) return [{ grupo: "estrutura", nivel: "ok", texto: "Estrutura de acordo com o esquema oficial da NF-e (leiaute 4.00, pacote PL_010 da Reforma)." }];
    const msgs = [...new Set(r.errors.map((e) => traduzirErroXsd(e.message ?? e.rawMessage)))];
    return msgs.slice(0, 15).map((texto) => ({ grupo: "estrutura" as const, nivel: "erro" as const, texto, codigo: "225" }))
      .concat(msgs.length > 15 ? [{ grupo: "estrutura", nivel: "erro", texto: `… e mais ${msgs.length - 15} erros de estrutura.`, codigo: "225" }] : []);
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e ?? "erro desconhecido");
    return [{ grupo: "estrutura", nivel: "alerta", texto: `Não deu para conferir a estrutura agora: ${msg}` }];
  }
}

// ---------------------------------------------------------------- 2: assinatura digital

/** Nome e CNPJ do certificado ("EMPRESA LTDA:12345678000199" no CN dos certificados ICP-Brasil e-CNPJ). */
export function dadosDoTitular(subject: string): { nome: string; cnpj: string | null } {
  const cn = /(?:^|,\s*)CN=([^,]+)/.exec(subject)?.[1]?.trim() ?? subject;
  const m = /^(.*?):(\d{14})$/.exec(cn);
  return m ? { nome: m[1], cnpj: m[2] } : { nome: cn, cnpj: /\d{14}/.exec(subject)?.[0] ?? null };
}

export async function verificarAssinatura(xml: string): Promise<Achado[]> {
  const out: Achado[] = [];
  try {
    const xmldsig = await import("xmldsigjs");
    if (typeof self === "undefined") {
      // testes (Node): as bibliotecas de XML e de criptografia do navegador vêm de outro lugar
      const { setNodeDependencies } = await import("xml-core");
      const xpath = await import("xpath");
      setNodeDependencies({ DOMParser, XMLSerializer, xpath });
      xmldsig.Application.setEngine("NodeJS", globalThis.crypto);
    }
    const doc = xmldsig.Parse(xml.replace(/^﻿/, ""));
    const sigs = doc.getElementsByTagNameNS(NS_DS, "Signature");
    if (!sigs.length) return [{ grupo: "assinatura", nivel: "erro", texto: "O XML não tem assinatura digital.", codigo: "290" }];
    const signed = new xmldsig.SignedXml(doc);
    signed.LoadXml(sigs[0] as Element);
    // conteúdo mexido: a biblioteca avisa com erro ("Invalid digest") em vez de devolver false
    const valida = await signed.Verify().catch((e: Error) => { if (/invalid digest/i.test(e.message)) return false; throw e; });
    out.push(valida
      ? { grupo: "assinatura", nivel: "ok", texto: "Assinatura digital válida: o XML não foi alterado depois de assinado." }
      : { grupo: "assinatura", nivel: "erro", texto: "Assinatura digital NÃO confere: o XML foi alterado depois de assinado.", codigo: "297" });

    const b64 = (sigs[0] as Element).getElementsByTagNameNS(NS_DS, "X509Certificate")[0]?.textContent?.replace(/\s/g, "");
    if (b64) {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const cert = new xmldsig.X509Certificate(raw);
      const titular = dadosDoTitular(cert.Subject);
      const simpl = (cert as unknown as { simpl: { notBefore: { value: Date }; notAfter: { value: Date } } }).simpl;
      const ini = simpl.notBefore.value, fim = simpl.notAfter.value;
      const dEmi = new Date(/<dhEmi>([^<]+)<\/dhEmi>/.exec(xml)?.[1] ?? Date.now());
      const emit = /<emit>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/.exec(xml)?.[1] ?? null;
      const fmt = (d: Date) => d.toLocaleDateString("pt-BR");
      out.push({ grupo: "assinatura", nivel: "ok", texto: `Certificado de ${titular.nome}, válido de ${fmt(ini)} a ${fmt(fim)}${/ICP-Brasil/i.test(cert.Issuer) ? " (ICP-Brasil)" : ""}.` });
      if (!/ICP-Brasil/i.test(cert.Issuer)) out.push({ grupo: "assinatura", nivel: "erro", texto: "O certificado não é da cadeia ICP-Brasil.", codigo: "283" });
      if (dEmi < ini || dEmi > fim) out.push({ grupo: "assinatura", nivel: "erro", texto: "O certificado não estava válido na data de emissão da nota.", codigo: "282" });
      if (titular.cnpj && emit && titular.cnpj.slice(0, 8) !== emit.slice(0, 8))
        out.push({ grupo: "assinatura", nivel: "erro", texto: "O certificado é de outra empresa (raiz do CNPJ diferente da do emitente).", codigo: "213" });
    }
  } catch (e) {
    out.push({ grupo: "assinatura", nivel: "alerta", texto: `Não deu para conferir a assinatura: ${(e as Error).message}` });
  }
  return out;
}

// ---------------------------------------------------------------- tudo junto

/** As quatro conferências. `situacaoErp` é o que o ERP sabe da SEFAZ (ex.: "cancelada" pelo evento recebido). */
export async function validarNfe(xml: string, opcoes: { carregarXsd?: CarregarXsd; situacaoErp?: string | null; agora?: Date } = {}): Promise<ResultadoValidacao> {
  const base = conferirRegras(xml, opcoes.agora);
  if (base.chave === null && base.achados.some((a) => a.grupo === "estrutura" && a.nivel === "erro" && !a.codigo)) return base;
  const [estrutura, assinatura] = await Promise.all([validarEstrutura(xml, opcoes.carregarXsd), verificarAssinatura(xml)]);
  const achados = [...estrutura, ...assinatura, ...base.achados];
  const s = opcoes.situacaoErp?.toLowerCase();
  if (s === "cancelada") achados.push({ grupo: "protocolo", nivel: "erro", texto: "A SEFAZ registrou o CANCELAMENTO desta nota (evento recebido pelo ERP)." });
  else if (s === "denegada") achados.push({ grupo: "protocolo", nivel: "erro", texto: "A SEFAZ registrou esta nota como DENEGADA." });
  return { ...base, achados, nivel: nivelGeral(achados) };
}
