// Evolução das notas fiscais: em que etapa cada NF está depois da SEFAZ, para os ícones ao lado da nota
// e a linha do tempo dentro dela. Funções puras (os dados vêm de evolucao_notas / evolucao_recebidas).

export type EstadoEtapa = "ok" | "andamento" | "pendente" | "problema";
export type EtapaId =
  | "email" | "contas" | "estoque" | "etiqueta" | "expedicao" | "entrega"
  | "manifestacao" | "xml" | "fornecedor" | "produtos" | "pagar";
export type Etapa = { id: EtapaId; rotulo: string; estado: EstadoEtapa; detalhe: string; data?: string | null };
export type Extra = { id: "cce" | "devolucao"; rotulo: string };

export type EvolucaoEmitida = {
  nota_id: string;
  email_status: string | null; email_em: string | null; email_possivel: boolean | null;
  contas_qtd: number; contas_pagas: number; contas_vencidas: number; contas_aberto: number | string; pago_em: string | null;
  estoque: boolean;
  etiqueta_em: string | null; etiqueta_vezes: number;
  exp_status: string | null; separando_em?: string | null; embalado_em?: string | null; despachado_em: string | null; exp_entregue_em: string | null;
  envio_status: string | null; coletado_em: string | null; entrega_prevista: string | null; envio_entregue_em: string | null; rastreio: string | null;
  pedido_status: string | null; cce: number; devolucao: boolean;
};
export type EvolucaoRecebida = { nota_id: string; contas_qtd: number; contas_pagas: number; contas_vencidas: number; contas_aberto: number | string; pago_em: string | null };

export type NotaParaEvolucao = {
  status: string; ambiente?: string | null; origem?: string | null; finalidade?: string | null; tipo_operacao?: string | null;
  pedido_id?: string | null; transferencia_id?: string | null; estoque_lancado?: boolean | null;
};
export type RecebidaParaEvolucao = {
  situacao: string; processamento: string; manifestacao?: string | null; nfe_completa?: boolean | null; fornecedor_id?: string | null;
  conta_pagar_id?: string | null; estoque_lancado?: boolean | null; finalidade?: string | null; origem?: string | null;
};

export type Evolucao = { etapas: Etapa[]; extras: Extra[]; historico: boolean };

const dia = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
const reais = (v: number | string) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const VAZIA: Evolucao = { etapas: [], extras: [], historico: false };

function etapaContas(qtd: number, pagas: number, vencidas: number, aberto: number | string, pagoEm: string | null, receber: boolean): Etapa {
  const id: EtapaId = receber ? "contas" : "pagar";
  const rotulo = receber ? "Contas a receber" : "Contas a pagar";
  if (!qtd) return { id, rotulo, estado: "pendente", detalhe: receber ? "não lançadas" : "conta a pagar não lançada" };
  if (vencidas) return { id, rotulo, estado: "problema", detalhe: `${vencidas} parcela(s) vencida(s), ${reais(aberto)} em aberto` };
  if (pagas >= qtd) return { id, rotulo, estado: "ok", detalhe: receber ? `recebido${pagoEm ? ` (último em ${dia(pagoEm)})` : ""}` : `paga${pagoEm ? ` em ${dia(pagoEm)}` : ""}`, data: pagoEm };
  return { id, rotulo, estado: "andamento", detalhe: `${pagas} de ${qtd} parcela(s) ${receber ? "recebida(s)" : "paga(s)"}, ${reais(aberto)} em aberto` };
}

const EXP_ROTULO: Record<string, string> = { separar: "a separar", separando: "separando", conferido: "conferido", embalado: "embalado, falta despachar" };
const ENVIO_ROTULO: Record<string, string> = { cotacao: "frete em cotação", aprovacao: "frete aguardando aprovação", coleta: "aguardando coleta" };

/**
 * Etapas de uma NF emitida. `op` diz se a operação mexe no financeiro/estoque (nota direta de remessa, garantia...);
 * venda e nota de pedido mexem nos dois.
 */
