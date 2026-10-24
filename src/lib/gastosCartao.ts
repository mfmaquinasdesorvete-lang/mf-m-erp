// Gastos de cartão no "A pagar" (pedido de 24/10): as compras do cartão que vêm do extrato (uma por linha, ex.:
// "POSTO X · mfmaquinas" — no fim, o portador do cartão) viram uma linha só por dia, "Gastos cartão dd/mm", com a soma.
// Boletos e demais contas continuam um por um.
import type { ContaFin } from "./financeiro";

const FORMAS_CARTAO = new Set(["cartao", "cartao_credito", "cartao_debito"]);

/** Compra no cartão: forma de pagamento cartão, ou a linha do extrato do cartão "ESTABELECIMENTO · portador". */
export function ehGastoCartao(c: Pick<ContaFin, "descricao" | "forma_pagamento" | "status">) {
  if (FORMAS_CARTAO.has(c.forma_pagamento ?? "")) return true;
  if (c.status !== "pago") return false;
  const d = (c.descricao ?? "").trim();
  if (/^(pix|boleto|pag(amento|to)?|ted|doc|transf)/i.test(d)) return false;
  return /^[^·]+ · [a-z0-9._-]+$/.test(d);   // portador em minúsculas e uma palavra só (Pix termina em "· Enviado")
}

/** Junta as compras de cartão de cada dia numa linha; o resto fica igual, na mesma ordem. */
export function agruparGastosCartao<T extends ContaFin>(itens: T[]): (T | (ContaFin & { cartao: number }))[] {
  const porDia = new Map<string, ContaFin & { cartao: number }>();
  const saida: (T | (ContaFin & { cartao: number }))[] = [];
  for (const c of itens) {
    if (!ehGastoCartao(c)) { saida.push(c); continue; }
    const dia = c.data_pagamento ?? c.vencimento;
    let g = porDia.get(dia);
    if (!g) {
      g = { id: `cartao-${dia}`, descricao: `Gastos cartão ${dia.slice(8, 10)}/${dia.slice(5, 7)}`, valor: 0, valor_pago: 0, vencimento: dia,
        data_pagamento: c.status === "pago" ? dia : null, status: c.status, forma_pagamento: "cartao", cartao: 0 };
      porDia.set(dia, g);
      saida.push(g);
    }
    const v = Number(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor);
    g.valor = Math.round((g.valor + v) * 100) / 100;
    g.valor_pago = g.valor;
    g.cartao += 1;
    if (c.status !== "pago") { g.status = "aberto"; g.data_pagamento = null; }
  }
  return saida;
}
