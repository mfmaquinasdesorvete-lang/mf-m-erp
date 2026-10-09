// Formas de pagamento cadastradas (Cadastros → Formas de pagamento): usadas nas vendas e nas contas fixas.
import { useRows } from "@/lib/data";

export type FormaPagamento = {
  id: string; nome: string; meio: string; uso: "receber" | "pagar" | "ambos"; parcelas: number; intervalo_dias: number; primeiro_em_dias: number;
  taxa_percentual: number; tarifa_fixa: number; conta_bancaria_id: string | null; ativo: boolean; ordem: number; observacoes: string | null;
};

export const MEIOS: [string, string][] = [
  ["pix", "Pix"], ["boleto", "Boleto"], ["cartao", "Cartão"], ["transferencia", "Transferência (TED)"], ["dinheiro", "Dinheiro"],
  ["debito_automatico", "Débito automático"], ["cheque", "Cheque"], ["outro", "Outro"],
];
/** Meios que a venda aceita (o pedido e a NF-e trabalham com estes). */
export const MEIOS_VENDA = ["boleto", "pix", "cartao", "dinheiro", "transferencia"];

export function useFormasPagamento() {
  return useRows<FormaPagamento>("formas_pagamento", { order: "ordem", ascending: true });
}

/** "3x de 30 em 30 dias, 1ª em 30 dias" */
export function condicao(f: Pick<FormaPagamento, "parcelas" | "intervalo_dias" | "primeiro_em_dias">) {
  const primeira = f.primeiro_em_dias ? `1ª em ${f.primeiro_em_dias} dia(s)` : "à vista";
  return f.parcelas > 1 ? `${f.parcelas}x de ${f.intervalo_dias} em ${f.intervalo_dias} dias, ${primeira}` : primeira;
}
