// Cruzamento livre (tipo tabela dinâmica): a pessoa escolhe o que vai nas linhas, nas colunas e o valor de cada célula.
// Funciona com qualquer lista de fatos (itens de venda, contas pagas e recebidas…): cada fato traz os números que somam
// (receita, custo, valor…) e um id para contar (a venda, a conta). Só cálculo, sem tela.

/** O que dá para pôr nas linhas ou nas colunas: o texto de cada fato (ex.: o mês, o produto, o vendedor). */
export type Dimensao<F> = { id: string; nome: string; de: (f: F) => string; ordem?: "texto" | "valor" };

/** O que vai na célula: a partir das somas e da contagem do grupo. */
export type Medida = { id: string; nome: string; formato: "brl" | "num" | "pct"; de: (a: Acumulado) => number };

export type Acumulado = { somas: Record<string, number>; ids: Set<string> };

export type Cruzamento = {
  linhas: string[];
  colunas: string[];
  valor: (linha: string, coluna: string) => number | null;
  totalLinha: (linha: string) => number;
  totalColuna: (coluna: string) => number;
  total: number;
};

const SEP = "\u0001";
const vazio = (): Acumulado => ({ somas: {}, ids: new Set() });
function somar(a: Acumulado, numeros: Record<string, number>, id: string) {
  for (const [k, v] of Object.entries(numeros)) a.somas[k] = (a.somas[k] ?? 0) + (Number(v) || 0);
  a.ids.add(id);
}

/** Uma só coluna quando não há dimensão de coluna. */
export const SEM_COLUNA = "Total";

export function cruzar<F>(fatos: F[], o: {
  linha: Dimensao<F>; coluna: Dimensao<F> | null; medida: Medida;
  numeros: (f: F) => Record<string, number>; id: (f: F) => string;
}): Cruzamento {
  const celulas = new Map<string, Acumulado>();
  const porLinha = new Map<string, Acumulado>();
  const porColuna = new Map<string, Acumulado>();
  const geral = vazio();
  for (const f of fatos) {
    const l = o.linha.de(f) || "(sem)";
    const c = o.coluna ? o.coluna.de(f) || "(sem)" : SEM_COLUNA;
    const n = o.numeros(f);
    const id = o.id(f);
    const chave = l + SEP + c;
    for (const [m, k] of [[celulas, chave], [porLinha, l], [porColuna, c]] as const) {
      let a = m.get(k);
      if (!a) { a = vazio(); m.set(k, a); }
      somar(a, n, id);
    }
    somar(geral, n, id);
  }
  const med = (a: Acumulado | undefined) => (a ? o.medida.de(a) : 0);
  const ordenar = (chaves: string[], dim: Dimensao<F> | null, mapa: Map<string, Acumulado>) =>
    !dim || dim.ordem === "texto"
      ? chaves.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
      : chaves.sort((a, b) => med(mapa.get(b)) - med(mapa.get(a)) || a.localeCompare(b, "pt-BR"));
  return {
    linhas: ordenar([...porLinha.keys()], o.linha, porLinha),
    colunas: ordenar([...porColuna.keys()], o.coluna, porColuna),
    valor: (l, c) => { const a = celulas.get(l + SEP + c); return a ? o.medida.de(a) : null; },
    totalLinha: (l) => med(porLinha.get(l)),
    totalColuna: (c) => med(porColuna.get(c)),
    total: o.medida.de(geral),
  };
}

/** A tabela como linhas de planilha: a 1ª coluna é a linha, depois uma coluna por coluna escolhida e o total. */
export function linhasPlanilha(c: Cruzamento, nomeLinha: string): Record<string, unknown>[] {
  const r2 = (v: number | null) => (v === null ? "" : Math.round(v * 100) / 100);
  const comTotal = c.colunas.length > 1 || c.colunas[0] !== SEM_COLUNA;
  const linhas = c.linhas.map((l) => ({
    [nomeLinha]: l,
    ...Object.fromEntries(c.colunas.map((col) => [col, r2(c.valor(l, col))])),
    ...(comTotal ? { Total: r2(c.totalLinha(l)) } : {}),
  }));
  linhas.push({
    [nomeLinha]: "Total",
    ...Object.fromEntries(c.colunas.map((col) => [col, r2(c.totalColuna(col))])),
    ...(comTotal ? { Total: r2(c.total) } : {}),
  });
  return linhas;
}
