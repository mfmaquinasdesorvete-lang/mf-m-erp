// Mercado Livre: anúncio novo para um produto da loja (parte pura, sem Deno e sem navegador; testes em
// src/lib/__tests__/mlNovos.test.ts). O preço é o que deixa para a MF o mesmo valor da loja depois da tarifa do
// Mercado Livre (% + tarifa fixa abaixo de R$ 79) e do frete grátis (a partir de R$ 79), terminado em ,90.

/** A partir daqui o frete grátis é obrigatório e quem paga é o vendedor. */
export const FRETE_GRATIS_DESDE = 79;

/** Tarifa fixa por unidade abaixo de R$ 79 (tabela do Mercado Livre; a função confere na API quando dá). */
export function tarifaFixa(preco: number): number {
  if (preco >= FRETE_GRATIS_DESDE) return 0;
  if (preco < 12.5) return Math.round(preco * 50) / 100;
  if (preco < 29) return 6.25;
  if (preco < 50) return 6.5;
  return 6.75;
}

/** Quanto sobra para a MF com um preço. */
export function liquido(preco: number, pct: number, frete: number, fixa: (p: number) => number = tarifaFixa) {
  const r = preco - (preco * pct) / 100 - fixa(preco) - (preco >= FRETE_GRATIS_DESDE ? frete : 0);
  return Math.round(r * 100) / 100;
}

/** Sobe para o próximo valor terminado em ,90 (52,30 → 52,90; 52,95 → 53,90). */
export function terminarEm90(v: number): number {
  const c = Math.ceil((v + 0.1) - 1e-9) - 0.1;
  return Math.round(c * 100) / 100;
}

/**
 * Menor preço terminado em ,90 que deixa pelo menos `alvo` para a MF. `pct`: tarifa em %; `frete`: o que a MF paga
 * do frete grátis (só a partir de R$ 79). Abaixo de R$ 79 entra a tarifa fixa; perto do limite, o que der menor preço.
 */
export function precoParaReceber(alvo: number, pct: number, frete: number, fixa: (p: number) => number = tarifaFixa): number {
  if (!(alvo > 0)) return 0;
  const fator = 1 - pct / 100;
  if (!(fator > 0)) return 0;
  // sem frete (abaixo de 79): procura a faixa da tarifa fixa
  let p = alvo / fator;
  for (let i = 0; i < 6; i++) p = (alvo + fixa(p)) / fator;
  let preco = terminarEm90(p);
  for (let i = 0; i < 50 && liquido(preco, pct, frete, fixa) < alvo; i++) preco = terminarEm90(preco + 0.01);
  if (preco < FRETE_GRATIS_DESDE) return preco;
  // passou de 79: o frete grátis entra
  preco = terminarEm90(Math.max(FRETE_GRATIS_DESDE, (alvo + frete) / fator) - 0.0001);
  for (let i = 0; i < 50 && liquido(preco, pct, frete, fixa) < alvo; i++) preco = terminarEm90(preco + 0.01);
  return preco;
}

/** Título do anúncio: até 60 letras, sem cortar palavra no meio nem terminar em "com", "para"… */
export function tituloML(texto: string | null | undefined, limite = 60): string {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= limite) return t;
  const corte = t.slice(0, limite + 1);
  const espaco = corte.lastIndexOf(" ");
  let r = (espaco > limite * 0.6 ? corte.slice(0, espaco) : t.slice(0, limite)).replace(/[\s,;:–-]+$/, "");
  // não termina em palavra solta ("… compatível com")
  for (let i = 0; i < 3; i++) r = r.replace(/\s+(com|de|da|do|das|dos|para|p\/|e|a|o|em|no|na|compat[íi]vel)$/i, "").replace(/[\s,;:–-]+$/, "");
  return r;
}

/** Marca que vai para o Mercado Livre quando o cadastro está sem marca (escolha da usuária em 23/10). */
export const MARCA_PADRAO = "MF Máquinas";

export type ProdutoNovo = {
  sku: string | null; descricao: string; titulo_anuncio?: string | null; marca?: string | null; modelo?: string | null;
  codigo_fabricante?: string | null; codigo_barras?: string | null; gtin_isento?: boolean | null;
  peso_kg?: number | null; altura_cm?: number | null; largura_cm?: number | null; profundidade_cm?: number | null;
};
export type AtributoCategoria = { id: string; name?: string; tags?: Record<string, unknown>; values?: { id: string; name: string }[] };
export type AtributoML = { id: string; value_name?: string; value_id?: string };

