// Renegociação de contas a pagar: o acordo com o fornecedor (parcelas novas ou as mesmas contas), o andamento
// (parcelas pagas) e a linha do tempo (notas, áudios, prints, arquivos e os pagamentos). Funções puras.

export type SituacaoNegociacao = "negociando" | "acordo" | "quitada" | "cancelada";
export type Negociacao = {
  id: string; titulo: string; fornecedor_id: string | null; unidade_id: string | null; valor_original: number; valor_acordo: number | null;
  parcelas: number | null; situacao: SituacaoNegociacao; observacoes: string | null; criado_nome: string | null; created_at: string; atualizado_em?: string | null;
};
export type TipoEvento = "nota" | "audio" | "print" | "acordo" | "arquivo";
export type EventoNegociacao = {
  id: string; negociacao_id: string; tipo: TipoEvento; quando: string; texto: string | null; arquivo_caminho: string | null;
  arquivo_nome: string | null; arquivo_tipo: string | null; criado_por?: string | null; criado_nome: string | null; created_at: string;
};
type ContaNeg = { id: string; descricao: string; valor: number; vencimento: string; status: string; data_pagamento?: string | null; valor_pago?: number | null;
  negociacao_id?: string | null; negociacao_papel?: string | null };

export const SITUACOES_NEGOCIACAO: Record<SituacaoNegociacao, { rotulo: string; chip: string; dica: string }> = {
  negociando: { rotulo: "Negociando", chip: "bg-orange-100 text-orange-800", dica: "Conversa em andamento: as contas continuam as mesmas" },
  acordo: { rotulo: "Acordo fechado", chip: "bg-[#ccfbf1] text-[#134e4a]", dica: "Acordo fechado: pagar as parcelas do acordo" },
  quitada: { rotulo: "Quitada", chip: "bg-emerald-100 text-emerald-800", dica: "Todas as parcelas do acordo pagas" },
  cancelada: { rotulo: "Cancelada", chip: "bg-slate-200 text-slate-700", dica: "Negociação desfeita" },
};

export const TIPOS_EVENTO: Record<TipoEvento, { rotulo: string; dica: string }> = {
  nota: { rotulo: "Anotação", dica: "O que foi conversado (data, com quem, o que ficou combinado)" },
  audio: { rotulo: "Áudio", dica: "Gravar aqui ou enviar o áudio do WhatsApp" },
  print: { rotulo: "Print", dica: "Print da conversa, do e-mail ou da proposta do fornecedor" },
  arquivo: { rotulo: "Arquivo", dica: "Acordo assinado, boleto novo, PDF" },
  acordo: { rotulo: "Acordo", dica: "Registrado pelo ERP ao fechar a renegociação" },
};

const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** "2026-01-31" + 1 mês = "2026-02-28" (como o banco: o dia que não existe vira o último do mês). */
export function somarMeses(iso: string, n: number) {
  const y0 = Number(iso.slice(0, 4)), m0 = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
  const t = (m0 - 1) + n, y = y0 + Math.floor(t / 12), m = ((t % 12) + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimoDia(y, m))).padStart(2, "0")}`;
}

/** As parcelas do acordo (como o banco vai lançar): mensais a partir do 1º vencimento, a última leva os centavos. */
export function parcelasDoAcordo(valor: number, n: number, primeiro: string) {
  if (!(valor > 0) || !(n >= 1) || !primeiro) return [];
  const total = Math.round(valor * 100);
  const cada = Math.round(total / n);
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1, vencimento: somarMeses(primeiro, i), valor: (i === n - 1 ? total - cada * (n - 1) : cada) / 100,
  }));
}

/** Andamento do acordo: parcelas pagas, quanto já foi pago, quanto falta e a próxima a vencer. */
export function andamento(contas: ContaNeg[]) {
  const acordo = contas.filter((c) => c.negociacao_papel === "acordo" && c.status !== "cancelado").sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const pagas = acordo.filter((c) => c.status === "pago");
  const abertas = acordo.filter((c) => c.status === "aberto");
  const soma = (l: ContaNeg[], pago = false) => Math.round(l.reduce((s, c) => s + Number(pago ? c.valor_pago ?? c.valor : c.valor), 0) * 100) / 100;
  return {
    total: acordo.length, pagas: pagas.length, valorPago: soma(pagas, true), falta: soma(abertas), proxima: abertas[0] ?? null,
    pct: acordo.length ? Math.round((pagas.length / acordo.length) * 100) : 0, quitada: acordo.length > 0 && abertas.length === 0,
  };
}

export type ItemLinha = { quando: string; tipo: TipoEvento | "pagamento"; texto: string; evento?: EventoNegociacao; ordem: string };
/** Linha do tempo da negociação: o que foi registrado e os pagamentos das parcelas, do mais novo para o mais antigo. */
export function linhaDoTempo(eventos: EventoNegociacao[], contas: ContaNeg[], brl: (v: number) => string): ItemLinha[] {
  const itens: ItemLinha[] = eventos.map((e) => ({ quando: e.quando, tipo: e.tipo, texto: e.texto ?? e.arquivo_nome ?? "", evento: e, ordem: e.created_at }));
  for (const c of contas) {
    if (c.negociacao_papel === "acordo" && c.status === "pago" && c.data_pagamento) {
      itens.push({ quando: c.data_pagamento, tipo: "pagamento", texto: `Pagamento registrado: ${c.descricao} · ${brl(Number(c.valor_pago ?? c.valor))}`, ordem: c.data_pagamento });
    }
  }
  return itens.sort((a, b) => b.quando.localeCompare(a.quando) || b.ordem.localeCompare(a.ordem));
}

/** Nome do arquivo para o caminho no armazenamento (sem acento nem espaço). */
export const nomeArquivoLimpo = (nome: string) => nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);
/** Tipo do registro pelo arquivo: áudio, print (imagem) ou arquivo. */
export const tipoPeloArquivo = (mime: string | null | undefined): TipoEvento =>
  mime?.startsWith("audio/") ? "audio" : mime?.startsWith("image/") ? "print" : "arquivo";
