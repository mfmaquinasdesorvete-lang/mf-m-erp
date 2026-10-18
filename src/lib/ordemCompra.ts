// OC - Ordem de Compra como no Tiny: totais (produtos, IPI, ICMS ST, frete, outras despesas e desconto) e parcelas.
// As mesmas contas do banco (public.pedido_compra_total e receber_pedido_compra), para a tela mostrar o que vai ser gravado.

export type ItemOc = { quantidade: number; custo_unitario: number; ipi_aliquota?: number | null; icms_st_valor?: number | null };
export type ParcelaOc = { vencimento: string; valor: number; observacao?: string | null };
export type TotaisOc = { produtos: number; ipi: number; st: number; frete: number; outras: number; desconto: number; total: number };

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Total da OC: produtos + IPI + ICMS ST + frete + outras despesas − desconto (nunca negativo). */
export function totaisOc(itens: ItemOc[], c: { frete?: number | null; outras_despesas?: number | null; desconto?: number | null }): TotaisOc {
  let produtos = 0, ipi = 0, st = 0;
  for (const i of itens) {
    const linha = r2(n(i.quantidade) * n(i.custo_unitario));
    produtos += linha;
    ipi += r2(linha * n(i.ipi_aliquota) / 100);
    st += n(i.icms_st_valor);
  }
  const frete = n(c.frete), outras = n(c.outras_despesas), desconto = n(c.desconto);
  return { produtos: r2(produtos), ipi: r2(ipi), st: r2(st), frete, outras, desconto, total: Math.max(0, r2(produtos + ipi + st + frete + outras - desconto)) };
}

/** Soma dias a uma data ISO (AAAA-MM-DD), sem fuso. */
export function somarDiasIso(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Divide o total nos prazos (dias a partir da data base); a última parcela acerta os centavos. */
export function parcelasPorPrazos(total: number, prazos: number[], base: string): ParcelaOc[] {
  const dias = prazos.filter((d) => Number.isFinite(d) && d >= 0);
  if (!dias.length || !(total > 0)) return [];
  const cada = r2(total / dias.length);
  return dias.map((d, k) => ({ vencimento: somarDiasIso(base, d), valor: k === dias.length - 1 ? r2(total - cada * (dias.length - 1)) : cada }));
}

/**
 * Prazos escritos na condição de pagamento, como no Tiny: "30/60/90", "30 60 90", "28 dias", "à vista" (0).
 * Sem número nenhum devolve [] (a pessoa monta as parcelas à mão).
 */
export function prazosDaCondicao(condicao: string | null | undefined): number[] {
  const t = String(condicao ?? "").toLowerCase();
  if (/(^|\s)(a|à) vista|antecipad/.test(t) && !/\d/.test(t)) return [0];
  // "3x" sozinho não diz os dias: 30, 60, 90
  const vezes = t.match(/^\s*(\d{1,2})\s*x\s*$/);
  if (vezes) return Array.from({ length: Math.min(48, Number(vezes[1])) }, (_, k) => 30 * (k + 1));
  return (t.match(/\d{1,3}/g) ?? []).map(Number).filter((d) => d <= 720).slice(0, 48);
}

/** Prazos de uma forma de pagamento do cadastro (parcelas, intervalo e 1ª parcela em dias). */
export function prazosDaForma(f: { parcelas?: number | null; intervalo_dias?: number | null; primeiro_em_dias?: number | null } | null | undefined): number[] {
  if (!f) return [];
  const qtd = Math.max(1, Math.min(48, Number(f.parcelas) || 1));
  const primeiro = Math.max(0, Number(f.primeiro_em_dias) || 0), intervalo = Math.max(0, Number(f.intervalo_dias) || 30);
  return Array.from({ length: qtd }, (_, k) => primeiro + intervalo * k);
}

/** Diferença entre a soma das parcelas e o total (0 = fecha). */
export const sobraParcelas = (parcelas: ParcelaOc[] | null | undefined, total: number) =>
  r2(total - (parcelas ?? []).reduce((s, p) => s + n(p.valor), 0));

/** Modalidade do frete (como na NF-e e no Tiny). */
export const FRETE_POR_CONTA: { value: string; label: string }[] = [
  { value: "remetente", label: "Remetente (CIF): o fornecedor paga" },
  { value: "destinatario", label: "Destinatário (FOB): a MF paga" },
  { value: "terceiros", label: "Terceiros" },
  { value: "proprio_remetente", label: "Transporte próprio do fornecedor" },
  { value: "proprio_destinatario", label: "Transporte próprio da MF (buscar)" },
  { value: "sem_frete", label: "Sem frete" },
];
export const nomeFretePorConta = (v: string | null | undefined) => FRETE_POR_CONTA.find((x) => x.value === v)?.label ?? null;
