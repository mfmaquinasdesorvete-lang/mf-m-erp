// Auditoria dos produtos: cadastros repetidos, nome no padrão (SEO) e o que falta para anunciar em marketplace
// (Mercado Livre, Shopee, Amazon, loja virtual). Funções puras: a tela e os testes usam as mesmas regras.
import { analisarGtin, gtinValido } from "./gtin";

export type ProdutoAnuncio = {
  id: string; descricao: string; sku?: string | null; tipo?: string | null; unidade?: string | null; ativo?: boolean | null;
  preco_venda?: number | string | null; preco_custo?: number | string | null; estoque_atual?: number | string | null;
  codigo_barras?: string | null; gtin_isento?: boolean | null; ncm?: string | null; marca?: string | null; modelo?: string | null;
  categoria?: string | null; foto_caminho?: string | null; peso_kg?: number | string | null; altura_cm?: number | string | null;
  largura_cm?: number | string | null; profundidade_cm?: number | string | null; embalagem_id?: string | null;
  garantia_meses?: number | null; descricao_catalogo?: string | null; no_catalogo?: boolean | null; kit?: boolean | null;
  titulo_anuncio?: string | null; slug?: string | null; meta_descricao?: string | null; palavras_chave?: string[] | null;
  descricao_anuncio?: string | null; id_externo?: string | null; created_at?: string | null; unificado_em?: string | null;
};

export const LIMITE_TITULO = 60;   // Mercado Livre (o mais curto dos marketplaces)
export const LIMITE_META = 160;    // o Google mostra ~155-160 letras

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ---------------------------------------------------------------------
// Nome padronizado
// ---------------------------------------------------------------------
/** Palavras do ramo que costumam vir sem acento do sistema antigo. */
const ACENTOS: Record<string, string> = {
  maquina: "máquina", maquinas: "máquinas", peca: "peça", pecas: "peças", reposicao: "reposição", valvula: "válvula", valvulas: "válvulas",
  eletrico: "elétrico", eletrica: "elétrica", eletronico: "eletrônico", eletronica: "eletrônica", conexao: "conexão", conexoes: "conexões",
  pressao: "pressão", helice: "hélice", tensao: "tensão", vedacao: "vedação", vedacoes: "vedações", rele: "relé", reles: "relés",
  monofasico: "monofásico", monofasica: "monofásica", trifasico: "trifásico", trifasica: "trifásica", bifasico: "bifásico",
  regulavel: "regulável", voltimetro: "voltímetro", sobretensao: "sobretensão", subtensao: "subtensão", refrigeracao: "refrigeração",
  condensacao: "condensação", ventilacao: "ventilação", plastico: "plástico", plastica: "plástica", aco: "aço", botao: "botão",
  acucar: "açúcar", liquido: "líquido", automatico: "automático", automatica: "automática", termico: "térmico", termica: "térmica",
  hidraulico: "hidráulico", magnetico: "magnético", magnetica: "magnética", ceramica: "cerâmica", ceramico: "cerâmico",
  lampada: "lâmpada", eixo: "eixo", agua: "água", oleo: "óleo", ate: "até", nao: "não", padrao: "padrão", unico: "único",
  borracha: "borracha", capacitancia: "capacitância", potencia: "potência", espessura: "espessura", diametro: "diâmetro",
  extensao: "extensão", protecao: "proteção", aluminio: "alumínio", latao: "latão", silicone: "silicone", sorvete: "sorvete",
  acrilico: "acrílico", acrilica: "acrílica", dosagem: "dosagem", calibracao: "calibração", manutencao: "manutenção",
  lubrificacao: "lubrificação", fixacao: "fixação", rotacao: "rotação", transmissao: "transmissão", tampao: "tampão",
  rolamento: "rolamento", cilindrico: "cilíndrico", universal: "universal", eletrovalvula: "eletroválvula", termostatico: "termostático",
  pressostato: "pressostato", reservatorio: "reservatório", cubo: "cubo", redutor: "redutor", dispositivo: "dispositivo",
  frequencia: "frequência", mecanica: "mecânica", mecanico: "mecânico", furacao: "furação", acai: "açaí", nivel: "nível",
  solido: "sólido", rodizio: "rodízio", rodizios: "rodízios", manipulo: "manípulo", pistao: "pistão", pistoes: "pistões",
  injecao: "injeção", saida: "saída", femea: "fêmea", asfaltica: "asfáltica", abracadeira: "abraçadeira", calculo: "cálculo",
  agitador: "agitador", polimero: "polímero", termometro: "termômetro", higienizacao: "higienização",
  instalacao: "instalação", alimentacao: "alimentação", sabores: "sabores", unica: "única", especifico: "específico",
};
/** Erros de digitação que apareceram no cadastro. */
const CORRECOES: Record<string, string> = {
  extrutura: "estrutura", decida: "descida", aniga: "antiga", fontal: "frontal", queem: "queen", competo: "completo", uni: "un",
  acai: "açaí",
};
/** Ficam minúsculas no meio do nome. */
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "sem", "a", "o", "as", "os", "na", "no", "nas", "nos", "por", "ou", "x"]);
/** Siglas e marcas que ficam como são. */
const SIGLAS = new Set(["MF", "NCM", "LED", "PVC", "CV", "HP", "PTFE", "NBR", "ABS", "USB", "PCB", "NTC", "EPDM", "POM", "SMD", "CI", "BR", "SP", "SC", "UV", "CLP", "SSR", "DML", "GN", "ACM", "PP", "IBR", "ABB", "LBP", "NJ", "BMD", "RS", "ART"]);
/** Palavras curtas comuns que, em maiúsculas, não são sigla. */
const COMUNS = new Set(["ver", "uso", "top", "ret", "sem", "com", "kit", "par", "ar", "tam", "mec", "fio", "gas", "gás", "tipo", "aço", "aco", "pé", "pá", "bia", "fan", "led"]);
/** Medidas soltas: ficam como se escreve. */
const MEDIDAS: Record<string, string> = { mm: "mm", cm: "cm", m: "m", kg: "kg", g: "g", ml: "ml", l: "L", mm2: "mm²" };
const MARCAS: Record<string, string> = { "my frost": "My Frost", myfrost: "My Frost", taylor: "Taylor", carpigiani: "Carpigiani", weg: "WEG", embraco: "Embraco", tecumseh: "Tecumseh", danfoss: "Danfoss" };
/** Unidade de medida colada no fim do nome ("- UN", "(PC)"): não é nome de produto. */
const SUFIXO_UNIDADE = /\s*(?:[-–]\s*|\(\s*)(UN|UND|UNID|PC|PÇ|PCS|CJ|PAR|JG|CX|PCT)\s*\)?\s*$/i;