export function evolucaoEmitida(n: NotaParaEvolucao, ev: EvolucaoEmitida | undefined, hoje: string,
  op?: { financeiro: boolean; estoque: boolean } | null): Evolucao {
  if (n.origem === "importada") return { ...VAZIA, historico: true };
  if (n.status !== "autorizada" || n.ambiente === "homologacao" || n.finalidade === "devolucao"
    || n.tipo_operacao === "entrada" || n.transferencia_id || !ev) return VAZIA;

  const dePedido = !!n.pedido_id;
  const financeiro = dePedido || (op?.financeiro ?? true) || ev.contas_qtd > 0;
  const mexeEstoque = dePedido || (op?.estoque ?? true);
  const etapas: Etapa[] = [];

  // 1. DANFE por e-mail ao cliente (sai sozinho na autorização das notas de pedido)
  if (dePedido) {
    const s = ev.email_status;
    etapas.push(
      s === "enviado" ? { id: "email", rotulo: "E-mail ao cliente", estado: "ok", detalhe: `DANFE enviada${ev.email_em ? ` em ${dia(ev.email_em)}` : ""}`, data: ev.email_em }
        : s === "erro" ? { id: "email", rotulo: "E-mail ao cliente", estado: "problema", detalhe: "o e-mail não foi entregue" }
          : s ? { id: "email", rotulo: "E-mail ao cliente", estado: "andamento", detalhe: "na fila de envio" }
            : { id: "email", rotulo: "E-mail ao cliente", estado: "pendente", detalhe: ev.email_possivel ? "não enviado" : "não enviado: cliente sem e-mail ou avisos por e-mail desligados" },
    );
  }
  // 2. Financeiro
  if (financeiro) etapas.push(etapaContas(ev.contas_qtd, ev.contas_pagas, ev.contas_vencidas, ev.contas_aberto, ev.pago_em, true));
  // 3. Estoque
  if (mexeEstoque) {
    const baixado = ev.estoque || !!n.estoque_lancado;
    etapas.push({ id: "estoque", rotulo: "Estoque", estado: baixado ? "ok" : "pendente", detalhe: baixado ? "baixado" : "não baixado" });
  }
  // 4. Etiqueta
  etapas.push(ev.etiqueta_em
    ? { id: "etiqueta", rotulo: "Etiqueta", estado: "ok", detalhe: `impressa${ev.etiqueta_vezes > 1 ? ` ${ev.etiqueta_vezes}×` : ""}, última em ${dia(ev.etiqueta_em)}`, data: ev.etiqueta_em }
    : { id: "etiqueta", rotulo: "Etiqueta", estado: "pendente", detalhe: "não impressa" });

  // 5 e 6. Expedição e entrega (pedido)
  if (dePedido) {
    const entregue = ev.pedido_status === "entregue" || !!ev.exp_entregue_em || !!ev.envio_entregue_em || ev.exp_status === "entregue" || ev.envio_status === "entregue";
    const despachado = entregue || ev.exp_status === "despachado" || ev.envio_status === "transito" || !!ev.coletado_em || !!ev.despachado_em;
    const rastreio = ev.rastreio ? ` · rastreio ${ev.rastreio}` : "";
    if (despachado) {
      const quando = ev.despachado_em ?? ev.coletado_em;
      etapas.push({ id: "expedicao", rotulo: "Despacho", estado: "ok", detalhe: `despachado${quando ? ` em ${dia(quando)}` : ""}${rastreio}`, data: quando });
    } else if (ev.exp_status || ev.envio_status) {
      const fase = (ev.exp_status && EXP_ROTULO[ev.exp_status]) || (ev.envio_status && ENVIO_ROTULO[ev.envio_status]) || "na expedição";
      etapas.push({ id: "expedicao", rotulo: "Despacho", estado: "andamento", detalhe: fase });
    } else {
      etapas.push({ id: "expedicao", rotulo: "Despacho", estado: "pendente", detalhe: "ainda não foi para a expedição" });
    }
    const quandoEntregue = ev.envio_entregue_em ?? ev.exp_entregue_em;
    if (entregue) etapas.push({ id: "entrega", rotulo: "Entrega", estado: "ok", detalhe: `entregue${quandoEntregue ? ` em ${dia(quandoEntregue)}` : ""}`, data: quandoEntregue });
    else if (ev.entrega_prevista && ev.entrega_prevista < hoje) etapas.push({ id: "entrega", rotulo: "Entrega", estado: "problema", detalhe: `atrasada (prevista para ${dia(ev.entrega_prevista)})` });
    else etapas.push({ id: "entrega", rotulo: "Entrega", estado: despachado ? "andamento" : "pendente", detalhe: ev.entrega_prevista ? `prevista para ${dia(ev.entrega_prevista)}` : despachado ? "a caminho" : "aguardando" });
  }

  const extras: Extra[] = [];
  if (ev.cce) extras.push({ id: "cce", rotulo: `${ev.cce} carta(s) de correção` });
  if (ev.devolucao) extras.push({ id: "devolucao", rotulo: "tem nota de devolução" });
  return { etapas, extras, historico: false };
}

