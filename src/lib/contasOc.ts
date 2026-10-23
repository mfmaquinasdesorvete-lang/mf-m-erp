// Contas a pagar lançadas pela ordem de compra (OC → Lançar no contas a pagar): conferência com as parcelas da OC.
// Só cálculo, sem tela.

export type ParcelaOc = { vencimento: string; valor: number | string };
export type ContaOc = { id: string; vencimento: string; valor: number | string; status: string; nfe_recebida_id?: string | null };

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * O que mudou na OC depois de lançar as contas (só as contas em aberto contam; as pagas já foram).
 * Devolve uma frase para o aviso, ou null se as contas batem com a OC.
 */
export function divergenciaContasOc(contas: ContaOc[], parcelas: ParcelaOc[] | null | undefined, totalOc: number): string | null {
  const ativas = contas.filter((c) => c.status !== "cancelado");
  if (!ativas.length) return null;
  const soma = r2(ativas.reduce((s, c) => s + Number(c.valor || 0), 0));
  const difTotal = r2(Number(totalOc || 0) - soma);
  const avisos: string[] = [];
  if (Math.abs(difTotal) >= 0.05) avisos.push(`o total da OC (${brl(totalOc)}) está ${difTotal > 0 ? "maior" : "menor"} que o das contas (${brl(soma)})`);
  const ps = (parcelas ?? []).filter((p) => p.vencimento);
  if (ps.length) {
    if (ps.length !== ativas.length) avisos.push(`a OC tem ${ps.length} parcelas e foram lançadas ${ativas.length} contas`);
    else {
      const datasOc = ps.map((p) => p.vencimento).sort();
      const datasContas = ativas.map((c) => c.vencimento).sort();
      if (datasOc.some((d, i) => d !== datasContas[i])) avisos.push("os vencimentos das parcelas mudaram");
    }
  }
  return avisos.length ? `Mudou depois de lançar: ${avisos.join("; ")}. Ajuste as contas no contas a pagar (o ERP não muda sozinho).` : null;
}

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** A OC pode lançar as contas agora? (enviada ou recebida em parte, com fornecedor e valor, e ainda sem contas).
 * A recebida já passou pelo recebimento ou pela nota (e as do Tiny trazem as contas de lá): não lança por aqui. */
export function podeLancarOc(p: { status?: string | null; fornecedor_id?: string | null; valor_total?: number | string | null }, jaTemContas: boolean) {
  if (jaTemContas) return false;
  return ["enviado", "parcial"].includes(p.status ?? "") && !!p.fornecedor_id && Number(p.valor_total || 0) > 0;
}
