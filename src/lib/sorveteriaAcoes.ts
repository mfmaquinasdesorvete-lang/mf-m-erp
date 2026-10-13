// Ações do pedido da sorveteria, em funções que recebem o estado e devolvem o novo: o PDV, o garçom e o totem usam as mesmas.
import { digitos } from "./format";
import {
  baixarEstoque, caixaAberto, definirAtivo, desfidelizar, devolverEstoque, fidelizar, novoPedido, numerar, pedidoAtivo, salvarPedido, upsertCliente,
  type Estado, type Pagamento, type Pedido,
} from "./sorveteria";

/** Pedido em andamento desta aba (cria um rascunho se ainda não há). */
export function comAtivo(e: Estado, operador: string): [Estado, Pedido] {
  const atual = pedidoAtivo(e);
  if (atual) return [e, atual];
  const p = novoPedido(e, operador);
  definirAtivo(p.id);
  return [salvarPedido(e, p), p];
}

export function validarPedido(e: Estado, p: Pedido): string | null {
  if (!p.itens.length) return "Adicione itens ao pedido.";
  if (!caixaAberto(e)) return "Abra o caixa para continuar.";
  if (p.canal === "mesa" && !p.mesa) return "Escolha a comanda.";
  if (p.canal === "delivery" && (!p.cliente?.nome.trim() || !p.cliente.endereco.trim() || !digitos(p.cliente.telefone))) return "Delivery: informe nome, telefone e endereço.";
  if (p.canal === "retirada" && !p.cliente?.nome.trim()) return "Retirada: informe o nome do cliente.";
  return null;
}

/** Envia à produção: numera, dá baixa nos insumos e marca os itens como enviados. */
export function irParaProducao(e: Estado, p: Pedido): [Estado, Pedido] {
  const [e1, n] = numerar(e, p);
  const [e2, b] = baixarEstoque(e1, n);
  const novos = b.itens.filter((i) => !b.enviados?.includes(i.id));
  const agora = new Date().toISOString();
  return [e2, { ...b, enviados: b.itens.map((i) => i.id), producao: novos.length || !b.producao ? "novo" : b.producao, enviadoEm: novos.length ? agora : b.enviadoEm ?? agora }];
}

/** Confirma o pagamento: fecha o pedido, baixa o estoque, credita pontos e leva à produção quando precisa. */
export function pagarPedido(e: Estado, base: Pedido, pagamentos: Pagamento[], troco: number): [Estado, Pedido] {
  const agora = new Date().toISOString();
  const [e1, n] = numerar(e, base);
  let p: Pedido = { ...n, pagamentos, troco, situacao: "fechado", pagoEm: agora, caixaId: caixaAberto(e1)?.id ?? n.caixaId };
  let e2 = e1;
  [e2, p] = baixarEstoque(e2, p);
  [e2, p] = fidelizar(e2, p);
  if (p.pagarNaEntrega) p = { ...p, producao: "entregue", entregueEm: agora };
  else if (!p.producao && (p.canal !== "balcao" || e2.loja.producaoBalcao || p.totem)) p = { ...p, producao: "novo", enviadoEm: agora, enviados: p.itens.map((i) => i.id) };
  return [salvarPedido(e2, p), p];
}

/** Cancela devolvendo estoque, pontos e uso de cupom. */
export function cancelarPedido(e: Estado, p: Pedido, motivo: string): Estado {
  let e2 = p.situacao === "fechado" ? desfidelizar(e, p) : e;
  let q = p;
  [e2, q] = devolverEstoque(e2, q);
  return salvarPedido(e2, { ...q, situacao: "cancelado", producao: null, motivoCancelamento: motivo });
}

/** Atualiza o cadastro do cliente quando o pedido ganha nome e telefone. */
export const registrarCliente = (e: Estado, p: Pedido): Estado => upsertCliente(e, p)[0];
