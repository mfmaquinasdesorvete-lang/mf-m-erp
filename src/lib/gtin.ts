// Códigos de barras EAN / GTIN: dígito verificador, país do prefixo (GS1), faixas de uso interno, o que está errado no
// cadastro (inventado, repetido, inválido) e geração de códigos novos pela faixa da empresa na GS1 Brasil.

export const soDigitos = (v?: string | null) => String(v ?? "").replace(/\D/g, "");

/** Dígito verificador do GTIN (pesos 3 e 1 da direita para a esquerda), para o código sem o último dígito. */
export function dvGtin(semDv: string): number {
  const soma = soDigitos(semDv).split("").reverse().reduce((s, x, i) => s + Number(x) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10;
}

export function gtinValido(codigo?: string | null): boolean {
  const d = soDigitos(codigo);
  if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d)) return false;
  return dvGtin(d.slice(0, -1)) === Number(d[d.length - 1]);
}

/** Prefixos da GS1 (3 primeiros dígitos do GTIN-13): país da empresa que licenciou o código ou faixa especial. */
const FAIXAS: [number, number, string][] = [
  [0, 19, "EUA/Canadá"], [20, 29, "uso interno"], [30, 39, "EUA"], [40, 49, "uso interno"], [50, 59, "cupom"], [60, 139, "EUA/Canadá"],
  [200, 299, "uso interno"], [300, 379, "França"], [380, 380, "Bulgária"], [383, 383, "Eslovênia"], [385, 385, "Croácia"],
  [400, 440, "Alemanha"], [450, 459, "Japão"], [460, 469, "Rússia"], [471, 471, "Taiwan"], [489, 489, "Hong Kong"], [490, 499, "Japão"],
  [500, 509, "Reino Unido"], [520, 521, "Grécia"], [539, 539, "Irlanda"], [540, 549, "Bélgica/Luxemburgo"], [560, 560, "Portugal"],
  [570, 579, "Dinamarca"], [590, 590, "Polônia"], [594, 594, "Romênia"], [599, 599, "Hungria"], [600, 601, "África do Sul"],
  [640, 649, "Finlândia"], [690, 699, "China"], [700, 709, "Noruega"], [729, 729, "Israel"], [730, 739, "Suécia"], [750, 750, "México"],
  [754, 755, "Canadá"], [759, 759, "Venezuela"], [760, 769, "Suíça"], [770, 771, "Colômbia"], [773, 773, "Uruguai"], [775, 775, "Peru"],
  [777, 777, "Bolívia"], [778, 779, "Argentina"], [780, 780, "Chile"], [784, 784, "Paraguai"], [786, 786, "Equador"], [789, 790, "Brasil"],
  [800, 839, "Itália"], [840, 849, "Espanha"], [858, 858, "Eslováquia"], [859, 859, "Rep. Tcheca"], [868, 869, "Turquia"],
  [870, 879, "Holanda"], [880, 880, "Coreia do Sul"], [885, 885, "Tailândia"], [888, 888, "Singapura"], [890, 890, "Índia"],
  [893, 893, "Vietnã"], [899, 899, "Indonésia"], [900, 919, "Áustria"], [930, 939, "Austrália"], [940, 949, "Nova Zelândia"],
  [955, 955, "Malásia"], [977, 977, "revista (ISSN)"], [978, 979, "livro (ISBN)"], [980, 999, "cupom"],
];

export type AnaliseGtin = {
  digitos: string;
  valido: boolean;
  /** GTIN-8, GTIN-12 (UPC), GTIN-13 (EAN) ou GTIN-14 (caixa) */
  formato?: string;
  prefixo?: string;
  pais?: string;
  brasil: boolean;
  /** faixa só para uso dentro da empresa (etiqueta de loja, balança): marketplace e NF-e não aceitam */
  interno: boolean;
  erro?: string;
};

