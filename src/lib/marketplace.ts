// Auditoria dos produtos: cadastros repetidos, nome no padrão (SEO) e o que falta para anunciar em marketplace
// (Mercado Livre, Shopee, Amazon, loja virtual). Funções puras: a tela e os testes usam as mesmas regras.

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
      if (/^\d/.test(tokens[i - 1] ?? "")) return conjuncao ? p.toLowerCase() : p;
      // antes de número é modelo (A 200), a não ser que tenha vindo minúscula ("antiga e 3 sabores")
      if (/^\d/.test(tokens[i + 1] ?? "") || /^(tipo|modelo|classe|linha)$/i.test(tokens[i - 1] ?? "")) return conjuncao && p === p.toLowerCase() ? p : p.toUpperCase();
      if (!conjuncao && p === p.toUpperCase()) return p;
    }
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
// GTIN (EAN)
// ---------------------------------------------------------------------
export function gtinValido(codigo?: string | null): boolean {
  const d = String(codigo ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d)) return false;
  const digitos = d.split("").map(Number);
  const verificador = digitos.pop()!;
  const soma = digitos.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === verificador;
}

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
  if (!p.marca && /\bmy\s*frost\b/i.test(p.descricao)) novo.marca = "My Frost";
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
  for (const [ean, lista] of porEan) if (lista.length > 1) montar(`ean:${ean}`, `mesmo EAN ${ean}`, lista);
  return grupos.sort((a, b) => Number(b.identicos) - Number(a.identicos) || b.produtos.length - a.produtos.length);
}