const maiuscula = (t: string) => t.replace(/\p{L}/u, (c) => c.toUpperCase());

function palavra(p: string, primeira: boolean, nomeTodoMaiusculo: boolean): string {
  if (!p) return p;
  // números com unidade: 220v → 220V, 63a → 63A, 1,5cv → 1,5CV; 06MM → 06mm, 450G → 450g
  if (/\d/.test(p)) {
    return p.replace(/(\d)(v|a|w|hz|cv|hp|kva|kw)\b/gi, (_, d: string, u: string) => d + u.toUpperCase())
      .replace(/(\d)(mm2|mm|cm|kg|g|ml)\b/gi, (_, d: string, u: string) => d + (MEDIDAS[u.toLowerCase()] ?? u.toLowerCase()));
  }
  const [, pre, nucleo, pos] = /^([^\p{L}]*)(.*?)([^\p{L}]*)$/u.exec(p) ?? ["", "", p, ""];
  if (!nucleo) return p;
  const lower = nucleo.toLowerCase();
  const so = lower.replace(/[^a-zà-ÿ]/g, "");
  const base = semAcento(so);
  const corrigido = CORRECOES[base] ?? null;
  if (MEDIDAS[lower] && !primeira) return pre + MEDIDAS[lower] + pos;
  if (SIGLAS.has(nucleo.toUpperCase())) return pre + nucleo.toUpperCase() + pos;
  // sigla curta num nome escrito normalmente (CLP, ABB) fica; num nome todo em maiúsculas vira palavra
  if (!nomeTodoMaiusculo && nucleo.length <= 3 && nucleo === nucleo.toUpperCase() && /^[A-Z]+$/.test(nucleo) && !MINUSCULAS.has(lower) && !COMUNS.has(lower)) return p;
  let w = corrigido ?? lower;
  const b2 = semAcento(w).replace(/[^a-z]/g, "");
  if (ACENTOS[b2] && w.replace(/[^a-z]/g, "") === b2) w = w.replace(b2, ACENTOS[b2]);
  if (!primeira && MINUSCULAS.has(w)) return pre + w + pos;
  return pre + maiuscula(w) + pos;
}

