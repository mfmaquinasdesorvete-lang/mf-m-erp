// Ficha de montagem da OP: uma folha por máquina (por nº de série), com as peças da ficha técnica para conferir,
// as etapas para o montador marcar e assinar, e o campo do teste no giga. Sai impressa e vai junto com a máquina.

/** Nºs de série digitados na OP ("031023315, 031023316" ou um por linha), sem repetir. */
export function seriesDaOp(texto: string | null | undefined): string[] {
  return [...new Set((texto ?? "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean))];
}

/** Folhas da ficha: uma por nº de série; faltando série, completa com folhas em branco até a quantidade da OP. */
export function folhasDaFicha(texto: string | null | undefined, quantidade: number | null | undefined): (string | null)[] {
  const series = seriesDaOp(texto);
  const n = Math.max(series.length, Math.min(Math.max(Math.floor(Number(quantidade) || 1), 1), 50));
  return Array.from({ length: n }, (_, i) => series[i] ?? null);
}

export type PecaFicha = { descricao: string; codigo?: string | null; quantidade: number; unidade?: string | null };

/** Peças da ficha técnica (primeiro nível) de uma máquina, em ordem alfabética, sem as de quantidade zero. */
export function pecasDaFicha(
  fichas: { produto_id: string; componente_id: string; quantidade: number }[],
  produtos: { id: string; descricao: string; sku?: string | null; unidade?: string | null }[],
  produtoId: string,
): PecaFicha[] {
  return fichas
    .filter((f) => f.produto_id === produtoId && Number(f.quantidade) > 0)
    .map((f) => {
      const p = produtos.find((x) => x.id === f.componente_id);
      return { descricao: p?.descricao ?? "Peça sem cadastro", codigo: p?.sku ?? null, quantidade: Number(f.quantidade), unidade: p?.unidade ?? null };
    })
    .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
}
