// Régua de cobrança no site: a fila do dia para mandar pelo WhatsApp (a etapa mais recente de cada conta que
// ainda não foi enviada), a situação dos clientes (em dia, a vencer, atrasados) e o Pix de cada conta.
export { normalizarChavePix, pixCopiaECola, preencherMensagem, VARIAVEIS_COBRANCA } from "../../supabase/functions/_shared/cobranca";
import { pixCopiaECola } from "../../supabase/functions/_shared/cobranca";

export type Etapa = {
  id: string; evento: "criacao" | "vencimento" | "pagamento"; dias: number; nome: string; canal_email: boolean; canal_whatsapp: boolean;
  assunto: string; mensagem: string; ativo: boolean; ordem: number;
};
export type ContaCobranca = {
  id: string; cliente_id: string | null; descricao: string; valor: number; valor_pago?: number | null; vencimento: string; status: string;
  data_pagamento?: string | null; created_at?: string; unidade_id?: string | null;
};
export type Envio = { conta_receber_id: string; etapa_id: string; canal: string };

const somar = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10) + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** Dia em que a etapa vale para a conta (null se a etapa não se aplica a ela). */
export function dataDaEtapa(e: Etapa, c: ContaCobranca): string | null {
  if (e.evento === "vencimento") return c.status === "aberto" ? somar(c.vencimento, e.dias) : null;
  if (e.evento === "criacao") return c.status === "aberto" && c.created_at ? c.created_at.slice(0, 10) : null;
  return c.status === "pago" && c.data_pagamento ? c.data_pagamento.slice(0, 10) : null;
}

/**
 * Fila do WhatsApp: etapas ativas com WhatsApp cujo dia caiu entre `janela` dias atrás e hoje, ainda não enviadas
 * nem puladas. De cada conta fica só a etapa mais recente (não manda o lembrete de ontem e a cobrança de hoje juntos).
 */
export function filaCobranca<C extends ContaCobranca>(contas: C[], etapas: Etapa[], envios: Envio[], hoje: string, janela = 3) {
  const feitos = new Set(envios.filter((e) => e.canal === "whatsapp").map((e) => `${e.conta_receber_id}|${e.etapa_id}`));
  const ativas = etapas.filter((e) => e.ativo && e.canal_whatsapp);
  const desde = somar(hoje, -janela);
  const porConta = new Map<string, { conta: C; etapa: Etapa; data: string }>();
  for (const c of contas) {
    if (!c.cliente_id) continue;
    for (const e of ativas) {
      const d = dataDaEtapa(e, c);
      if (!d || d < desde || d > hoje || feitos.has(`${c.id}|${e.id}`)) continue;
      const atual = porConta.get(c.id);
      if (!atual || d > atual.data || (d === atual.data && e.dias > atual.etapa.dias)) porConta.set(c.id, { conta: c, etapa: e, data: d });
    }
  }
  return [...porConta.values()].sort((a, b) => a.etapa.ordem - b.etapa.ordem || a.conta.vencimento.localeCompare(b.conta.vencimento));
}

/** Clientes com conta nos últimos 12 meses: atrasados (alguma vencida), a vencer (vence em até 7 dias) e em dia. */
export function situacaoClientes(contas: ContaCobranca[], hoje: string) {
  const corte = somar(hoje, -365), semana = somar(hoje, 7);
  const sit = new Map<string, "atrasado" | "a_vencer" | "em_dia">();
  const peso = { em_dia: 0, a_vencer: 1, atrasado: 2 };
  for (const c of contas) {
    if (!c.cliente_id || c.status === "cancelado" || c.vencimento < corte) continue;
    const s = c.status === "aberto" && c.vencimento < hoje ? "atrasado" : c.status === "aberto" && c.vencimento <= semana ? "a_vencer" : "em_dia";
    const atual = sit.get(c.cliente_id);
    if (!atual || peso[s] > peso[atual]) sit.set(c.cliente_id, s);
  }
  const lista = [...sit.values()];
  return { em_dia: lista.filter((s) => s === "em_dia").length, a_vencer: lista.filter((s) => s === "a_vencer").length, atrasado: lista.filter((s) => s === "atrasado").length, porCliente: sit };
}

