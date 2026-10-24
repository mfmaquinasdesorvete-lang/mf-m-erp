// Colunas da lista de vendas, como no Tiny: se a venda já foi paga (pelas contas a receber), a forma de pagamento,
// a forma de envio com o rastreio e os sinais do que já foi feito (estoque, contas, NF-e). Funções puras.
import { brl, dataBR } from "./format";
import { linkRastreio, nomeCurto } from "./transportadoras";
import type { TipoTransportadora } from "./types";

export type ContaVenda = {
  id: string; status: string; valor: number | string; valor_pago?: number | string | null; vencimento: string;
  data_pagamento?: string | null; forma_pagamento?: string | null; conta_bancaria_id?: string | null;
};

export type SituacaoPagamento = "recebido" | "parcial" | "vencido" | "a_receber" | "sem_conta";
export type Pagamento = { situacao: SituacaoPagamento; texto: string; sub?: string; recebido: number; total: number };

export const ROTULO_PAGAMENTO: Record<SituacaoPagamento, string> = {
  recebido: "Recebido", parcial: "Recebido em parte", vencido: "Vencido", a_receber: "A receber", sem_conta: "Sem conta a receber",
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const dm = (d: string) => dataBR(d).slice(0, 5);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

/** As contas da venda, pelo pedido e pelas notas dele, sem repetir e sem as canceladas. */
export function contasDaVenda(p: { contas?: ContaVenda[] | null; notas?: { contas?: ContaVenda[] | null }[] | null }): ContaVenda[] {
  const vistas = new Map<string, ContaVenda>();
  for (const c of [...(p.contas ?? []), ...(p.notas ?? []).flatMap((n) => n.contas ?? [])]) if (c.status !== "cancelado") vistas.set(c.id, c);
  return [...vistas.values()];
}

/** Situação do pagamento da venda. Orçamento e venda cancelada não têm (null). */
export function pagamentoDaVenda(p: { status: string }, contas: ContaVenda[], hoje: string): Pagamento | null {
  if (p.status === "orcamento" || p.status === "cancelado") return null;
  const total = contas.reduce((s, c) => s + num(c.valor), 0);
  const recebido = contas.reduce((s, c) => s + (c.status === "pago" ? num(c.valor_pago ?? c.valor) : num(c.valor_pago)), 0);
  if (!contas.length) return { situacao: "sem_conta", texto: "Sem conta a receber", recebido: 0, total: 0 };
  const abertas = contas.filter((c) => c.status !== "pago").sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  if (!abertas.length) {
    const ultima = contas.map((c) => c.data_pagamento ?? "").sort().pop();
    return { situacao: "recebido", texto: "Recebido", sub: ultima ? `em ${dataBR(ultima)}` : undefined, recebido, total };
  }
  const parte = recebido > 0 ? `${brl(recebido)} de ${brl(total)}` : undefined;
  const primeira = abertas[0].vencimento;
  if (primeira < hoje) {
    const d = diasEntre(primeira, hoje);
    return { situacao: "vencido", texto: "Vencido", sub: parte ?? `há ${d} ${d === 1 ? "dia" : "dias"}`, recebido, total };
  }
  if (recebido > 0) return { situacao: "parcial", texto: "Em parte", sub: parte, recebido, total };
  return { situacao: "a_receber", texto: "A receber", sub: primeira === hoje ? "vence hoje" : `vence ${dm(primeira)}`, recebido, total };
}

export type MeioPagamento = "pix" | "boleto" | "cartao" | "dinheiro" | "transferencia" | "link" | "debito_automatico" | "cheque" | "outro";
export const ROTULO_MEIO: Record<MeioPagamento, string> = {
  pix: "Pix", boleto: "Boleto", cartao: "Cartão", dinheiro: "Dinheiro", transferencia: "Transferência", link: "Link de pagamento",
  debito_automatico: "Débito automático", cheque: "Cheque", outro: "Outro",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Meio pelo texto (do ERP ou do Tiny: "Pix", "Link de pagamento", "Cartão de crédito"…). */
export function meioDoTexto(t: string | null | undefined): MeioPagamento | null {
  const s = semAcento(t ?? "");
  if (!s) return null;
  if (s in ROTULO_MEIO) return s as MeioPagamento;
  if (/pix/.test(s)) return "pix";
  if (/link/.test(s)) return "link";
  if (/boleto/.test(s)) return "boleto";
  if (/cart|credito|debito em conta|maquininha/.test(s)) return /debito automatico/.test(s) ? "debito_automatico" : "cartao";
  if (/dinheiro|especie/.test(s)) return "dinheiro";
  if (/transfer|ted|doc|deposito/.test(s)) return "transferencia";
  if (/cheque/.test(s)) return "cheque";
  return "outro";
}

/** Forma de pagamento da venda: a do pedido; sem ela, a das contas; sem contas, a que veio do Tiny. */
export function meioDaVenda(p: { forma_pagamento?: string | null; parcelas?: number | null }, contas: ContaVenda[], doTiny?: string | null) {
  const contagem = new Map<MeioPagamento, number>();
  for (const c of contas) { const m = meioDoTexto(c.forma_pagamento); if (m) contagem.set(m, (contagem.get(m) ?? 0) + 1); }
  const daConta = [...contagem].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const meio = meioDoTexto(p.forma_pagamento) ?? daConta ?? meioDoTexto(doTiny);
  if (!meio) return null;
  const parcelas = Math.max(Number(p.parcelas ?? 1), contas.length);
  return { meio, rotulo: ROTULO_MEIO[meio] + (parcelas > 1 ? ` · ${parcelas}x` : "") };
}

export type TransportadoraVenda = { nome: string; nome_fantasia?: string | null; tipo?: TipoTransportadora | null; rastreio_url?: string | null };
export type EnvioVenda = {
  id: string; status: string; created_at?: string | null; transportadora_nome?: string | null; codigo_rastreio?: string | null;
  coletado_em?: string | null; entregue_em?: string | null; transportadora?: TransportadoraVenda | null;
};
export type TipoEnvio = TipoTransportadora | "sem_frete" | "a_definir" | "nao_informado";
export type Envio = { tipo: TipoEnvio; rotulo: string; rastreio?: string | null; link?: string | null; andamento?: string | null; entregue?: boolean };

const CORREIOS = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

/** Forma de envio da venda: o envio do painel de fretes; sem ele, a transportadora do pedido; sem ela, a modalidade do frete. */
export function envioDaVenda(
  p: { modalidade_frete?: number | null; codigo_rastreio?: string | null; numero_externo?: string | null; enviado_em?: string | null; transportadora?: TransportadoraVenda | null },
  envios: EnvioVenda[] = [], nf?: string | null,
): Envio {
  const envio = envios.filter((e) => e.status !== "cancelado").sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
  // a transportadora vem junto da consulta (relação de um para um); sem nome, é como se não houvesse
  const t0 = envio?.transportadora ?? p.transportadora ?? null;
  const t = t0 && !Array.isArray(t0) && t0.nome ? t0 : null;
  const rastreio = envio?.codigo_rastreio?.trim() || p.codigo_rastreio?.trim() || null;
  const link = rastreio && t?.rastreio_url ? linkRastreio(t.rastreio_url, { codigo: rastreio, nf }) : null;
  const andamento = envio?.entregue_em ? `Entregue ${dm(envio.entregue_em)}`
    : envio?.status === "entregue" ? "Entregue"
    : envio?.coletado_em || envio?.status === "transito" ? "Em trânsito"
    : p.enviado_em ? `Enviado ${dm(p.enviado_em)}` : null;
  const base = { rastreio, link, andamento, entregue: !!envio?.entregue_em || envio?.status === "entregue" };
  if (t) return { ...base, tipo: t.tipo ?? "transportadora", rotulo: envio?.transportadora_nome?.trim() || nomeCurto({ nome: t.nome, nome_fantasia: t.nome_fantasia ?? null }) };
  if (envio?.transportadora_nome?.trim()) return { ...base, tipo: "transportadora", rotulo: envio.transportadora_nome.trim() };
  if (rastreio) return CORREIOS.test(rastreio) ? { ...base, tipo: "correios", rotulo: "Correios" } : { ...base, tipo: "transportadora", rotulo: "Enviado" };
  const m = Number(p.modalidade_frete ?? 9);
  if (m === 3 || m === 4) return { ...base, tipo: "proprio", rotulo: "Transporte próprio" };
  if (m === 9) return p.numero_externo ? { ...base, tipo: "nao_informado", rotulo: "Não informado" } : { ...base, tipo: "sem_frete", rotulo: "Sem frete / retira" };
  return { ...base, tipo: "a_definir", rotulo: "Frete a definir" };
}

/** Sinais do que já foi feito na venda (como os ícones de integração do Tiny). */
export function sinaisDaVenda(p: { estoque_baixado?: boolean | null; proposta_enviada_em?: string | null; notas?: { status: string; ambiente?: string | null }[] | null }, contas: ContaVenda[]) {
  return {
    estoque: !!p.estoque_baixado,
    contas: contas.length > 0,
    nfe: (p.notas ?? []).some((n) => n.status === "autorizada" && n.ambiente !== "homologacao"),
    proposta: !!p.proposta_enviada_em,
  };
}

/** Banco (conta bancária) em que a venda foi recebida: o das contas pagas; mais de um banco vem juntos ("Inter SC + Olist"). */
export function bancoDaVenda(contas: ContaVenda[], nomes: Map<string, string>): string | null {
  const bancos = [...new Set(contas.filter((c) => (c.status === "pago" || num(c.valor_pago) > 0) && c.conta_bancaria_id)
    .map((c) => nomes.get(c.conta_bancaria_id!) ?? "").filter(Boolean))];
  return bancos.length ? bancos.join(" + ") : null;
}
