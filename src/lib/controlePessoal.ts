// Controle sem cobrança do painel pessoal: valores que a dona só quer acompanhar (ex.: dinheiro emprestado a alguém
// da família) e não vai cobrar. Ficam fora das entradas, saídas e saldos; o cartão soma por pessoa os que estão abertos.

export type ItemControle = {
  id: string; pessoa: string; descricao: string; valor: number; data: string | null; origem: string | null; encerrado: boolean;
};
export type GrupoControle = { pessoa: string; total: number; itens: ItemControle[]; encerrados: ItemControle[] };

/** Por pessoa, com o total dos abertos; a pessoa com mais em aberto primeiro. */
export function controlePorPessoa(itens: ItemControle[]): GrupoControle[] {
  const por = new Map<string, GrupoControle>();
  for (const i of itens) {
    const chave = i.pessoa.trim();
    const g = por.get(chave) ?? { pessoa: chave, total: 0, itens: [], encerrados: [] };
    if (i.encerrado) g.encerrados.push(i);
    else { g.itens.push(i); g.total = Math.round((g.total + Number(i.valor)) * 100) / 100; }
    por.set(chave, g);
  }
  const porData = (a: ItemControle, b: ItemControle) => (b.data ?? "").localeCompare(a.data ?? "");
  return [...por.values()].map((g) => ({ ...g, itens: g.itens.sort(porData), encerrados: g.encerrados.sort(porData) }))
    .sort((a, b) => b.total - a.total || a.pessoa.localeCompare(b.pessoa));
}