/** Nome padronizado: sem a unidade no fim, espaços e hífens arrumados, maiúsculas e acentos no lugar. */
export function nomePadrao(descricao: string): string {
  let t = String(descricao ?? "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2 && SUFIXO_UNIDADE.test(t) && t.replace(SUFIXO_UNIDADE, "").trim().length >= 3; i++) t = t.replace(SUFIXO_UNIDADE, "").trim();
  // hífen com espaço de um lado é separador (" - "); colado dos dois lados é parte do código (A-269, 2205-2RS)
  // anel o-ring escrito de vários jeitos (oring, o ring, Oring's) vira O-Ring / O-Rings
  t = t.replace(/\bo[\s-]?ring('?s)?\b/gi, (_, pl: string | undefined) => (pl ? "O-Rings" : "O-Ring"));
  t = t.replace(/\s+[-–]\s*|\s*[-–]\s+/g, " - ").replace(/–/g, "-")
    .replace(/\s+,/g, ",").replace(/,(?=\p{L})/gu, ", ").replace(/([!?.]){2,}/g, "$1")
    .replace(/\s*-\s*$/, "").replace(/^\s*-\s*/, "").replace(/\s+/g, " ").trim();
  // marcas conhecidas
  for (const [k, v] of Object.entries(MARCAS)) t = t.replace(new RegExp(`\\b${k.replace(" ", "\\s*")}\\b`, "gi"), v);
  const marcas = new Set(Object.values(MARCAS).flatMap((m) => m.split(" ")));
  const letras = t.replace(/[^\p{L}]/gu, "");
  const todoMaiusculo = letras.length > 3 && letras === letras.toUpperCase();
  const tokens = t.split(" ");
  const unidadesNoCodigo = (c: string) => c.replace(/(\d)(MM2|MM|CM|KG|ML)$/i, (_, d: string, u: string) => d + (MEDIDAS[u.toLowerCase()] ?? u.toLowerCase()));
  return tokens.map((p, i) => {
    const primeira = i === 0 || tokens[i - 1] === "-";
    if (marcas.has(p)) return p;
    // letra sozinha antes de número é modelo (A 200, P 313, Q 050); entre números é "a" (6 a 10A)
    if (/^[xX]$/.test(p)) return "x";   // medida: 80 x 500
    if (/^[A-Za-z]$/.test(p)) {
      const conjuncao = /^[aeo]$/i.test(p);
      // entre números: "6 a 10A"; as outras letras ficam como vieram (3P T: terra)
      // "a" depois de número: entre dois números é faixa (63 a 220 V); sem número depois é ampère (10 A, 80 A Monofásico)
      if (/^\d/.test(tokens[i - 1] ?? "")) return /^a$/i.test(p) && !/^\d/.test(tokens[i + 1] ?? "") ? "A" : conjuncao ? p.toLowerCase() : p;
      // antes de número é modelo (A 200), a não ser que tenha vindo minúscula ("antiga e 3 sabores")
      if (/^\d/.test(tokens[i + 1] ?? "") || /^(tipo|modelo|classe|linha)$/i.test(tokens[i - 1] ?? "")) return conjuncao && p === p.toLowerCase() ? p : p.toUpperCase();
      if (!conjuncao && p === p.toUpperCase()) return p;
    }
    if (/^O-Rings?$/.test(p)) return p;
    // código do produto (maiúsculas e números com barra, ponto ou hífen) fica como está: FS/4-350, 2205-2RS, BF117-1D
    if (/^[A-Z0-9]+([/.-][A-Z0-9]+)+$/.test(p) && /\d/.test(p) && /[A-Z]/.test(p)) return unidadesNoCodigo(p);
    return p.split(/([-/])/).map((s, k) => (s === "-" || s === "/" ? s : palavra(s, primeira && k === 0, todoMaiusculo))).join("");
  }).join(" ");
}

// ---------------------------------------------------------------------
// Anúncio: título, endereço (slug), descrição para o Google, palavras-chave e texto
// ---------------------------------------------------------------------
const TIPO_FRASE: Record<string, string> = {
  peca: "Peça de reposição", acessorio: "Acessório", insumo: "Componente", maquina: "Máquina",
};

function cortar(t: string, max: number) {
  if (t.length <= max) return t;
  let c = t.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[\s,;:-]+$/, "");
  // não deixa um pedaço solto depois do último " - " (ex.: "... - Ver")
  const ult = c.lastIndexOf(" - ");
  if (ult > max * 0.5 && c.length - ult - 3 < 8) c = c.slice(0, ult);
  return c.length >= max * 0.6 ? c : t.slice(0, max).trim();
}

/** Título do anúncio: nome padronizado + "para Máquina de Sorvete" quando é peça e o nome não diz para que serve. */
export function tituloAnuncio(p: ProdutoAnuncio): string {
  let t = nomePadrao(p.descricao);
  const s = semAcento(t.toLowerCase());
  if (p.tipo !== "maquina" && !/maquina|sorvete|soft|milk ?shake|picole|acai/.test(s)) {
    const comUso = `${t} para Máquina de Sorvete`;
    if (comUso.length <= LIMITE_TITULO) t = comUso;
  }
  if (p.marca && !semAcento(t.toLowerCase()).includes(semAcento(p.marca.toLowerCase()))) {
    const comMarca = `${t} ${p.marca}`;
    if (comMarca.length <= LIMITE_TITULO) t = comMarca;
  }
  return cortar(t, LIMITE_TITULO);
}

export function slugDe(texto: string): string {
  return semAcento(String(texto ?? "").toLowerCase()).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 80).replace(/-+$/, "");
}

/** Endereço único: se já existe, acrescenta o SKU ou um número. */
export function slugUnico(p: ProdutoAnuncio, usados: Set<string>): string {
  const base = slugDe(p.titulo_anuncio || tituloAnuncio(p)) || `produto-${p.id.slice(0, 8)}`;
  if (!usados.has(base)) return base;
  const comSku = p.sku ? `${base}-${slugDe(p.sku)}` : "";
  if (comSku && !usados.has(comSku)) return comSku;
  for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
}

const PALAVRAS_VAZIAS = new Set([...MINUSCULAS, "para", "um", "uma", "sem", "com", "kit", "un", "pc"]);
export function palavrasChave(p: ProdutoAnuncio): string[] {
  const titulo = nomePadrao(p.descricao);
  const termos = new Set<string>();
  const add = (t?: string | null) => { const x = String(t ?? "").trim().toLowerCase(); if (x.length >= 3) termos.add(x); };
  add(titulo);
  titulo.split(/[\s,/()-]+/).forEach((w) => { if (!PALAVRAS_VAZIAS.has(w.toLowerCase()) && w.length >= 4 && !/^\d+$/.test(w)) add(w); });
  add(p.marca); add(p.modelo); add(p.categoria);
  if (p.tipo === "maquina") { add("máquina de sorvete"); add("máquina de sorvete expresso"); }
  else { add("peça para máquina de sorvete"); add("reposição máquina de sorvete"); }
  if (p.sku) add(p.sku);
  return [...termos].slice(0, 12);
}

export function metaDescricao(p: ProdutoAnuncio, loja = "MF Máquinas"): string {
  const titulo = p.titulo_anuncio || tituloAnuncio(p);
  const tipo = TIPO_FRASE[p.tipo ?? ""] ?? "Produto";
  const resumo = String(p.descricao_catalogo ?? "").replace(/\s+/g, " ").trim();
  const meio = resumo ? cortar(resumo, 80) : `${tipo}${p.tipo !== "maquina" ? " para máquinas de sorvete" : ""}${p.marca ? ` ${p.marca}` : ""}`;
  return cortar(`${titulo}. ${meio}. Envio para todo o Brasil com nota fiscal. ${loja}.`.replace(/\.\./g, "."), LIMITE_META);
}

/** Texto do anúncio (texto puro: os marketplaces não aceitam HTML, telefone, e-mail nem link). */
export function descricaoAnuncio(p: ProdutoAnuncio, garantiaPadrao = 3): string {
  const titulo = p.titulo_anuncio || tituloAnuncio(p);
  const tipo = TIPO_FRASE[p.tipo ?? ""] ?? "Produto";
  const linhas: string[] = [titulo, ""];
  const resumo = String(p.descricao_catalogo ?? "").trim();
  linhas.push(resumo || `${tipo}${p.tipo !== "maquina" ? " para máquinas de sorvete" : ""}, pronta para uso. Confira o modelo e as medidas antes de comprar.`, "");
  const espec: string[] = [];
  if (p.marca) espec.push(`Marca: ${p.marca}`);
  if (p.modelo) espec.push(`Modelo / compatibilidade: ${p.modelo}`);
  if (p.sku) espec.push(`Código: ${p.sku}`);
  const [a, l, c] = [num(p.altura_cm), num(p.largura_cm), num(p.profundidade_cm)];
  if (a && l && c) espec.push(`Medidas: ${c} × ${l} × ${a} cm (C × L × A)`);
  if (num(p.peso_kg)) espec.push(`Peso: ${String(num(p.peso_kg)).replace(".", ",")} kg`);
  if (espec.length) linhas.push("ESPECIFICAÇÕES", ...espec.map((e) => `• ${e}`), "");
  const g = p.garantia_meses ?? garantiaPadrao;
  if (g) linhas.push("GARANTIA", `${g} ${g === 1 ? "mês" : "meses"} de garantia contra defeito de fabricação.`, "");
  const usado = /usad/i.test(p.descricao);
  linhas.push("ENVIO", `Enviamos para todo o Brasil com nota fiscal. ${usado ? "Produto usado, revisado e testado" : "Produto novo"}, embalado com proteção.`, "");
  linhas.push("DÚVIDAS", "Antes de comprar, mande uma pergunta com o modelo da sua máquina que confirmamos a compatibilidade.");
  return linhas.join("\n");
}

// ---------------------------------------------------------------------
// GTIN (EAN): validação em ./gtin
// ---------------------------------------------------------------------
export { gtinValido };

// ---------------------------------------------------------------------
// Prontidão para marketplace
// ---------------------------------------------------------------------
export type Pendencia = { id: string; texto: string; peso: number; automatica: boolean };
const CONTATO = /(\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})|(@[a-z0-9-]+\.[a-z]{2,})|(https?:\/\/|www\.)|\bwhats\s?app\b/i;

