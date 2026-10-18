// Arrastar para ordenar (ficha técnica, etapas, manuais): as contas sem tela, para testar.

/** Tira o item da posição `de` e põe antes (ou depois) do item que estava na posição `alvo`. */
export function moverNaLista<T>(lista: T[], de: number, alvo: number, depois = false): T[] {
  if (de < 0 || de >= lista.length || alvo < 0 || alvo >= lista.length || de === alvo) return lista;
  const l = [...lista];
  const [x] = l.splice(de, 1);
  // a posição do alvo depois de tirar o item
  const i = (alvo > de ? alvo - 1 : alvo) + (depois ? 1 : 0);
  l.splice(i, 0, x);
  return l;
}

/** Ordena pela coluna `ordem` (vazio vai para o fim) sem mudar a ordem de quem empata. */
export function pelaOrdem<T extends { ordem?: number | null }>(lista: T[]): T[] {
  return lista.map((x, i) => ({ x, i }))
    .sort((a, b) => (a.x.ordem ?? Infinity) - (b.x.ordem ?? Infinity) || a.i - b.i)
    .map((p) => p.x);
}
