// Ficha técnica organizada por grupo (a parte da máquina em que a peça entra) e por etapa de produção.
// O grupo gravado na linha da ficha vale; sem ele, o ERP sugere: 1º pelos "Cálculo Interno" do Tiny (CI-ELE, CI-REF e
// CI-EST: as peças que eles juntavam), 2º pela categoria e pelo nome da peça.
import type { EtapaProducao } from "./types";

export type GrupoFicha = "estrutura" | "refrigeracao" | "eletrica" | "mecanica" | "cilindro" | "acabamento" | "outros";

export const GRUPOS: { id: GrupoFicha; nome: string; dica: string; barra: string; chip: string; borda: string }[] = [
  { id: "estrutura", nome: "Estrutura", dica: "gabinete, chapas, carenagem, pés", barra: "bg-orange-500", chip: "bg-orange-100 text-orange-800", borda: "border-l-orange-500" },
  { id: "refrigeracao", nome: "Refrigeração", dica: "compressor, condensadora, válvulas, capilar, filtro", barra: "bg-sky-500", chip: "bg-sky-100 text-sky-800", borda: "border-l-sky-500" },
  { id: "eletrica", nome: "Elétrica", dica: "placa, CLP, relés, contatores, cabos, sensores", barra: "bg-amber-500", chip: "bg-amber-100 text-amber-800", borda: "border-l-amber-500" },
  { id: "mecanica", nome: "Mecânica", dica: "motor, redutor, polias, correias, rolamentos, eixos", barra: "bg-indigo-500", chip: "bg-indigo-100 text-indigo-800", borda: "border-l-indigo-500" },
  { id: "cilindro", nome: "Cilindro e pás", dica: "cilindro, pás, torneiras, bicos, vedações", barra: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800", borda: "border-l-emerald-500" },
  { id: "acabamento", nome: "Acabamento e embalagem", dica: "adesivos, manual, caixa, plástico", barra: "bg-purple-500", chip: "bg-purple-100 text-purple-800", borda: "border-l-purple-500" },
  { id: "outros", nome: "Outros", dica: "o que não se encaixa acima", barra: "bg-slate-400", chip: "bg-slate-100 text-slate-700", borda: "border-l-slate-400" },
];
export const ehGrupo = (v: unknown): v is GrupoFicha => GRUPOS.some((g) => g.id === v);

const sem = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ordem importa: o primeiro que casar vale (ex.: "motor ventilador do condensador" é refrigeração, não mecânica;
// "CLP do cilindro" é elétrica)
const REGRAS: [GrupoFicha, RegExp][] = [
  ["acabamento", /\b(adesivo|etiqueta|manual|embalagem|caixa de papel|papelao|plastico bolha|fita adesiva|saco plastico|logo)\b/],
  ["refrigeracao", /\b(compressor|condensador|condensadora|evaporador|valvula|capilar|filtro secador|gas refrigerante|r ?404|r ?22|r ?134|r ?290|tubo de cobre|cobre|pressostato|solenoide|ventilador|exaustor|schrader|serpentina)\b/],
  ["eletrica", /\b(rele|contator|disjuntor|fio|cabo|placa|clp|sensor|fonte|botao|chave seletora|termostato|display|resistencia|bobina|capacitor|transformador|led|fusivel|borne|tomada|plug|chicote|inversor|controlador|timer|temporizador|eletric[ao])\b/],
  ["cilindro", /\b(cilindro|pa batedora|pa agitadora|pa\b|pas\b|batedor|torneira|bico|vedacao|o-?ring|anel|sanfona|alavanca|dosador|ponteira|aletas|gaxeta|retentor do cilindro)\b/],
  ["mecanica", /\b(motor|redutor|polia|correia|rolamento|eixo|engrenagem|mancal|acoplamento|cubo|mecanica|bucha|parafuso sem fim|coroa)\b/],
  ["estrutura", /\b(estrutura|chapa|gabinete|lateral|tampa|frontal|carenagem|rodizio|pe nivelador|pes\b|suporte|base|painel inox|bandeja|grade|porta|dobradica|perfil)\b/],
];

/** Grupo sugerido pela categoria e pelo nome da peça. */
export function grupoPorNome(p: { descricao?: string | null; categoria?: string | null }): GrupoFicha {
  const cat = sem(p.categoria);
  if (/eletric/.test(cat)) return "eletrica";
  if (/refriger/.test(cat)) return "refrigeracao";
  if (/mecanic/.test(cat)) return "mecanica";
  if (/vedante|oring/.test(cat)) return "cilindro";
  const d = ` ${sem(p.descricao).replace(/[^a-z0-9]+/g, " ")} `;
  for (const [g, re] of REGRAS) if (re.test(d)) return g;
  return "outros";
}

/**
 * Peça → grupo pelos "Cálculo Interno" do Tiny: CI-ELE (elétrica), CI-REF (refrigeração), CI-EST (estrutura).
 * `kits` = composição (kit_id → componente_id); `skuDe` = SKU de cada kit.
 */
export function gruposDosCalculosInternos(kits: { kit_id: string; componente_id: string }[], skuDe: (id: string) => string | null | undefined) {
  const m = new Map<string, GrupoFicha>();
  const PREFIXO: [string, GrupoFicha][] = [["CI-ELE", "eletrica"], ["CI-REF", "refrigeracao"], ["CI-EST", "estrutura"]];
  for (const k of kits) {
    const sku = (skuDe(k.kit_id) ?? "").toUpperCase();
    const g = PREFIXO.find(([p]) => sku.startsWith(p))?.[1];
    if (g && !m.has(k.componente_id)) m.set(k.componente_id, g);
  }
  return m;
}

/** Grupo da linha: o gravado; senão o dos Cálculos Internos; senão pelo nome. */
export function grupoDaLinha(linha: { grupo?: string | null }, peca: { id: string; descricao?: string | null; categoria?: string | null } | undefined, ci: Map<string, GrupoFicha>): GrupoFicha {
  if (ehGrupo(linha.grupo)) return linha.grupo;
  if (peca && ci.has(peca.id)) return ci.get(peca.id)!;
  return grupoPorNome(peca ?? {});
}

/** Custo por grupo (mantém a ordem de GRUPOS e só os que têm itens). */
export function custoPorGrupo(linhas: { grupo: GrupoFicha; custo: number }[]) {
  const total = linhas.reduce((s, l) => s + l.custo, 0);
  return GRUPOS.map((g) => {
    const custo = linhas.filter((l) => l.grupo === g.id).reduce((s, l) => s + l.custo, 0);
    const itens = linhas.filter((l) => l.grupo === g.id).length;
    return { ...g, custo, itens, pct: total ? custo / total : 0 };
  }).filter((g) => g.itens > 0);
}

export const ORIGENS = [
  { id: "comprado", nome: "Comprado pronto", dica: "vem do fornecedor e entra direto na montagem" },
  { id: "fabricado", nome: "Fabricado aqui", dica: "tem ficha e OP própria na MF" },
  { id: "terceirizado", nome: "Fabricado com etapa em terceiro", dica: "parte do processo é feita fora (ex.: injeção da pá) e volta para o acabamento" },
] as const;
export type OrigemProducao = (typeof ORIGENS)[number]["id"];

/** Etapas gravadas (com detalhe) ou, nas máquinas antigas, montadas a partir dos nomes. */
export function etapasDoProduto(p: { etapas?: EtapaProducao[] | null; etapas_producao?: string[] | null }): EtapaProducao[] {
  if (Array.isArray(p.etapas) && p.etapas.length) return p.etapas.map((e) => ({ nome: String(e.nome ?? ""), externa: !!e.externa, quem: e.quem ?? null, dias: e.dias ?? null }));
  return (p.etapas_producao ?? []).filter(Boolean).map((nome) => ({ nome, externa: false, quem: null, dias: null }));
}

/** Nome que vai para a lista de conferência da OP (a etapa externa diz quem faz). */
export const nomeEtapaOp = (e: EtapaProducao) =>
  e.externa ? `${e.nome.trim()} (fora${e.quem?.trim() ? `: ${e.quem.trim()}` : ""})` : e.nome.trim();