export function analisarGtin(codigo?: string | null): AnaliseGtin {
  const d = soDigitos(codigo);
  const base = { digitos: d, valido: false, brasil: false, interno: false };
  if (!d) return { ...base, erro: "sem código" };
  if (![8, 12, 13, 14].includes(d.length)) return { ...base, erro: `tem ${d.length} dígitos (o EAN tem 13; também valem 8, 12 ou 14)` };
  if (/^0+$/.test(d)) return { ...base, erro: "só zeros" };
  const formato = d.length === 8 ? "GTIN-8" : d.length === 12 ? "GTIN-12 (UPC)" : d.length === 13 ? "GTIN-13 (EAN)" : "GTIN-14 (caixa)";
  if (dvGtin(d.slice(0, -1)) !== Number(d[d.length - 1])) return { ...base, formato, erro: "o último dígito (verificador) não confere: código digitado errado ou inventado" };
  // GTIN-14: o 1º dígito é o da embalagem; o prefixo da empresa vem depois. GTIN-12 e GTIN-8 se leem como GTIN-13 com zero na frente.
  const treze = d.length === 14 ? d.slice(1) : d.length === 8 ? d : d.padStart(13, "0");
  const prefixo = treze.slice(0, 3);
  const n = Number(prefixo);
  const pais = d.length === 8 && /^[02]/.test(d) ? "uso interno" : FAIXAS.find(([a, b]) => n >= a && n <= b)?.[2] ?? "país não identificado";
  const interno = pais === "uso interno" || (d.length === 14 && d[0] === "9");
  return { digitos: d, valido: true, formato, prefixo, pais, brasil: pais === "Brasil", interno };
}

/** Faixa da empresa na GS1 Brasil: 789 ou 790 seguido do número da empresa (7 a 10 dígitos no total). */
export const prefixoGs1Valido = (p?: string | null) => /^(789|790)\d{4,7}$/.test(soDigitos(p));

/**
 * Próximos GTIN-13 livres da faixa: prefixo + número do item (sequencial) + dígito verificador. Não reaproveita
 * nenhum código já usado (a GS1 não deixa reusar código de produto, nem de produto inativo).
 */
export function proximosGtins(prefixo: string, usados: Iterable<string>, quantos: number): string[] {
  const p = soDigitos(prefixo);
  if (!prefixoGs1Valido(p) || quantos <= 0) return [];
  const tamItem = 12 - p.length;
  const ocupados = new Set<number>();
  for (const u of usados) {
    const d = soDigitos(u);
    const treze = d.length === 14 ? d.slice(1) : d;
    if (treze.length === 13 && treze.startsWith(p)) ocupados.add(Number(treze.slice(p.length, 12)));
  }
  const fim = 10 ** tamItem;
  const novos: string[] = [];
  // o item 0 fica de fora (muita empresa usa para teste); começa no 1
  for (let i = 1; i < fim && novos.length < quantos; i++) {
    if (ocupados.has(i)) continue;
    const semDv = p + String(i).padStart(tamItem, "0");
    novos.push(semDv + dvGtin(semDv));
  }
  return novos;
}

/** Quantos códigos a faixa comporta (prefixo de 7 dígitos = 100 mil itens; de 9 dígitos = mil). */
export const capacidadeFaixa = (prefixo?: string | null) => (prefixoGs1Valido(prefixo) ? 10 ** (12 - soDigitos(prefixo).length) - 1 : 0);

export type ProdutoEan = {
  id: string; descricao: string; sku?: string | null; tipo?: string | null; marca?: string | null; codigo_barras?: string | null;
  gtin_isento?: boolean | null; ativo?: boolean | null; unificado_em?: string | null; codigos_alternativos?: string | null;
};

export type Problema = { nivel: "erro" | "alerta"; texto: string };
export type SituacaoEan = "corrigir" | "certo" | "sem_codigo" | "sem_gtin";

