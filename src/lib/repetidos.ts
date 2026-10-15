// Cadastros repetidos de fornecedores e transportadoras (filiais da mesma marca). Puro, testado em __tests__/repetidos.test.ts.

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Repetidos prováveis entre as filiais: mesma cidade/UF e um deles sem CNPJ (cadastrado à mão antes da nota chegar). */
export function repetidosProvaveis<T extends { municipio?: string | null; uf?: string | null; cnpj?: string | null }>(lista: T[]): T[][] {
  const grupos = new Map<string, T[]>();
  for (const o of lista) {
    if (!o.municipio || !o.uf) continue;
    const k = `${sem(o.municipio)}|${o.uf.toUpperCase()}`;
    grupos.set(k, [...(grupos.get(k) ?? []), o]);
  }
  return [...grupos.values()].filter((g) => g.length > 1 && g.some((o) => !o.cnpj) && new Set(g.filter((o) => o.cnpj).map((o) => o.cnpj)).size <= 1);
}

