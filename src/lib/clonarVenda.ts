// Clonar venda (como no Tiny): um orçamento novo com o mesmo cliente, itens, pagamento e frete da venda escolhida.
// Não leva número, situação, nota, rastreio, proposta, aprovação de desconto nem marcadores: é uma venda nova.
import type { Item, Pedido } from "./types";

export function clonarVenda(p: Partial<Pedido> & { itens?: Item[] }, observacoes?: string | null): Partial<Pedido> & { itens: Item[] } {
  return {
    status: "orcamento",
    cliente_id: p.cliente_id, origem: p.origem ?? "whatsapp", vendedor: p.vendedor ?? null, vendedor_id: p.vendedor_id ?? null,
    comissao_percentual: p.comissao_percentual ?? null, unidade_id: p.unidade_id ?? null,
    forma_pagamento: p.forma_pagamento ?? "boleto", parcelas: p.parcelas ?? 1, intervalo_dias: p.intervalo_dias ?? 30,
    modalidade_frete: p.modalidade_frete ?? 9, frete: Number(p.frete ?? 0), transportadora_id: p.transportadora_id ?? null,
    desconto: Number(p.desconto ?? 0),
    ...((p as any).tabela_preco_id ? { tabela_preco_id: (p as any).tabela_preco_id } : {}),
    observacoes: observacoes?.trim() || p.observacoes || null,
    itens: (p.itens ?? []).map((i) => ({
      produto_id: i.produto_id, descricao: i.descricao, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario),
      ...(i.kit_escolha ? { kit_escolha: i.kit_escolha } : {}),
    })),
  };
}
