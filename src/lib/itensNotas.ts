// Conferir itens das notas de fornecedor: situação de cada item, sugestão de produto pelo nome e a unidade do
// ERP a partir da unidade da nota. Arquivo puro (testado em __tests__/itensNotas.test.ts).

export type ItemNota = {
  fornecedor_id: string; fornecedor: string | null; fornecedor_cnpj: string | null; codigo: string; descricao: string | null;
  ncm: string | null; ean: string | null; unidade: string | null; notas: number; quantidade: number | null;
  ultimo_valor: number | null; ultima_data: string | null; primeira_data: string | null;
  produto_id: string | null; fator: number | null; sem_estoque: TipoSemEstoque | null; sugestao_id: string | null; sugestao_motivo: string | null;
};
export type TipoSemEstoque = "consumo" | "ativo" | "servico" | "outro";
export type SituacaoItem = "ligado" | "sem_estoque" | "sugestao" | "pendente";

export const NOME_SEM_ESTOQUE: Record<TipoSemEstoque, string> = {
  consumo: "Uso e consumo", ativo: "Bem da empresa (ativo)", servico: "Serviço", outro: "Outro (não é de estoque)",
};

export const chaveItem = (i: Pick<ItemNota, "fornecedor_id" | "codigo">) => `${i.fornecedor_id}|${i.codigo}`;

export function situacaoItem(i: Pick<ItemNota, "produto_id" | "sem_estoque" | "sugestao_id">): SituacaoItem {
  if (i.produto_id) return "ligado";
  if (i.sem_estoque) return "sem_estoque";
  return i.sugestao_id ? "sugestao" : "pendente";
}

const VAZIAS = new Set(["para", "com", "sem", "de", "da", "do", "das", "dos", "em", "e", "a", "o", "un", "und", "unid", "pc", "pcs", "peca", "pecas", "cx", "kit",
  "tipo", "mod", "modelo", "ref", "cod", "marca", "nova", "novo", "original", "maquina", "maquinas", "sorvete"]);

/** Palavras que dizem o que é o item (sem acento, sem as genéricas); códigos com número ficam inteiros. */
export function palavrasItem(texto: string | null | undefined): string[] {
  const t = String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const brutas = t.split(/[^a-z0-9/.,-]+/).flatMap((p) => p.split(/(?<=[a-z])[-.](?=[a-z])/)).map((p) => p.replace(/^[-.,/]+|[-.,/]+$/g, ""));
  return [...new Set(brutas.filter((p) => p && !VAZIAS.has(p) && (p.length >= 3 || /\d/.test(p))))];
}

// medida (220v, 1/2cv, 12mm, 3/8…) não identifica a peça; código com letra e número (nj2212gj, 2rs) ou número longo (6204) identifica
const MEDIDA = /^\d+([.,/]\d+)?(v|vac|vdc|w|kw|a|ah|mm|cm|m|pol|hp|cv|kg|g|l|ml|bar|psi|rpm|hz|uf)?$/;
function temNumero(p: string) {
  if (/^\d{4,}$/.test(p)) return true;
  return !MEDIDA.test(p) && /\d/.test(p) && p.length >= 4;
}

/**
 * Produtos parecidos pelo nome: palavras em comum (Jaccard) e bônus forte quando um código com número
 * (ex.: 6204, NJ2212GJ, 3/8) aparece nos dois. Devolve os melhores com nota de 0 a 1.
 */
export function sugerirPorNome<P extends { id: string; descricao: string; sku?: string | null; codigo_fabricante?: string | null }>(
  descricao: string | null | undefined, produtos: P[], limite = 3,
): { produto: P; nota: number }[] {
  const a = palavrasItem(descricao);
  if (!a.length) return [];
  const conjA = new Set(a);
  const notas = produtos.map((p) => {
    const b = palavrasItem([p.descricao, p.codigo_fabricante].filter(Boolean).join(" "));
    if (!b.length) return { produto: p, nota: 0 };
    const comuns = b.filter((x) => conjA.has(x));
    const uniao = new Set([...a, ...b]).size;
    let nota = comuns.length / uniao;
    if (comuns.some(temNumero)) nota = Math.min(1, nota + 0.35);
    if (comuns.length < 2 && !comuns.some(temNumero)) nota = Math.min(nota, 0.2);
    return { produto: p, nota };
  });
  return notas.filter((x) => x.nota >= 0.3).sort((x, y) => y.nota - x.nota).slice(0, limite);
}

const UNIDADES_NOTA: Record<string, string> = {
  UN: "UN", UND: "UN", UNID: "UN", UNIDADE: "UN", UNI: "UN", "UN.": "UN", U: "UN",
  PC: "PC", "PÇ": "PC", PCS: "PC", PECA: "PC", "PEÇA": "PC", PEC: "PC",
  KG: "KG", G: "G", GR: "G", MT: "MT", M: "MT", METRO: "MT", M2: "M2", M3: "M3", L: "L", LT: "L", LITRO: "L", ML: "ML",
  CX: "CX", CAIXA: "CX", PCT: "PCT", PACOTE: "PCT", PT: "PCT", FD: "FD", RL: "RL", ROLO: "RL", BR: "BR", BARRA: "BR",
  GL: "GL", BD: "BD", CJ: "CJ", CONJ: "CJ", KIT: "KIT", PAR: "PAR", JG: "JG", JOGO: "JG",
};

/** Unidade do cadastro do ERP a partir da unidade da nota (UNID → UN, PÇ → PC, LT → L…); desconhecida vira UN. */
export const unidadeDoErp = (u: string | null | undefined) => UNIDADES_NOTA[String(u ?? "").trim().toUpperCase()] ?? "UN";

/** Unidade de embalagem (caixa, pacote, rolo…): aí costuma precisar de fator (ex.: caixa com 10). */
export const unidadeDeEmbalagem = (u: string | null | undefined) => ["CX", "PCT", "FD", "RL", "JG", "KIT", "CJ"].includes(unidadeDoErp(u));

/** Produto sem custo: o item de nota de fornecedor que mais parece ser ele (código do fabricante igual vale 1;
 *  senão pela descrição). Itens já ligados a outro produto ficam de fora. Custo = último valor ÷ fator. */
export function sugestaoCusto(
  produto: { id: string; descricao: string; codigo_fabricante?: string | null },
  itens: ItemNota[],
): { item: ItemNota; nota: number; custo: number } | null {
  const livres = itens.filter((i) => Number(i.ultimo_valor) > 0 && (!i.produto_id || i.produto_id === produto.id));
  const cod = String(produto.codigo_fabricante ?? "").trim().toUpperCase();
  const exato = cod ? livres.find((i) => i.codigo.trim().toUpperCase() === cod) : undefined;
  const custo = (i: ItemNota) => Math.round((Number(i.ultimo_valor) / (Number(i.fator) || 1)) * 100) / 100;
  if (exato) return { item: exato, nota: 1, custo: custo(exato) };
  const [melhor] = sugerirPorNome(produto.descricao, livres.map((i) => ({ id: `${i.fornecedor_id}|${i.codigo}`, descricao: i.descricao ?? "", codigo_fabricante: i.codigo, i })), 1);
  return melhor && melhor.nota >= 0.45 ? { item: melhor.produto.i, nota: melhor.nota, custo: custo(melhor.produto.i) } : null;
}