export function avaliarAnuncio(p: ProdutoAnuncio): { nota: number; pendencias: Pendencia[] } {
  const pend: Pendencia[] = [];
  const titulo = (p.titulo_anuncio || "").trim();
  const nomeOk = nomePadrao(p.descricao) === p.descricao.replace(/\s+/g, " ").trim();
  if (!nomeOk) pend.push({ id: "nome", texto: "nome fora do padrão (unidade no fim, maiúsculas ou acentos)", peso: 10, automatica: true });
  if (!titulo) pend.push({ id: "titulo", texto: "sem título de anúncio", peso: 10, automatica: true });
  else if (titulo.length > LIMITE_TITULO) pend.push({ id: "titulo", texto: `título com ${titulo.length} letras (máximo ${LIMITE_TITULO})`, peso: 10, automatica: true });
  else if (titulo.length < 15) pend.push({ id: "titulo", texto: "título curto demais: diga o que é, para que serve e a marca", peso: 5, automatica: false });
  else if (titulo === titulo.toUpperCase() && /[A-Z]{4}/.test(titulo)) pend.push({ id: "titulo", texto: "título todo em maiúsculas", peso: 5, automatica: true });
  const desc = (p.descricao_anuncio || "").trim();
  if (desc.length < 200) pend.push({ id: "descricao", texto: desc ? "descrição do anúncio curta (menos de 200 letras)" : "sem descrição do anúncio", peso: 15, automatica: !desc });
  else if (CONTATO.test(desc)) pend.push({ id: "descricao", texto: "descrição com telefone, e-mail, link ou WhatsApp (os marketplaces proíbem)", peso: 10, automatica: false });
  if (!p.foto_caminho) pend.push({ id: "foto", texto: "sem foto (use fundo branco; o ideal são 3 ou mais)", peso: 15, automatica: false });
  if (!(num(p.preco_venda) > 0)) pend.push({ id: "preco", texto: "sem preço de venda", peso: 10, automatica: false });
  if (!p.sku) pend.push({ id: "sku", texto: "sem SKU (código do vendedor)", peso: 5, automatica: false });
  if (!p.gtin_isento && !gtinValido(p.codigo_barras)) {
    pend.push({ id: "gtin", texto: p.codigo_barras ? "EAN inválido (dígito verificador não confere)" : "sem EAN: informe ou marque \"sem GTIN\" (produto próprio)", peso: 10, automatica: false });
  } else if (!p.gtin_isento && analisarGtin(p.codigo_barras).interno) {
    pend.push({ id: "gtin", texto: "EAN de uso interno (faixa 2xx/04x): marketplace não aceita, use o da GS1 ou marque \"sem GTIN\"", peso: 10, automatica: false });
  }
  if (!p.marca) pend.push({ id: "marca", texto: "sem marca", peso: 5, automatica: false });
  if (!p.modelo) pend.push({ id: "modelo", texto: "sem modelo / compatibilidade", peso: 5, automatica: false });
  if (String(p.ncm ?? "").replace(/\D/g, "").length !== 8) pend.push({ id: "ncm", texto: "sem NCM (8 dígitos)", peso: 5, automatica: false });
  const medidas = num(p.altura_cm) && num(p.largura_cm) && num(p.profundidade_cm);
  if (!(num(p.peso_kg) > 0) || (!medidas && !p.embalagem_id)) pend.push({ id: "frete", texto: "sem peso e medidas da embalagem (o frete do marketplace precisa)", peso: 10, automatica: false });
  if (!p.categoria) pend.push({ id: "categoria", texto: "sem categoria", peso: 5, automatica: false });
  if (!p.slug || !p.meta_descricao || !(p.palavras_chave?.length)) pend.push({ id: "seo", texto: "sem endereço da página, descrição para o Google ou palavras-chave", peso: 5, automatica: true });
  const perdido = pend.reduce((s, x) => s + x.peso, 0);
  return { nota: Math.max(0, 100 - perdido), pendencias: pend };
}

