// Painel do contador → fechamento do mês: situação, conciliação dos bancos e a lista de pendências e divergências,
// cada uma com valor, documento, quem resolve e o caminho até a tela de origem. Primeiro as pendências, depois os números.
// Puro (sem banco e sem tela). Testes em __tests__/fechamentoMes.test.ts.

export type Responsavel = "financeiro" | "fiscal" | "contador";
export type Divergencia = {
  id: string;
  area: "bancos" | "fiscal" | "financeiro";
  titulo: string;
  detalhe: string;
  quantidade: number;
  valor: number | null;
  responsavel: Responsavel;
  /** Impede fechar o mês sem justificativa. */
  bloqueia: boolean;
  /** Tela de origem (drill-down); "#..." é um trecho do próprio painel. */
  link: string;
};

export type ExtratoMes = { conta_bancaria_id: string; data: string; valor: number; status: string };
export type BancoMes = { id: string; nome: string; unidade_id?: string | null; ativo?: boolean | null };
export type ContaMes = {
  tipo: "receber" | "pagar"; id: string; unidade_id?: string | null; status: string; valor: number; valor_pago?: number | null;
  data_pagamento?: string | null; categoria?: string | null; revisao?: string | null; contador_status?: string | null;
  nota_fiscal_id?: string | null; pedido_id?: string | null; nfe_recebida_id?: string | null;
};
export type NotaEmitidaMes = {
  id: string; unidade_id?: string | null; status: string; numero?: string | null; valor_total: number; created_at: string;
  pedido_id?: string | null; payload?: { items?: { cfop?: string }[] } | null;
};
export type NotaRecebidaMes = {
  id: string; unidade_id?: string | null; valor_total: number; data_emissao?: string | null; situacao?: string | null; itens?: { cfop?: string }[] | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const noMes = (d: string | null | undefined, comp: string) => !!d && d.slice(0, 7) === comp;
const soma = (l: { valor: number }[]) => r2(l.reduce((s, x) => s + Math.abs(Number(x.valor)), 0));
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pl = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Linha do extrato que já foi tratada: conciliada com conta, transferência entre contas da empresa ou ignorada com motivo. */
export const tratada = (status: string) => status !== "pendente";

/** CFOP de venda (saída 5.1xx, 6.1xx, 7.1xx): é a nota que deveria virar conta a receber. */
export const cfopVenda = (cfop?: string | null) => /^[567]1\d\d$/.test(String(cfop ?? "").replace(/\D/g, ""));
/** CFOP do fornecedor que é venda para nós (compra): 5.1xx/6.1xx e 5.4xx/6.4xx (com ST). Remessa, devolução e brinde ficam de fora. */
export const cfopCompra = (cfop?: string | null) => /^[567][14]\d\d$/.test(String(cfop ?? "").replace(/\D/g, ""));

export type ConciliacaoConta = { id: string; nome: string; linhas: number; tratadas: number; pendentes: number; entradasPendentes: number; saidasPendentes: number };

/** Para cada conta bancária da unidade: quantas linhas do extrato no mês já foram tratadas e quanto falta. */
export function conciliacaoDoMes(extrato: ExtratoMes[], bancos: BancoMes[], unidadeId: string, comp: string): ConciliacaoConta[] {
  return bancos
    .filter((b) => b.ativo !== false && b.unidade_id === unidadeId)
    .map((b) => {
      const ls = extrato.filter((l) => l.conta_bancaria_id === b.id && noMes(l.data, comp));
      const pend = ls.filter((l) => !tratada(l.status));
      return {
        id: b.id, nome: b.nome, linhas: ls.length, tratadas: ls.length - pend.length, pendentes: pend.length,
        entradasPendentes: r2(pend.filter((l) => Number(l.valor) > 0).reduce((s, l) => s + Number(l.valor), 0)),
        saidasPendentes: r2(pend.filter((l) => Number(l.valor) < 0).reduce((s, l) => s - Number(l.valor), 0)),
      };
    })
    .filter((c) => c.linhas > 0)
    .sort((a, b) => b.pendentes - a.pendentes || a.nome.localeCompare(b.nome));
}

export type EntradaFechamento = {
  comp: string;
  unidadeId: string;
  extrato: ExtratoMes[];
  bancos: BancoMes[];
  contas: ContaMes[];
  notas: NotaEmitidaMes[];
  recebidas: NotaRecebidaMes[];
  /** Pendências fiscais já calculadas na tela (NF-e com erro, sem manifestação, numeração pulada). */
  fiscais?: { id: string; texto: string; bloqueia: boolean; link: string }[];
};

/** Pendências e divergências do mês, das que impedem o fechamento para as que só pedem conferência. */
export function divergenciasDoMes(e: EntradaFechamento): Divergencia[] {
  const out: Divergencia[] = [];
  const { comp, unidadeId } = e;

  // 1) bancos: linha do extrato sem conciliar
  for (const c of conciliacaoDoMes(e.extrato, e.bancos, unidadeId, comp)) {
    if (!c.pendentes) continue;
    out.push({
      id: `extrato-${c.id}`, area: "bancos", responsavel: "financeiro", bloqueia: true, link: "/conciliacao",
      titulo: `${c.nome}: ${c.pendentes} ${pl(c.pendentes, "linha do extrato sem conciliar", "linhas do extrato sem conciliar")}`,
      detalhe: [c.entradasPendentes ? `${brl(c.entradasPendentes)} em entradas` : "", c.saidasPendentes ? `${brl(c.saidasPendentes)} em saídas` : ""].filter(Boolean).join(" e ")
        + ` · ${c.tratadas} de ${c.linhas} já tratadas`,
      quantidade: c.pendentes, valor: r2(c.entradasPendentes + c.saidasPendentes),
    });
  }

  // 2) lançamentos pagos/recebidos no mês
  const doMes = e.contas.filter((c) => c.unidade_id === unidadeId && c.status === "pago" && noMes(c.data_pagamento, comp));
  const valorPago = (l: ContaMes[]) => r2(l.reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0));
  const naoAprovados = doMes.filter((c) => !["aprovado", "historico"].includes(c.revisao ?? "")); // mesma regra do LancamentosMes
  if (naoAprovados.length) out.push({
    id: "nao-aprovados", area: "financeiro", responsavel: "financeiro", bloqueia: true, link: "/aprovacoes",
    titulo: `${naoAprovados.length} ${pl(naoAprovados.length, "lançamento pago sem aprovação interna", "lançamentos pagos sem aprovação interna")}`,
    detalhe: "Pagos ou recebidos no mês que ainda não passaram pela revisão (Aprovações).", quantidade: naoAprovados.length, valor: valorPago(naoAprovados),
  });
  const duvidas = doMes.filter((c) => c.contador_status === "duvida");
  if (duvidas.length) out.push({
    id: "duvidas", area: "financeiro", responsavel: "financeiro", bloqueia: true, link: "#lancamentos-mes",
    titulo: `${duvidas.length} ${pl(duvidas.length, "dúvida do contador sem resposta", "dúvidas do contador sem resposta")}`,
    detalhe: "O contador perguntou sobre estes lançamentos; o financeiro responde ou corrige.", quantidade: duvidas.length, valor: valorPago(duvidas),
  });
  const semCategoria = doMes.filter((c) => !(c.categoria ?? "").trim());
  if (semCategoria.length) out.push({
    id: "sem-categoria", area: "financeiro", responsavel: "financeiro", bloqueia: false, link: "/financeiro",
    titulo: `${semCategoria.length} ${pl(semCategoria.length, "lançamento sem categoria", "lançamentos sem categoria")} do plano de contas`,
    detalhe: "Sem categoria o lançamento não cai na linha certa do DRE nem na conta contábil.", quantidade: semCategoria.length, valor: valorPago(semCategoria),
  });

  // 3) notas x financeiro
  const receber = e.contas.filter((c) => c.tipo === "receber" && c.status !== "cancelado");
  const porNota = new Set(receber.map((c) => c.nota_fiscal_id).filter(Boolean));
  const porPedido = new Set(receber.map((c) => c.pedido_id).filter(Boolean));
  const vendasSemConta = e.notas.filter((n) => n.unidade_id === unidadeId && n.status === "autorizada" && noMes(n.created_at, comp)
    && (n.payload?.items ?? []).some((i) => cfopVenda(i.cfop))
    && !porNota.has(n.id) && !(n.pedido_id && porPedido.has(n.pedido_id)));
  if (vendasSemConta.length) out.push({
    id: "venda-sem-conta", area: "financeiro", responsavel: "financeiro", bloqueia: false, link: "/notas",
    titulo: `${vendasSemConta.length} ${pl(vendasSemConta.length, "NF-e de venda sem conta a receber", "NF-e de venda sem conta a receber")}`,
    detalhe: `Notas ${vendasSemConta.slice(0, 8).map((n) => `nº ${n.numero ?? "—"}`).join(", ")}${vendasSemConta.length > 8 ? "…" : ""}: a venda saiu na nota e não entrou no financeiro.`,
    quantidade: vendasSemConta.length, valor: soma(vendasSemConta.map((n) => ({ valor: n.valor_total }))),
  });
  const pagar = e.contas.filter((c) => c.tipo === "pagar" && c.status !== "cancelado");
  const comConta = new Set(pagar.map((c) => c.nfe_recebida_id).filter(Boolean));
  const comprasSemConta = e.recebidas.filter((n) => n.unidade_id === unidadeId && noMes(n.data_emissao, comp) && n.situacao !== "cancelada"
    && (n.itens ?? []).some((i) => cfopCompra(i.cfop)) && !comConta.has(n.id));
  if (comprasSemConta.length) out.push({
    id: "compra-sem-conta", area: "financeiro", responsavel: "financeiro", bloqueia: false, link: "/notas?aba=recebidas",
    titulo: `${comprasSemConta.length} ${pl(comprasSemConta.length, "nota de compra sem conta a pagar", "notas de compra sem conta a pagar")}`,
    detalhe: "Compra com nota do fornecedor que não virou conta a pagar no ERP (paga por fora ou ainda não lançada).",
    quantidade: comprasSemConta.length, valor: soma(comprasSemConta.map((n) => ({ valor: n.valor_total }))),
  });

  // 4) fiscais (vêm prontas da tela)
  for (const f of e.fiscais ?? []) out.push({
    id: `fiscal-${f.id}`, area: "fiscal", responsavel: "fiscal", bloqueia: f.bloqueia, link: f.link, titulo: f.texto, detalhe: "", quantidade: 1, valor: null,
  });

  return out.sort((a, b) => Number(b.bloqueia) - Number(a.bloqueia));
}

