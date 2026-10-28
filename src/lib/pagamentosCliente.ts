// Onde o cliente pagou o pedido: na conta da MF, direto a um fornecedor da MF (peças faturadas para a MF e pagas pelo
// cliente), na conta pessoal da sócia ou outro. A baixa e as contas a pagar são feitas no banco
// (registrar_pagamento_cliente); aqui ficam o resumo da tela e a conferência do valor antes de gravar.

export type TipoPagamento = "conta_mf" | "fornecedor" | "conta_socia" | "outro";

export const TIPOS_PAGAMENTO: Record<TipoPagamento, { rotulo: string; dica: string }> = {
  conta_mf: { rotulo: "Na conta da MF", dica: "Pix, depósito ou cartão que entrou numa conta da MF" },
  fornecedor: { rotulo: "Direto ao fornecedor", dica: "O cliente pagou uma nota de compra da MF (ex.: peças da Frigelar no cartão dele)" },
  conta_socia: { rotulo: "Na conta da sócia", dica: "Entrou na conta pessoal da sócia: fica registrado para o encontro de contas" },
  outro: { rotulo: "Outro", dica: "Dinheiro, permuta ou outro jeito: explique na observação" },
};

type Parcela = { status: string; valor: number | string; valor_pago?: number | string | null };
type Registro = { tipo: TipoPagamento; valor: number | string; excluido_em?: string | null };
type Nota = { status: string; ambiente?: string | null; valor_total?: number | string | null };

const r2 = (v: number) => Math.round(v * 100) / 100;
const n = (v: unknown) => Number(v ?? 0) || 0;

/** Quanto do pedido foi pago e onde, o que falta e se a NF-e acompanha o valor do pedido. */
export function resumoPagamentos({ totalPedido, parcelas, registros, notas }: { totalPedido: number; parcelas: Parcela[]; registros: Registro[]; notas: Nota[] }) {
  const ativos = registros.filter((r) => !r.excluido_em);
  const por = (t: TipoPagamento) => r2(ativos.filter((r) => r.tipo === t).reduce((s, r) => s + n(r.valor), 0));
  const pagas = r2(parcelas.filter((p) => p.status === "pago").reduce((s, p) => s + n(p.valor_pago ?? p.valor), 0));
  const emAberto = r2(parcelas.filter((p) => p.status === "aberto").reduce((s, p) => s + n(p.valor), 0));
  const registrado = r2(ativos.reduce((s, r) => s + n(r.valor), 0));
  const nf = r2(notas.filter((x) => x.status === "autorizada" && x.ambiente !== "homologacao").reduce((s, x) => s + n(x.valor_total), 0));
  return {
    total: r2(totalPedido),
    contaMf: por("conta_mf"), fornecedor: por("fornecedor"), contaSocia: por("conta_socia"), outro: por("outro"),
    /** parcelas pagas antes deste registro (sem dizer onde): ficam como "recebido" */
    recebidoSemLugar: r2(Math.max(0, pagas - registrado)),
    emAberto,
    nf,
    /** NF-e autorizada menor que o pedido (com NF emitida) */
    nfMenor: nf > 0 && nf < r2(totalPedido) - 0.009,
  };
}

/** Conferência antes de gravar; devolve o problema ou null. */
export function problemaPagamento(valor: number | null, emAberto: number, opc: { saldoNota?: number | null; tipo: TipoPagamento; temFornecedor?: boolean }) {
  if (!(valor && valor > 0)) return "Informe o valor pago";
  if (valor > emAberto + 0.004) return `O pedido tem só ${emAberto.toFixed(2).replace(".", ",")} em aberto`;
  if (opc.tipo === "fornecedor" && !opc.temFornecedor) return "Escolha a nota do fornecedor (ou o fornecedor)";
  if (opc.saldoNota != null && valor > opc.saldoNota + 0.004) return `A nota tem só ${opc.saldoNota.toFixed(2).replace(".", ",")} ainda não paga por clientes`;
  return null;
}

/** Número da NF-e pela chave de acesso (posições 26 a 34). */
export const numeroDaChave = (chave: string | null | undefined) => (chave && chave.length >= 34 ? String(Number(chave.slice(25, 34))) : "");
