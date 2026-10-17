// Documentos do pedido de venda: nome do arquivo e título do PDF (nº e nome do cliente, como no Tiny) e o Pix com QR
// Code para o cliente pagar.
import { pixCopiaECola, type PixUnidade } from "./cobranca";

type ClienteNome = { nome?: string | null; nome_fantasia?: string | null } | null | undefined;

/** Nome que aparece para o cliente: o fantasia, se houver, senão a razão social/nome. */
export const nomeCliente = (c: ClienteNome) => (c?.nome_fantasia?.trim() || c?.nome?.trim() || "").replace(/\s+/g, " ");

/** "Proposta 1234 - Sorveteria Exemplo" / "Pedido 1234 - …" / "Proposta (rascunho) - …" */
export function tituloPedido(p: { numero?: number | null; status?: string | null }, cliente: ClienteNome, tituloProposta = "Proposta") {
  const tipo = !p.status || p.status === "orcamento" ? tituloProposta.trim() || "Proposta" : "Pedido";
  const nome = nomeCliente(cliente);
  return [p.numero ? `${tipo} ${p.numero}` : `${tipo} (rascunho)`, nome].filter(Boolean).join(" - ");
}

/** Título pronto para nome de arquivo: sem os caracteres que o Windows/celular não aceitam, até 120 letras. */
export function arquivoPedido(p: { numero?: number | null; status?: string | null }, cliente: ClienteNome, tituloProposta?: string) {
  const t = tituloPedido(p, cliente, tituloProposta).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim();
  return `${t}.pdf`;
}

/**
 * Pix do pedido: o total à vista ou a 1ª parcela (parcelado), com o nº do pedido no identificador.
 * Sem chave Pix na unidade, ou valor zero, não tem Pix.
 */
export function pixDoPedido(u: PixUnidade | null | undefined, p: { numero?: number | null; valor_total: number; parcelas?: number | null }) {
  if (!u?.pix_chave?.trim() || !(Number(p.valor_total) > 0)) return null;
  const n = Math.max(1, Number(p.parcelas) || 1);
  const valor = n > 1 ? Math.round((Number(p.valor_total) / n) * 100) / 100 : Math.round(Number(p.valor_total) * 100) / 100;
  const txid = p.numero ? `PED${p.numero}` : "***";
  return {
    copiaECola: pixCopiaECola({ chave: u.pix_chave, nome: u.pix_nome || u.razao_social || u.nome || "", cidade: u.pix_cidade || u.municipio || "", valor, txid }),
    valor,
    rotulo: n > 1 ? `1ª parcela de ${n}` : "Pagamento à vista",
  };
}
