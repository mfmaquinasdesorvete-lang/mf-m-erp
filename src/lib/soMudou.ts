/**
 * Campos que a pessoa mudou no formulário (comparando com o registro como estava ao abrir), mais o id.
 * Gravar só isso evita apagar o que outra pessoa mudou nesse meio-tempo (um marcador novo, a unificação do cadastro).
 * Devolve null quando não mudou nada.
 */
export function soMudou(depois: Record<string, unknown>, antes: Record<string, unknown>): Record<string, unknown> | null {
  const igual = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const mudou = Object.keys(depois).filter((k) => k !== "id" && !igual(depois[k], antes[k]));
  if (!mudou.length) return null;
  return Object.fromEntries([["id", depois.id], ...mudou.map((k) => [k, depois[k]])]);
}
