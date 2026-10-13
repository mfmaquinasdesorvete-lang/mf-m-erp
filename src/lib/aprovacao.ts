// Fluxo de aprovação antes do contador: em que etapa está cada conta, o que falta (pendências) e quem pode revisar.
// As mesmas regras do banco (migração fluxo_aprovacao); aqui só para mostrar. Funções puras.

export type TipoConta = "pagar" | "receber";
export const TABELA: Record<TipoConta, "contas_pagar" | "contas_receber"> = { pagar: "contas_pagar", receber: "contas_receber" };
export type Revisao = "historico" | "em_revisao" | "devolvido" | "rejeitado" | "aprovado";
export type ContadorStatus = "validado" | "duvida" | "ajustado";

export type ContaRevisao = {
  id: string; descricao: string; valor: number; vencimento: string; status: string; categoria?: string | null;
  competencia?: string | null; unidade_id?: string | null; data_pagamento?: string | null; conta_origem_id?: string | null;
  documento?: string | null; linha_digitavel?: string | null; nfe_recebida_id?: string | null; fornecedor_id?: string | null;
  pedido_id?: string | null; os_id?: string | null; nota_fiscal_id?: string | null; nfse_id?: string | null; cliente_id?: string | null;
  revisao?: Revisao | null; lancamento?: "manual" | "automatico" | "importado" | null; criado_por?: string | null;
  revisao1_por?: string | null; revisao1_nome?: string | null; revisao1_em?: string | null;
  revisao2_por?: string | null; revisao2_nome?: string | null; revisao2_em?: string | null;
  revisao_comentario?: string | null; exige_2a?: boolean | null; motivo_2a?: string | null;
  contador_status?: ContadorStatus | null; contador_nome?: string | null; contador_em?: string | null; contador_comentario?: string | null;
  corrige_id?: string | null;
};

export type Pendencia = "sem_documento" | "categoria" | "duplicidade";
export const ROTULO_PENDENCIA: Record<Pendencia, string> = {
  sem_documento: "sem documento",
  categoria: "categoria fora do plano de contas",
  duplicidade: "possível duplicidade",
};

const SEM_DOC_PAGAR = ["tarifas bancárias", "juros e multas", "comissoes"];
const SEM_DOC_RECEBER = ["receitas financeiras"];
const dias = (a: string, b: string) => Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 864e5;
const norm = (t?: string | null) => (t ?? "").trim().toLowerCase();

/**
 * O que falta para aprovar sem exceção (igual a pendencias_conta no banco): documento (número, linha digitável do boleto, NF de
 * fornecedor, pedido/OS/nota ou anexo), categoria do plano de contas e possível duplicidade (mesmo fornecedor/cliente, valor e
 * vencimento em até 5 dias, ou o mesmo boleto em outra conta).
 */
export function pendencias(c: ContaRevisao, tipo: TipoConta, ctx: {
  anexos: Set<string>; categorias: { nome: string; tipo: string; ativo?: boolean | null }[]; todas: ContaRevisao[];
}): Pendencia[] {
  const out: Pendencia[] = [];
  const cat = norm(c.categoria);
  const anexo = ctx.anexos.has(c.id) || (!!c.conta_origem_id && ctx.anexos.has(c.conta_origem_id));
  if (tipo === "pagar") {
    if (!c.documento?.trim() && !c.linha_digitavel?.trim() && !c.nfe_recebida_id && !anexo && !SEM_DOC_PAGAR.includes(cat)) out.push("sem_documento");
  } else if (!c.pedido_id && !c.os_id && !c.nota_fiscal_id && !c.nfse_id && !anexo && !SEM_DOC_RECEBER.includes(cat)) out.push("sem_documento");
  const tipoCat = tipo === "pagar" ? "despesa" : "receita";
  if (!ctx.categorias.some((k) => k.ativo !== false && k.tipo === tipoCat && norm(k.nome) === cat)) out.push("categoria");
  const dup = ctx.todas.some((o) => {
    if (o.id === c.id || o.status === "cancelado" || Number(o.valor) !== Number(c.valor) || dias(o.vencimento, c.vencimento) > 5) return false;
    if (o.conta_origem_id === c.id || o.id === c.conta_origem_id) return false;
    if (tipo === "pagar") return c.fornecedor_id ? o.fornecedor_id === c.fornecedor_id : !o.fornecedor_id && norm(o.descricao) === norm(c.descricao);
    return !!c.cliente_id && o.cliente_id === c.cliente_id && (!c.pedido_id || o.pedido_id !== c.pedido_id);
  });
  const linha = tipo === "pagar" && !c.conta_origem_id ? c.linha_digitavel?.trim() : "";
  const mesmoBoleto = !!linha && ctx.todas.some((o) => o.id !== c.id && o.status !== "cancelado" && !o.conta_origem_id && o.linha_digitavel === linha);
  if (dup || mesmoBoleto) out.push("duplicidade");
  return out;
}

