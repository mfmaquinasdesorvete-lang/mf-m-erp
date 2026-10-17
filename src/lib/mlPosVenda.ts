// Mercado Livre depois da venda (fase A): os textos da situação do envio, da NF-e e do rastreio de cada venda,
// para a aba "Vendas e notas". A fila e o envio ficam no banco e na função mercadolivre (ação pos_venda).

export type VendaML = {
  id: string; ml_order_id: number; ml_pack_id: number | null; pedido_id: string | null;
  data_venda: string | null; comprador: string | null; total: number | null; logistica: string | null;
  situacao: "importada" | "pendente" | "erro" | "cancelada" | "aguardando"; pendencia: string | null;
  envio_status: string | null; envio_substatus: string | null; envio_modo: string | null; rastreio_ml: string | null; envio_atualizado_em: string | null;
  nota_enviada_em: string | null; nota_erro: string | null; nota_tentativas: number;
  rastreio_enviado_em: string | null; rastreio_erro: string | null; rastreio_tentativas: number;
  pedidos?: { numero: number; codigo_rastreio: string | null } | null;
};

export type Tom = "ok" | "fila" | "atencao" | "erro" | "neutro";
export type Etiqueta = { texto: string; tom: Tom; detalhe?: string };

export const COR_TOM: Record<Tom, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  fila: "bg-sky-100 text-sky-800",
  atencao: "bg-amber-100 text-amber-900",
  erro: "bg-red-100 text-red-800",
  neutro: "bg-slate-100 text-slate-600",
};

/** Tentativas antes de parar (igual ao banco: ml_notas_pendentes e ml_rastreios_pendentes). */
export const MAX_TENTATIVAS = 5;

const STATUS: Record<string, { texto: string; tom: Tom }> = {
  pending: { texto: "Pendente", tom: "neutro" },
  handling: { texto: "Em preparação", tom: "fila" },
  ready_to_ship: { texto: "Pronto para enviar", tom: "fila" },
  shipped: { texto: "A caminho", tom: "fila" },
  delivered: { texto: "Entregue", tom: "ok" },
  not_delivered: { texto: "Não entregue", tom: "erro" },
  cancelled: { texto: "Cancelado", tom: "neutro" },
  to_be_agreed: { texto: "A combinar", tom: "neutro" },
};

const SUBSTATUS: Record<string, string> = {
  invoice_pending: "esperando a NF-e",
  ready_to_print: "etiqueta pronta para imprimir",
  printed: "etiqueta impressa",
  in_packing_list: "na lista de coleta",
  in_hub: "no centro de distribuição",
  in_warehouse: "no centro de distribuição",
  picked_up: "coletado",
  buffered: "aguardando a data de envio",
  dropped_off: "entregue na agência",
  authorized_by_carrier: "aceito pela transportadora",
  out_for_delivery: "saiu para entrega",
  soon_deliver: "entrega em breve",
  delayed: "atrasado",
  waiting_for_withdrawal: "aguardando retirada",
  receiver_absent: "destinatário ausente",
  returning_to_sender: "voltando para o vendedor",
  returned: "devolvido",
  claimed_me: "reclamação aberta",
  stolen: "extraviado (roubo)",
  lost: "extraviado",
  damaged: "avariado",
};

/** Envio por conta própria: quem informa o rastreio ao Mercado Livre é o vendedor (o ERP faz isso). */
export const envioProprio = (modo: string | null | undefined) => modo === "me1" || modo === "custom" || modo === "not_specified";

/** Como a venda é enviada: Full, Mercado Envios, envio próprio… */
export function textoModo(modo: string | null | undefined, logistica?: string | null): string {
  if (logistica === "fulfillment") return "Full (sai do estoque do Mercado Livre)";
  if (modo === "me2") return logistica === "self_service" ? "Mercado Envios Flex" : "Mercado Envios";
  if (modo === "me1") return "Mercado Envios 1 (envio próprio)";
  if (modo === "custom") return "Envio próprio";
  if (modo === "not_specified") return "A combinar com o comprador";
  return modo ? modo : "—";
}

/** Situação do envio no Mercado Livre, em português. */
export function textoEnvio(status: string | null | undefined, substatus?: string | null): Etiqueta {
  if (!status) return { texto: "Sem informação", tom: "neutro" };
  const s = STATUS[status] ?? { texto: status, tom: "neutro" as Tom };
  const sub = substatus ? SUBSTATUS[substatus] ?? substatus.replace(/_/g, " ") : undefined;
  const tom: Tom = substatus && ["delayed", "receiver_absent", "returning_to_sender", "claimed_me"].includes(substatus) ? "atencao"
    : substatus && ["stolen", "lost", "damaged", "returned"].includes(substatus) ? "erro" : s.tom;
  return { texto: s.texto, tom, detalhe: sub };
}