/** Marca própria: a mais comum entre as máquinas (os produtos que a empresa fabrica). */
export function marcaPropria(produtos: ProdutoEan[]): string | null {
  const conta = new Map<string, number>();
  for (const p of produtos) if (p.tipo === "maquina" && p.marca?.trim()) conta.set(p.marca.trim().toLowerCase(), (conta.get(p.marca.trim().toLowerCase()) ?? 0) + 1);
  return [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Produto da própria empresa (fabricado ou com a marca dela): o código certo é o da faixa dela na GS1 Brasil. */
export const ehProprio = (p: ProdutoEan, marca: string | null) => p.tipo === "maquina" || (!!marca && p.marca?.trim().toLowerCase() === marca);

export type ContextoEan = { repetidos: Map<string, ProdutoEan[]>; marca: string | null; prefixoEmpresa?: string | null };

export function contextoEan(produtos: ProdutoEan[], prefixoEmpresa?: string | null): ContextoEan {
  const repetidos = new Map<string, ProdutoEan[]>();
  for (const p of produtos) {
    if (p.ativo === false || p.unificado_em) continue;
    const d = soDigitos(p.codigo_barras);
    if (d) repetidos.set(d, [...(repetidos.get(d) ?? []), p]);
  }
  return { repetidos, marca: marcaPropria(produtos), prefixoEmpresa: soDigitos(prefixoEmpresa) || null };
}

/** O que está errado no código de barras do produto (vazio = parece certo). */
export function problemasEan(p: ProdutoEan, ctx: ContextoEan): Problema[] {
  const d = soDigitos(p.codigo_barras);
  if (!d) return [];
  const a = analisarGtin(d);
  const lista: Problema[] = [];
  if (!a.valido) return [{ nivel: "erro", texto: `não é um EAN válido: ${a.erro}` }];
  const outros = (ctx.repetidos.get(d) ?? []).filter((o) => o.id !== p.id);
  if (outros.length) lista.push({ nivel: "erro", texto: `o mesmo código está em ${outros.length === 1 ? "outro produto" : `outros ${outros.length} produtos`}: ${outros.slice(0, 3).map((o) => o.sku || o.descricao).join(", ")}. Cada produto tem o seu` });
  if (a.interno) lista.push({ nivel: "erro", texto: "faixa de uso interno (só vale dentro da empresa): marketplace e NF-e não aceitam" });
  else if (ehProprio(p, ctx.marca)) {
    if (!a.brasil) lista.push({ nivel: "alerta", texto: `o prefixo ${a.prefixo} é da GS1 ${a.pais}: produto da marca da empresa teria código da GS1 Brasil (789 ou 790). Se não veio do fabricante, é inventado` });
    else if (ctx.prefixoEmpresa && !d.replace(/^0/, "").startsWith(ctx.prefixoEmpresa)) lista.push({ nivel: "alerta", texto: `não é da faixa da empresa na GS1 (${ctx.prefixoEmpresa}…): confira se é o código do fabricante da peça` });
  }
  if (p.gtin_isento) lista.push({ nivel: "alerta", texto: "está marcado \"Sem GTIN\" mas tem código: escolha um dos dois" });
  return lista;
}

export function situacaoEan(p: ProdutoEan, ctx: ContextoEan): SituacaoEan {
  if (problemasEan(p, ctx).length) return "corrigir";
  if (soDigitos(p.codigo_barras)) return "certo";
  return p.gtin_isento ? "sem_gtin" : "sem_codigo";
}

/** O código digitado pode ir para o produto? (null = pode) */
export function erroCodigoNovo(p: Pick<ProdutoEan, "id">, codigo: string, ctx: ContextoEan): string | null {
  const a = analisarGtin(codigo);
  if (!a.valido) return a.erro ?? "código inválido";
  if (a.interno) return "faixa de uso interno: marketplace e NF-e não aceitam";
  const outro = (ctx.repetidos.get(a.digitos) ?? []).find((o) => o.id !== p.id);
  if (outro) return `já está em "${outro.descricao}"${outro.sku ? ` (${outro.sku})` : ""}`;
  return null;
}

/** Texto curto do país para mostrar ao lado do código. */
export function origemEan(codigo?: string | null) {
  const a = analisarGtin(codigo);
  return a.valido ? `${a.pais}${a.prefixo ? ` (${a.prefixo})` : ""}` : "";
}