export type Tom = "neutro" | "azul" | "ambar" | "laranja" | "vermelho" | "verde" | "roxo";
export const COR_TOM: Record<Tom, string> = {
  neutro: "bg-slate-100 text-slate-600",
  azul: "bg-sky-100 text-sky-800",
  ambar: "bg-amber-100 text-amber-800",
  laranja: "bg-orange-100 text-orange-800",
  vermelho: "bg-red-100 text-red-800",
  verde: "bg-emerald-100 text-emerald-800",
  roxo: "bg-violet-100 text-violet-800",
};

/** Etapa para mostrar (os estados da especificação: rascunho/aguardando documento, em revisão, devolvida, aprovada, contador…). */
export function etapaConta(c: ContaRevisao, pend: Pendencia[] = []): { texto: string; tom: Tom; dica: string } {
  const r = c.revisao ?? "historico";
  if (r === "historico") return { texto: "Anterior ao fluxo", tom: "neutro", dica: "Lançada antes do fluxo de aprovação" };
  if (r === "rejeitado") return { texto: "Rejeitada", tom: "vermelho", dica: c.revisao_comentario ?? "" };
  if (r === "devolvido") return { texto: "Devolvida para correção", tom: "laranja", dica: c.revisao_comentario ?? "" };
  if (r === "em_revisao") {
    if (c.contador_status === "ajustado") return { texto: "Ajustada (volta ao contador)", tom: "roxo", dica: c.contador_comentario ?? "" };
    if (c.revisao1_em) return { texto: "Na 2ª revisão", tom: "azul", dica: `1ª revisão: ${c.revisao1_nome ?? "—"} · ${c.motivo_2a ?? ""}` };
    if (pend.includes("sem_documento")) return { texto: "Aguardando documento", tom: "ambar", dica: "Anexe o boleto, a nota ou o recibo" };
    if (pend.length) return { texto: "Pendente", tom: "ambar", dica: pend.map((p) => ROTULO_PENDENCIA[p]).join(", ") };
    return { texto: "Em revisão", tom: "azul", dica: "Esperando a 1ª revisão" };
  }
  if (c.contador_status === "validado") return { texto: "Validada pelo contador", tom: "verde", dica: `${c.contador_nome ?? ""}` };
  if (c.contador_status === "duvida") return { texto: "Dúvida do contador", tom: "roxo", dica: c.contador_comentario ?? "" };
  return { texto: "Aprovada internamente", tom: "verde", dica: [c.revisao1_nome, c.revisao2_nome].filter(Boolean).join(" → ") };
}

export type RegrasAprovacao = { revisor1: string[]; revisor2: string[]; alcada: number };
export const regrasDe = (cfg?: Record<string, any> | null): RegrasAprovacao => ({
  revisor1: (cfg?.aprovacao_revisor1 ?? []) as string[],
  revisor2: (cfg?.aprovacao_revisor2 ?? []) as string[],
  alcada: Number(cfg?.aprovacao_alcada ?? 300),
});

/**
 * Se esta pessoa pode revisar agora (igual a revisar_contas no banco): 1ª revisão = revisor 1 ou administrador (o revisor 2
 * cobre quando foi o revisor 1 quem lançou); 2ª = revisor 2 ou administrador; quem lançou não faz a 1ª; quem fez a 1ª não faz a 2ª.
 */
export function quemPode(c: ContaRevisao, eu: { id: string; admin: boolean }, regras: RegrasAprovacao): { pode: boolean; etapa: 1 | 2; motivo?: string } {
  const etapa: 1 | 2 = c.revisao1_em ? 2 : 1;
  if (c.revisao !== "em_revisao") return { pode: false, etapa, motivo: "não está em revisão" };
  if (etapa === 1) {
    const ok = eu.admin || regras.revisor1.includes(eu.id) || (regras.revisor2.includes(eu.id) && !!c.criado_por && regras.revisor1.includes(c.criado_por));
    if (!ok) return { pode: false, etapa, motivo: "a 1ª revisão é de outra pessoa" };
    if (c.criado_por && c.criado_por === eu.id) return { pode: false, etapa, motivo: "você lançou esta conta" };
  } else {
    if (!(eu.admin || regras.revisor2.includes(eu.id))) return { pode: false, etapa, motivo: "a 2ª revisão é de outra pessoa" };
    if (c.revisao1_por === eu.id) return { pode: false, etapa, motivo: "você fez a 1ª revisão" };
  }
  return { pode: true, etapa };
}

/** Vai precisar da 2ª revisão (aviso antes de aprovar): valor na alçada, exceção já marcada ou pendência. */
export const precisa2a = (c: ContaRevisao, pend: Pendencia[], regras: RegrasAprovacao) =>
  !!c.exige_2a || pend.length > 0 || Number(c.valor) >= regras.alcada;