/**
 * NF-e no Mercado Livre: enviada, na fila, com erro (tenta até 5 vezes) ou esperando a nota.
 * `emiteErp`: a conta está com "o ERP emite a NF-e" (antes disso quem manda é o outro emissor, ex.: Tiny).
 */
export function situacaoNota(v: VendaML, emiteErp: boolean, temNotaAutorizada: boolean): Etiqueta {
  if (v.nota_enviada_em) return { texto: "Enviada ao Mercado Livre", tom: "ok" };
  if (v.situacao === "cancelada" || v.envio_status === "cancelled") return { texto: "Venda cancelada", tom: "neutro" };
  if (!emiteErp) return { texto: "Não vai pelo ERP", tom: "neutro", detalhe: "a nota é emitida por outro sistema" };
  if (!v.pedido_id) return { texto: "Venda ainda não entrou", tom: "neutro" };
  if (v.nota_erro) {
    return v.nota_tentativas >= MAX_TENTATIVAS
      ? { texto: "Parou: erro ao enviar", tom: "erro", detalhe: v.nota_erro }
      : { texto: `Erro, tenta de novo (${v.nota_tentativas}/${MAX_TENTATIVAS})`, tom: "atencao", detalhe: v.nota_erro };
  }
  if (!temNotaAutorizada) return { texto: "Esperando a NF-e", tom: "neutro", detalhe: "emita a nota do pedido" };
  return { texto: "Na fila (até 10 min)", tom: "fila" };
}

/** Rastreio: só no envio próprio (no Mercado Envios o próprio Mercado Livre gera e acompanha). */
export function situacaoRastreio(v: VendaML): Etiqueta | null {
  if (!envioProprio(v.envio_modo)) return null;
  if (v.rastreio_enviado_em) return { texto: "Informado ao Mercado Livre", tom: "ok" };
  if (v.situacao === "cancelada" || v.envio_status === "cancelled") return { texto: "Venda cancelada", tom: "neutro" };
  if (v.rastreio_erro) {
    return v.rastreio_tentativas >= MAX_TENTATIVAS
      ? { texto: "Parou: erro ao informar", tom: "erro", detalhe: v.rastreio_erro }
      : { texto: `Erro, tenta de novo (${v.rastreio_tentativas}/${MAX_TENTATIVAS})`, tom: "atencao", detalhe: v.rastreio_erro };
  }
  if (v.envio_status === "shipped" || v.envio_status === "delivered") return { texto: "Já consta como enviado", tom: "ok" };
  return { texto: "Esperando o despacho com rastreio", tom: "neutro", detalhe: "despache na expedição com o código de rastreio" };
}

/** Pede atenção: venda que não entrou, NF-e ou rastreio com erro, envio com problema. */
export function pedeAtencao(v: VendaML, emiteErp: boolean, temNotaAutorizada: boolean): boolean {
  if (v.situacao === "pendente" || v.situacao === "erro") return true;
  const tons = [situacaoNota(v, emiteErp, temNotaAutorizada).tom, situacaoRastreio(v)?.tom, textoEnvio(v.envio_status, v.envio_substatus).tom];
  return tons.includes("erro") || tons.includes("atencao");
}

/** Resumo do "Mandar agora" (resposta da ação pos_venda). */
export function textoResumoPosVenda(r: { aviso?: string; notas?: { enviadas: number; erros: number }; rastreios?: { enviados: number; erros: number } } | null | undefined): string {
  if (!r) return "Pedido enviado.";
  if (r.aviso) return r.aviso.charAt(0).toUpperCase() + r.aviso.slice(1) + ".";
  const n = r.notas ?? { enviadas: 0, erros: 0 }, t = r.rastreios ?? { enviados: 0, erros: 0 };
  if (!n.enviadas && !n.erros && !t.enviados && !t.erros) return "Nada na fila: todas as NF-e e rastreios já foram.";
  const partes: string[] = [];
  if (n.enviadas) partes.push(`${n.enviadas} ${n.enviadas === 1 ? "NF-e enviada" : "NF-e enviadas"}`);
  if (t.enviados) partes.push(`${t.enviados} ${t.enviados === 1 ? "rastreio informado" : "rastreios informados"}`);
  const erros = n.erros + t.erros;
  if (erros) partes.push(`${erros} com erro (veja na lista)`);
  return partes.join(", ") + ".";
}