/** O que a correção automática preenche (só o que está vazio ou fora do padrão; nunca apaga o que alguém escreveu). */
export function correcaoAutomatica(p: ProdutoAnuncio, usados: Set<string>, garantiaPadrao = 3): Partial<ProdutoAnuncio> {
  const novo: Partial<ProdutoAnuncio> = {};
  const nome = nomePadrao(p.descricao);
  if (nome && nome !== p.descricao) novo.descricao = nome;
  const base = { ...p, ...novo };
  const tit = (p.titulo_anuncio || "").trim();
  if (!tit || tit.length > LIMITE_TITULO || (tit === tit.toUpperCase() && /[A-Z]{4}/.test(tit))) novo.titulo_anuncio = tituloAnuncio(base);
  const comTitulo = { ...base, ...novo };
  if (!p.slug) { novo.slug = slugUnico(comTitulo, usados); usados.add(novo.slug); }
  if (!p.meta_descricao) novo.meta_descricao = metaDescricao(comTitulo);
  if (!p.palavras_chave?.length) novo.palavras_chave = palavrasChave(comTitulo);
  if (!(p.descricao_anuncio || "").trim()) novo.descricao_anuncio = descricaoAnuncio(comTitulo, garantiaPadrao);
  return novo;
}

// ---------------------------------------------------------------------
// Cadastros repetidos
// ---------------------------------------------------------------------
export type GrupoRepetido = {
  chave: string; motivo: string; produtos: ProdutoAnuncio[]; principal: string;
  /** idênticos (mesmo nome, preço e sem códigos diferentes): podem ser unificados de uma vez */
  identicos: boolean; alerta?: string;
};

