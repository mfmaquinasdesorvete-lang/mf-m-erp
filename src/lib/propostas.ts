// Propostas comerciais: rótulos e link do cliente.
export const MOTIVOS: Record<string, string> = {
  preco: "Preço", prazo: "Prazo de entrega", frete: "Frete", pagamento: "Forma de pagamento", concorrente: "Fechei com outro fornecedor",
  produto: "Produto não atende", desistiu: "Desisti da compra", sem_resposta: "Cliente não respondeu", outro: "Outro motivo",
};

export const STATUS_PROPOSTA: Record<string, string> = {
  enviada: "enviada", visualizada: "cliente abriu", aprovada: "aprovada pelo cliente", rejeitada: "recusada", expirada: "vencida",
};

/** Link que o cliente abre (no endereço onde o ERP está publicado). */
export const linkProposta = (token: string) => `${window.location.origin}/proposta/${token}`;