const temTexto = (v: unknown) => String(v ?? "").trim() !== "";
const digitosGtin = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Atributos que o ERP sabe preencher; e os obrigatórios da categoria que ficaram faltando (pelo nome). */
export function atributosDoProduto(p: ProdutoNovo, categoria: AtributoCategoria[]): { atributos: AtributoML[]; faltando: string[] } {
  const a: AtributoML[] = [];
  const por = new Map(categoria.map((c) => [c.id, c]));
  const poe = (id: string, valor: unknown) => { if (temTexto(valor) && (por.size === 0 || por.has(id))) a.push({ id, value_name: String(valor).trim().slice(0, 255) }); };
  poe("BRAND", semMyFrost(p.marca) || MARCA_PADRAO);
  poe("MODEL", p.modelo || p.sku);
  poe("PART_NUMBER", p.codigo_fabricante || p.sku);
  poe("SELLER_SKU", p.sku);
  const gtin = digitosGtin(p.codigo_barras);
  if ([8, 12, 13, 14].includes(gtin.length)) poe("GTIN", gtin);
  else {
    const motivo = por.get("EMPTY_GTIN_REASON")?.values?.find((v) => /n[ãa]o (tem|possui)|does not have|sem c[óo]digo/i.test(v.name));
    if (motivo) a.push({ id: "EMPTY_GTIN_REASON", value_id: motivo.id });
  }
  // medidas da embalagem (o Mercado Envios calcula o frete com elas)
  if (Number(p.altura_cm) > 0) poe("SELLER_PACKAGE_HEIGHT", `${Number(p.altura_cm)} cm`);
  if (Number(p.largura_cm) > 0) poe("SELLER_PACKAGE_WIDTH", `${Number(p.largura_cm)} cm`);
  if (Number(p.profundidade_cm) > 0) poe("SELLER_PACKAGE_LENGTH", `${Number(p.profundidade_cm)} cm`);
  if (Number(p.peso_kg) > 0) poe("SELLER_PACKAGE_WEIGHT", `${Math.round(Number(p.peso_kg) * 1000)} g`);
  const preenchidos = new Set(a.map((x) => x.id));
  const faltando = categoria
    .filter((c) => (c.tags?.required || c.tags?.catalog_required) && !c.tags?.read_only && !preenchidos.has(c.id))
    .filter((c) => !(c.id === "GTIN" && preenchidos.has("EMPTY_GTIN_REASON")) && !(c.id === "EMPTY_GTIN_REASON" && preenchidos.has("GTIN")))
    .map((c) => c.name || c.id);
  return { atributos: a, faltando };
}

/** "AxLxP,g" para a consulta do frete; sem as medidas, uma caixa média (o aviso diz que é estimado). */
export function medidasFrete(p: ProdutoNovo): { texto: string; estimado: boolean } {
  const al = Math.ceil(Number(p.altura_cm) || 0), la = Math.ceil(Number(p.largura_cm) || 0), pr = Math.ceil(Number(p.profundidade_cm) || 0);
  const g = Math.round((Number(p.peso_kg) || 0) * 1000);
  const ok = al > 0 && la > 0 && pr > 0 && g > 0;
  return ok ? { texto: `${al}x${la}x${pr},${g}`, estimado: false } : { texto: `${al || 15}x${la || 15}x${pr || 15},${g || 500}`, estimado: true };
}

/**
 * Tira a marca "My Frost" dos textos que vão para os canais (título, descrição): "compatível com máquinas My Frost"
 * vira "compatível com máquinas de sorvete expresso"; o nome solto sai.
 */
export function semMyFrost(texto: string | null | undefined): string {
  let t = String(texto ?? "");
  t = t.replace(/\b(m[aá]quinas?)\s+my\s*frost\b/gi, (_m, maq: string) => `${maq} de sorvete expresso`);
  t = t.replace(/\bmy\s*frost\b/gi, "");
  return t
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/(^|\n)[ \t]*[-–]\s*/g, "$1")
    .replace(/\s*[-–]\s*$/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
