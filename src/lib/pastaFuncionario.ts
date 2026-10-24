// Divisões da pasta de documentos de cada funcionário (coluna documentos.pasta).

export const PASTAS = [
  { value: "contrato", label: "Contrato", dica: "Contrato de trabalho, aditivos, ficha de registro" },
  { value: "exames", label: "Exames", dica: "ASO de admissão, periódico, demissional" },
  { value: "ferias", label: "Férias", dica: "Aviso e recibo de férias" },
  { value: "holerites", label: "Holerites", dica: "Recibos de pagamento do mês" },
  { value: "atestados", label: "Atestados", dica: "Atestados médicos e declarações" },
  { value: "outros", label: "Outros", dica: "Documentos pessoais, certificados e o que mais precisar" },
] as const;
export type Pasta = (typeof PASTAS)[number]["value"];

/** Divisão do anexo; o que veio sem divisão (os de antes da pasta) ou com uma desconhecida cai em "Outros". */
export const pastaDo = (d: { pasta?: string | null }): Pasta =>
  (PASTAS.find((p) => p.value === d.pasta)?.value ?? "outros");

/** Quantos documentos cada pessoa tem em cada divisão. */
export function contarPorPasta(docs: { entidade_id: string | null; pasta?: string | null }[]) {
  const m = new Map<string, Partial<Record<Pasta, number>>>();
  for (const d of docs) {
    if (!d.entidade_id) continue;
    const c = m.get(d.entidade_id) ?? {};
    const p = pastaDo(d);
    c[p] = (c[p] ?? 0) + 1;
    m.set(d.entidade_id, c);
  }
  return m;
}
