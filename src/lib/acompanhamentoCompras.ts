// Acompanhamento de compras (pedido de 24/10): em que etapa está cada peça pedida — cotação → pedida ao fornecedor →
// nota emitida → em transporte → chegou — e se está atrasada. Os dados vêm de acompanhamento_compras (banco).

export type NotaCompra = {
  id: string; numero: string; emissao: string | null; chegou_em: string | null; chegou_como: string | null;
  processamento: string | null; conferencia: string | null;
  ocorrencia: string | null; ocorrencia_em: string | null; prev_entrega: string | null; cte: string | null; cte_transportadora: string | null;
};
export type PecaCompra = {
  item_id: string; descricao: string; sku: string | null; produto_id: string | null; quantidade: number; recebida: number; valor: number | null;
  oc_id: string; oc_numero: number; oc_status: string; oc_data: string; enviado_em: string | null; recebido_em: string | null;
  previsao: string | null; fornecedor: string | null; unidade_id: string | null; op_numero: number | null; transportadora: string | null;
  notas_soltas: number; notas: NotaCompra[];
};

export type Etapa = "cotacao" | "pedida" | "nota" | "transporte" | "chegou" | "cancelada";
export const ETAPAS: { valor: Etapa; rotulo: string }[] = [
  { valor: "cotacao", rotulo: "Em cotação" },
  { valor: "pedida", rotulo: "Pedida, sem nota" },
  { valor: "nota", rotulo: "Nota emitida" },
  { valor: "transporte", rotulo: "Em transporte" },
  { valor: "chegou", rotulo: "Chegou" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

/** A ocorrência do CT-e já fala em entrega feita (mesma regra do banco: "entregue" sem "não", "tentativa", "rota"…). */
export const ocorrenciaEntregue = (o: string | null | undefined) =>
  !!o && /entreg/i.test(o) && !/(n[aã]o|sem|tentativa|saiu|rota|previs)/i.test(o);

export function etapaDaPeca(p: PecaCompra): Etapa {
  if (p.oc_status === "cancelado") return "cancelada";
  if (p.oc_status === "recebido" || Number(p.recebida) >= Number(p.quantidade) || p.notas.some((n) => n.chegou_em)) return "chegou";
  if (p.oc_status === "cotacao") return "cotacao";
  if (!p.notas.length) return "pedida";
  if (p.notas.some((n) => n.ocorrencia || n.cte || n.processamento === "a_caminho")) return "transporte";
  return "nota";
}

/** Previsão de chegada: a do CT-e (transportadora) quando tem; senão a combinada na OC. */
export function previsaoDaPeca(p: PecaCompra): string | null {
  const doCte = p.notas.map((n) => n.prev_entrega).filter(Boolean).sort().pop();
  return doCte ?? p.previsao;
}

export function atrasada(p: PecaCompra, hoje: string): boolean {
  const e = etapaDaPeca(p);
  if (e === "chegou" || e === "cancelada" || e === "cotacao") return false;
  const prev = previsaoDaPeca(p);
  return !!prev && prev.slice(0, 10) < hoje;
}

/** Andamento de uma ordem de compra (ocs_andamento no banco): o passo que aparece na lista de Compras (pedido de 26/10). */
export type AndamentoOC = { pedido_compra_id: string; paga: boolean; nota: boolean; a_caminho: boolean; chegou: boolean };

export function passoDaOC(status: string, a: AndamentoOC | undefined): { rotulo: string; cor: string } | null {
  if (!a || !["enviado", "parcial", "recebido"].includes(status)) return null;
  const pago = a.paga ? " · paga" : "";
  if (a.chegou || status === "recebido") return { rotulo: `Chegou${pago}`, cor: "bg-emerald-100 text-emerald-800" };
  if (a.a_caminho) return { rotulo: `A caminho${pago}`, cor: "bg-sky-100 text-sky-800" };
  if (a.nota) return { rotulo: `Nota emitida${pago}`, cor: "bg-indigo-100 text-indigo-800" };
  if (a.paga) return { rotulo: "Paga · esperando nota", cor: "bg-amber-100 text-amber-800" };
  return null;
}