export type PixUnidade = { pix_chave?: string | null; pix_nome?: string | null; pix_cidade?: string | null; razao_social?: string | null; nome?: string; municipio?: string | null };

/** Pix copia e cola de uma conta (com valor e o identificador da conta), se a unidade tiver chave Pix. */
export function pixDaConta(u: PixUnidade | null | undefined, valor: number, contaId: string) {
  if (!u?.pix_chave?.trim()) return null;
  return pixCopiaECola({ chave: u.pix_chave, nome: u.pix_nome || u.razao_social || u.nome || "", cidade: u.pix_cidade || u.municipio || "", valor, txid: `MF${contaId.replace(/-/g, "").slice(0, 20)}` });
}

/** Faixas de atraso do painel de cobrança (dias depois do vencimento). */
export const FAIXAS_ATRASO = [
  { rotulo: "1 a 15 dias", ate: 15 }, { rotulo: "16 a 30 dias", ate: 30 }, { rotulo: "31 a 60 dias", ate: 60 },
  { rotulo: "61 a 90 dias", ate: 90 }, { rotulo: "Mais de 90 dias", ate: Infinity },
] as const;

/**
 * Números do painel de cobrança: quanto está atrasado (por faixa e por cliente), quanto vence em 7 dias, quanto entrou
 * no mês e nos últimos 6 meses, e a inadimplência (atrasado ÷ tudo o que venceu nos últimos 12 meses).
 */
export function resumoCobranca(contas: ContaCobranca[], hoje: string) {
  const semana = somar(hoje, 7), mes = hoje.slice(0, 7), corte = somar(hoje, -365);
  const dias = (d: string) => Math.round((Date.parse(hoje) - Date.parse(d.slice(0, 10))) / 864e5);
  const faixas = FAIXAS_ATRASO.map((f) => ({ rotulo: f.rotulo, valor: 0, qtd: 0 }));
  const porCliente = new Map<string, { valor: number; dias: number; contas: number }>();
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.parse(mes + "-15T12:00:00Z")); d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return { mes: d.toISOString().slice(0, 7), recebido: 0 };
  });
  let atrasado = 0, aVencer = 0, recebidoMes = 0, vencido12 = 0;
  for (const c of contas) {
    if (c.status === "cancelado") continue;
    const valor = Number(c.valor) || 0;
    if (c.status === "pago") {
      const pago = Number(c.valor_pago ?? c.valor) || 0, quando = (c.data_pagamento ?? "").slice(0, 7);
      if (quando === mes) recebidoMes += pago;
      const m = meses.find((x) => x.mes === quando);
      if (m) m.recebido += pago;
    }
    if (c.vencimento < hoje && c.vencimento >= corte) vencido12 += valor;
    if (c.status !== "aberto") continue;
    if (c.vencimento < hoje) {
      const d = dias(c.vencimento);
      atrasado += valor;
      const f = FAIXAS_ATRASO.findIndex((x) => d <= x.ate);
      faixas[f].valor += valor; faixas[f].qtd += 1;
      if (c.cliente_id) {
        const p = porCliente.get(c.cliente_id) ?? { valor: 0, dias: 0, contas: 0 };
        porCliente.set(c.cliente_id, { valor: p.valor + valor, dias: Math.max(p.dias, d), contas: p.contas + 1 });
      }
    } else if (c.vencimento <= semana) aVencer += valor;
  }
  const devedores = [...porCliente.entries()].map(([cliente_id, v]) => ({ cliente_id, ...v })).sort((a, b) => b.valor - a.valor);
  return {
    atrasado, aVencer, recebidoMes, faixas, devedores, meses,
    inadimplencia: vencido12 > 0 ? Math.round((atrasado / vencido12) * 1000) / 10 : 0,
  };
}