/** Etapas de uma NF de fornecedor: ciência, XML, fornecedor, produtos/estoque e conta a pagar. */
export function evolucaoRecebida(n: RecebidaParaEvolucao, ev: EvolucaoRecebida | undefined): Evolucao {
  if (n.situacao === "cancelada") return VAZIA;
  if (n.processamento === "ignorada") return { ...VAZIA, historico: true };
  const etapas: Etapa[] = [];
  const m = n.manifestacao ?? "";
  // XML mandado pelo fornecedor (importado à mão) não passa pela manifestação na SEFAZ
  if (n.origem !== "xml") etapas.push(
    ["ciencia", "confirmacao", "confirmada"].includes(m) ? { id: "manifestacao", rotulo: "Ciência", estado: "ok", detalhe: m === "ciencia" ? "ciência da operação dada" : "operação confirmada" }
      : ["desconhecimento", "nao_realizada", "operacao_nao_realizada"].includes(m) ? { id: "manifestacao", rotulo: "Ciência", estado: "problema", detalhe: "operação contestada" }
        : { id: "manifestacao", rotulo: "Ciência", estado: "pendente", detalhe: "sem manifestação" },
  );
  etapas.push(n.nfe_completa
    ? { id: "xml", rotulo: "XML", estado: "ok", detalhe: "XML completo lido" }
    : { id: "xml", rotulo: "XML", estado: "andamento", detalhe: "aguardando o XML completo" });
  etapas.push(n.fornecedor_id
    ? { id: "fornecedor", rotulo: "Fornecedor", estado: "ok", detalhe: "cadastrado" }
    : { id: "fornecedor", rotulo: "Fornecedor", estado: "pendente", detalhe: "não cadastrado" });
  if (n.finalidade !== "devolucao") {
    etapas.push(n.estoque_lancado ? { id: "produtos", rotulo: "Estoque", estado: "ok", detalhe: "entrada no estoque feita" }
      : n.processamento === "aguardando_vinculo" ? { id: "produtos", rotulo: "Estoque", estado: "problema", detalhe: "falta vincular produto" }
        : n.processamento === "revisao" ? { id: "produtos", rotulo: "Estoque", estado: "problema", detalhe: "conferir antes de lançar" }
          : { id: "produtos", rotulo: "Estoque", estado: "pendente", detalhe: "entrada não feita" });
    const qtd = ev?.contas_qtd ?? (n.conta_pagar_id ? 1 : 0);
    etapas.push(etapaContas(qtd, ev?.contas_pagas ?? 0, ev?.contas_vencidas ?? 0, ev?.contas_aberto ?? 0, ev?.pago_em ?? null, false));
  }
  return { etapas, extras: [], historico: false };
}

/** Filtros por etapa para as listas. */
export const FILTROS_EMITIDAS: { valor: string; rotulo: string; teste: (e: Evolucao) => boolean }[] = [
  { valor: "email", rotulo: "E-mail ao cliente não enviado", teste: (e) => e.etapas.some((x) => x.id === "email" && x.estado !== "ok") },
  { valor: "contas", rotulo: "Contas a receber não lançadas", teste: (e) => e.etapas.some((x) => x.id === "contas" && x.estado === "pendente") },
  { valor: "vencidas", rotulo: "Com parcela vencida", teste: (e) => e.etapas.some((x) => x.id === "contas" && x.estado === "problema") },
  { valor: "areceber", rotulo: "Ainda a receber", teste: (e) => e.etapas.some((x) => x.id === "contas" && x.estado !== "ok") },
  { valor: "estoque", rotulo: "Estoque não baixado", teste: (e) => e.etapas.some((x) => x.id === "estoque" && x.estado !== "ok") },
  { valor: "etiqueta", rotulo: "Etiqueta não impressa", teste: (e) => e.etapas.some((x) => x.id === "etiqueta" && x.estado !== "ok") },
  { valor: "despacho", rotulo: "Não despachadas", teste: (e) => e.etapas.some((x) => x.id === "expedicao" && x.estado !== "ok") },
  { valor: "atrasadas", rotulo: "Entrega atrasada", teste: (e) => e.etapas.some((x) => x.id === "entrega" && x.estado === "problema") },
  { valor: "concluidas", rotulo: "Tudo concluído", teste: (e) => e.etapas.length > 0 && e.etapas.every((x) => x.estado === "ok") },
];

export const FILTROS_RECEBIDAS: { valor: string; rotulo: string; teste: (e: Evolucao) => boolean }[] = [
  { valor: "manifestacao", rotulo: "Sem ciência", teste: (e) => e.etapas.some((x) => x.id === "manifestacao" && x.estado !== "ok") },
  { valor: "fornecedor", rotulo: "Fornecedor não cadastrado", teste: (e) => e.etapas.some((x) => x.id === "fornecedor" && x.estado !== "ok") },
  { valor: "produtos", rotulo: "Estoque não lançado", teste: (e) => e.etapas.some((x) => x.id === "produtos" && x.estado !== "ok") },
  { valor: "pagar", rotulo: "Conta a pagar não lançada", teste: (e) => e.etapas.some((x) => x.id === "pagar" && x.estado === "pendente") },
  { valor: "vencidas", rotulo: "Com parcela vencida", teste: (e) => e.etapas.some((x) => x.id === "pagar" && x.estado === "problema") },
  { valor: "concluidas", rotulo: "Tudo concluído", teste: (e) => e.etapas.length > 0 && e.etapas.every((x) => x.estado === "ok") },
];