export type StatusMes = "aberto" | "com_pendencias" | "em_revisao" | "pronto" | "enviado" | "fechado";

/** Situação do mês: aberto (em andamento), com pendências, em revisão (falta validar), pronto para fechar, enviado ou fechado. */
export function statusDoMes(s: { fechado: boolean; enviado: boolean; terminou: boolean; bloqueantes: number; aValidar: number }): { status: StatusMes; rotulo: string; explicacao: string } {
  if (s.fechado) return { status: "fechado", rotulo: "Fechado", explicacao: "Mês travado: correções só por lançamento corretivo." };
  if (!s.terminou) return { status: "aberto", rotulo: "Aberto", explicacao: "O mês ainda está em andamento." };
  if (s.bloqueantes) return { status: "com_pendencias", rotulo: "Com pendências", explicacao: `${s.bloqueantes} ${pl(s.bloqueantes, "pendência impede", "pendências impedem")} o fechamento sem justificativa.` };
  if (s.aValidar) return { status: "em_revisao", rotulo: "Em revisão", explicacao: `${s.aValidar} ${pl(s.aValidar, "lançamento aprovado espera", "lançamentos aprovados esperam")} a validação do contador.` };
  if (s.enviado) return { status: "enviado", rotulo: "Enviado ao contador", explicacao: "Sem pendências: falta só o contador fechar." };
  return { status: "pronto", rotulo: "Pronto para fechar", explicacao: "Sem pendências e tudo validado." };
}

/** Variação entre dois valores (null quando não dá para comparar). */
export function variacao(atual: number, base: number): number | null {
  if (!base) return null;
  return (atual - base) / Math.abs(base);
}

/** AAAA-MM do mês anterior e do mesmo mês do ano anterior. */
export function mesesComparacao(comp: string) {
  const y = Number(comp.slice(0, 4)), m = Number(comp.slice(5, 7));
  const ant = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { anterior: ant, anoAnterior: `${y - 1}-${comp.slice(5, 7)}` };
}