/** Nome comparável: sem acento, pontuação, unidade no fim e ordem das palavras. */
export const chaveNome = (d: string) => semAcento(nomePadrao(d).toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");

/** Qual fica: o que já foi usado, com SKU, EAN, foto e catálogo; empate fica o mais antigo. */
export function pontuar(p: ProdutoAnuncio, uso = 0) {
  return uso * 100 + (p.sku ? 20 : 0) + (gtinValido(p.codigo_barras) ? 10 : 0) + (p.foto_caminho ? 8 : 0) + (p.no_catalogo ? 5 : 0)
    + (num(p.estoque_atual) ? 5 : 0) + (p.ncm ? 2 : 0) + (p.marca ? 1 : 0) + (p.descricao_catalogo ? 2 : 0);
}

export function gruposRepetidos(produtos: ProdutoAnuncio[], uso: Map<string, number> = new Map()): GrupoRepetido[] {
  const ativos = produtos.filter((p) => p.ativo !== false && !p.unificado_em);
  const porNome = new Map<string, ProdutoAnuncio[]>();
  for (const p of ativos) { const k = chaveNome(p.descricao); if (k.length >= 3) porNome.set(k, [...(porNome.get(k) ?? []), p]); }
  const vistos = new Set<string>();
  const grupos: GrupoRepetido[] = [];
  const montar = (chave: string, motivo: string, lista: ProdutoAnuncio[]) => {
    const ordenados = [...lista].sort((a, b) => pontuar(b, uso.get(b.id)) - pontuar(a, uso.get(a.id)) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    const skus = new Set(lista.map((p) => String(p.sku ?? "").trim().toUpperCase()).filter(Boolean));
    const eans = new Set(lista.map((p) => String(p.codigo_barras ?? "").trim()).filter(Boolean));
    const precos = new Set(lista.map((p) => num(p.preco_venda).toFixed(2)));
    const kits = new Set(lista.map((p) => !!p.kit));
    const alertas: string[] = [];
    if (skus.size > 1) alertas.push(`códigos diferentes (${[...skus].join(", ")}): podem ser modelos diferentes`);
    if (precos.size > 1) alertas.push(`preços diferentes (${[...precos].map((x) => x.replace(".", ",")).join(" / ")})`);
    if (kits.size > 1) alertas.push("um é kit e outro não");
    grupos.push({ chave, motivo, produtos: ordenados, principal: ordenados[0].id, identicos: skus.size <= 1 && eans.size <= 1 && precos.size === 1 && kits.size === 1, alerta: alertas.join("; ") || undefined });
    lista.forEach((p) => vistos.add(p.id));
  };
  for (const [k, lista] of porNome) if (lista.length > 1) montar(`nome:${k}`, "mesmo nome", lista);
  // mesmo EAN válido com nomes diferentes
  const porEan = new Map<string, ProdutoAnuncio[]>();
  for (const p of ativos) if (gtinValido(p.codigo_barras) && !vistos.has(p.id)) porEan.set(String(p.codigo_barras), [...(porEan.get(String(p.codigo_barras)) ?? []), p]);
  // o último grupo montado nunca une sozinho: alguém confere e marca o que é o mesmo produto
  const conferir = (aviso: string) => {
    const g = grupos[grupos.length - 1];
    g.identicos = false;
    g.alerta = [aviso, g.alerta].filter(Boolean).join("; ");
  };
  for (const [ean, lista] of porEan) if (lista.length > 1) {
    montar(`ean:${ean}`, `mesmo EAN ${ean}`, lista);
    if (lista.some((a, i) => lista.some((b, j) => j > i && !nomesParecidos(a, b)))) {
      conferir("produtos diferentes com o mesmo EAN: o EAN deve estar errado em algum deles — corrija o EAN em vez de juntar");
    }
  }
  // nome parecido (palavras quase iguais, mesmos números): pode ser o mesmo produto escrito de outro jeito
  const resto = ativos.filter((p) => !vistos.has(p.id));
  const pai = new Map(resto.map((p) => [p.id, p.id]));
  const raiz = (id: string): string => (pai.get(id) === id ? id : raiz(pai.get(id)!));
  for (let i = 0; i < resto.length; i++) for (let j = i + 1; j < resto.length; j++) {
    if (nomesParecidos(resto[i], resto[j])) pai.set(raiz(resto[j].id), raiz(resto[i].id));
  }
  const porRaiz = new Map<string, ProdutoAnuncio[]>();
  for (const p of resto) porRaiz.set(raiz(p.id), [...(porRaiz.get(raiz(p.id)) ?? []), p]);
  for (const [k, lista] of porRaiz) if (lista.length > 1) {
    montar(`parecido:${k}`, "nome parecido", lista);
    conferir("nomes parecidos: confira se é o mesmo produto");
  }
  return grupos.sort((a, b) => Number(b.identicos) - Number(a.identicos) || b.produtos.length - a.produtos.length);
}

// palavras que não ajudam a diferenciar ("My Frost", "de", "para"…); "c" e "s" ficam (C/ freio x S/ freio)
const VAZIAS = new Set(["my", "frost", "de", "da", "do", "das", "dos", "para", "p", "com", "e", "em", "o", "a", "os", "as", "un", "und", "unid", "maquina", "maquinas", "modelo", "modelos"]);
const radical = (w: string) => (w.length > 4 ? w.replace(/(oes|aes)$/, "ao").replace(/s$/, "") : w);
// medidas viram uma palavra só: "40 x 40 x 1,0" → 40x40x1d0, "1/4" → 1f4, "6mm" → 6
const palavras = (d: string) => new Set(semAcento(String(d ?? "").toLowerCase()).replace(/(\d)\s*mm\b/g, "$1")
  .replace(/(\d)\s*[,.]\s*(?=\d)/g, "$1d").replace(/(\d)\s*\/\s*(?=\d)/g, "$1f").replace(/(\d)\s*x\s*(?=\d)/g, "$1x")
  .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !VAZIAS.has(w)).map(radical));
const semelhanca = (A: Set<string>, B: Set<string>) => [...A].filter((w) => B.has(w)).length / (new Set([...A, ...B]).size || 1);
const pacote = (d: string) => /\b\d+\s*(un|unid|unidades|pcs|pecas|pc)\b/i.test(semAcento(String(d ?? "")));
// palavras que, sozinhas, já fazem ser outro produto (versão, tamanho, lado, cor, ligação)
const DIFERENCIA = /^(antig|nov[oa]$|usad|seminov|grande|pequen|medi[oa]$|mini$|slim$|simples$|dupl|tripl|esquerd|direit|superior$|inferior$|dianteir|traseir|frontal$|intern|extern|macho$|feme|branc|pret[oa]$|azul$|vermelh|verde$|amarel|cinza$|monofasic|bifasic|trifasic)/;

/** Dois cadastros com cara de ser o mesmo produto: os mesmos números e medidas, nenhuma palavra que
 *  diferencia (antigo/novo, grande/pequena, cor, lado…), nenhum é pacote ou combinação ("A + B") só de
 *  um lado, e as palavras quase todas iguais (ou parecidas e com o mesmo preço). */
/** Códigos que identificam a peça (letra e número juntos, ou número longo) e os demais números do nome,
 *  com medidas e "P 386" escritos de um jeito só. */
export function codigosDaPeca(d: string | null | undefined) {
  let t = semAcento(String(d ?? "").toLowerCase()).replace(/compat[ií]vel com m[aá]quinas my frost/g, " ");
  for (let i = 0; i < 2; i++) t = t.replace(/(\d+(?:[.,]\d+)?)\s*x\s*(\d)/g, "$1x$2");
  t = t.replace(/\b([a-z]|top)\s+(\d{2,})\b/g, "$1$2").replace(/(\d)\s*mm\b/g, "$1").replace(/\(?\b1\s*un\.?\)?|\bun\b/g, " ");
  const codigos = new Set<string>(), numeros = new Set<string>();
  for (const bruto of t.split(/[\s()\[\],;+]+/)) {
    const w = bruto.replace(/^[-./]+|[-./]+$/g, "");
    if (!/\d/.test(w)) continue;
    const limpo = w.replace(/\./g, "");
    // medida com unidade (220v, 16a, 35w, 1/2hp, 25l) não identifica a peça; ano (2025) também não
    const medida = /^[\d/.,-]+(v|vca|vcc|vac|a|w|kw|hp|cv|kg|g|l|ml|mm|cm|m|hz|rpm|btu|btus|un|pc|pcs|min)$/.test(w) || /^(19|20)\d{2}$/.test(limpo)
      // modelo da máquina (A 200, P 386, Q 050, Top 300) é compatibilidade, não código da peça
      || /^(a|p|q|top|slim|prime)\d{2,4}$/.test(w);
    if (!medida && ((/[a-z]/.test(w) && w.length >= 4) || /^\d{4,}$/.test(limpo))) codigos.add(/^\d+$/.test(limpo) ? limpo : w);
    else numeros.add(w);
  }
  return { codigos, numeros };
}

export function nomesParecidos(a: ProdutoAnuncio, b: ProdutoAnuncio) {
  if ((a.tipo === "maquina") !== (b.tipo === "maquina") || !!a.kit !== !!b.kit) return false;
  // códigos da peça (216EP6, BCE10F, SAV 00949, P 386, 30x52x10) iguais nos dois: o mesmo item escrito de outro jeito
  const ca = codigosDaPeca(a.descricao), cb = codigosDaPeca(b.descricao);
  const comuns = [...ca.codigos].filter((c) => cb.codigos.has(c)).length;
  const soUm = [...ca.codigos].filter((c) => !cb.codigos.has(c)).length + [...cb.codigos].filter((c) => !ca.codigos.has(c)).length;
  const numerosDiferentes = [...ca.numeros].some((n) => !cb.numeros.has(n)) || [...cb.numeros].some((n) => !ca.numeros.has(n));
  const soModelos = !ca.codigos.size && !cb.codigos.size && ca.numeros.size >= 2 && !numerosDiferentes
    && semelhanca(palavras(a.descricao), palavras(b.descricao)) >= 0.5;
  if (comuns >= 2 || (comuns === 1 && !soUm && !numerosDiferentes) || soModelos) {
    const A0 = palavras(a.descricao), B0 = palavras(b.descricao);
    const diferenca = [...A0].filter((w) => !B0.has(w)).concat([...B0].filter((w) => !A0.has(w)));
    if (!diferenca.some((w) => DIFERENCIA.test(w))) return true;
  }
  if (pacote(a.descricao) !== pacote(b.descricao)) return false;
  if (String(a.descricao ?? "").includes("+") !== String(b.descricao ?? "").includes("+")) return false;
  const A = palavras(a.descricao), B = palavras(b.descricao);
  if (A.size < 2 || B.size < 2) return false;
  const so = [...A].filter((w) => !B.has(w)).concat([...B].filter((w) => !A.has(w)));
  if (so.some((w) => /\d/.test(w) || w.length === 1 || DIFERENCIA.test(w))) return false;
  const j = semelhanca(A, B);
  const pa = num(a.preco_venda), pb = num(b.preco_venda);
  const mesmoPreco = pa > 0 && pb > 0 && Math.abs(pa - pb) <= 0.1 * Math.max(pa, pb);
  return j >= 0.75 || (mesmoPreco && j >= 0.7);
}
