// Descontos por tipo de venda (Configurações → Descontos): o máximo de cada canal e forma de pagamento. Acima dele,
// a venda precisa da senha de aprovação de um administrador. A mesma regra do banco (public.desconto_maximo).

export type RegraDesconto = {
  id: string; canal: string; forma_pagamento: string; maximo_percentual: number; ativo: boolean; observacao: string | null;
};

export const CANAIS_DESCONTO: Record<string, string> = {
  todos: "Todas as vendas", balcao: "Balcão (PDV)", whatsapp: "WhatsApp", telefone: "Telefone", presencial: "Presencial",
  representante: "Representante", loja: "Loja virtual", marketplace: "Marketplace",
};
export const FORMAS_DESCONTO: Record<string, string> = {
  qualquer: "Qualquer pagamento", pix: "Pix", dinheiro: "Dinheiro", cartao: "Cartão", boleto: "Boleto / a prazo", transferencia: "Transferência",
};

/** A regra que vale: tipo de venda + pagamento > tipo de venda > pagamento > todas. Sem regra, sem limite (null). */
export function maximoDesconto(regras: RegraDesconto[], canal: string | null | undefined, forma: string | null | undefined) {
  const c = canal || "todos", f = forma || "qualquer";
  const r = regras
    .filter((x) => x.ativo && (x.canal === c || x.canal === "todos") && (x.forma_pagamento === f || x.forma_pagamento === "qualquer"))
    .sort((a, b) => Number(b.canal !== "todos") - Number(a.canal !== "todos") || Number(b.forma_pagamento !== "qualquer") - Number(a.forma_pagamento !== "qualquer"))[0];
  return r ? { max: Number(r.maximo_percentual), regra: r } : null;
}

/** Forma de pagamento de uma venda do PDV, como o banco grava no pedido: a do maior pagamento. */
export function formaPdv(pagamentos: { meio: string; valor: number }[]): string | null {
  if (!pagamentos.length) return null;
  const m = [...pagamentos].sort((a, b) => b.valor - a.valor)[0].meio;
  return m === "dinheiro" ? "dinheiro" : m === "cartao_credito" || m === "cartao_debito" ? "cartao"
    : m === "transferencia" ? "transferencia" : m === "prazo" ? "boleto" : "pix";
}

export const pctTexto = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
export const rotuloRegra = (canal: string, forma: string | null | undefined) =>
  [CANAIS_DESCONTO[canal] ?? canal, forma && forma !== "qualquer" ? FORMAS_DESCONTO[forma] ?? forma : null].filter(Boolean).join(" · ");
