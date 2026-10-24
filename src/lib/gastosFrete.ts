// Gastos com frete (Fretes → Gastos com frete): o que a MF gastou com transportadora no ano, mês a mês e por
// transportadora, juntando três fontes sem contar duas vezes:
//  1. contas a pagar de frete (categoria "frete", ou descrição de frete/CT-e/transporte): o gasto lançado;
//  2. CT-e em que a MF paga o frete e que ainda não viraram conta (sem fatura): gasto que falta lançar. Só a partir de
//     INICIO_FATURAS_CTE: antes disso o frete foi pago pelas contas importadas (Tiny), e o CT-e (que veio da planilha ou
//     do e-mail) entra só na contagem e no valor "CT-e MF paga", sem somar no total;
//  3. pagamentos no extrato para transportadoras sem conta ligada: pago no banco e não lançado.

export type ContaFrete = { id: string; data: string | null; valor: number | string; status: string; fornecedor: string | null; descricao: string | null };
export type CteFrete = { id: string; emissao: string | null; valor: number | string | null; mf_paga: boolean | null; fatura_id: string | null; transportadora: string | null; situacao?: string | null };
export type ExtratoFrete = { id: string; data: string; valor: number | string; descricao: string | null; conta_pagar_id: string | null };

export type MesGasto = { mes: string; contas: number; contas_pagas: number; ctes_mf_paga: number; ctes_sem_conta: number; qtd_ctes: number; banco_sem_conta: number; total: number };

/** Desde quando o CT-e vira conta pelo ERP (faturas de CT-e); antes, o frete está nas contas importadas. */
export const INICIO_FATURAS_CTE = "2026-10-01";
const faltaLancar = (c: CteFrete) => !!c.mf_paga && !c.fatura_id && (c.emissao ?? "") >= INICIO_FATURAS_CTE;

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Transportadora que aparece na descrição do extrato (Pix, TED, boleto). */
export const TRANSPORTADORA_NO_EXTRATO = /(rodonaves|\brte\b|braspress|s[aã]o miguel|jadlog|loggi|correios|aceville|norte brasil|patrus|jamef|translovato|alfa transp|mir transp|tecmar|plimor|tw transp|melhor envio|frenet|buslog|total express|azul cargo|latam cargo|transportes?\b|transportadora|log[ií]stica)/i;

export function gastosPorMes(ano: number, contas: ContaFrete[], ctes: CteFrete[], extrato: ExtratoFrete[]): MesGasto[] {
  const meses = new Map<string, MesGasto>();
  for (let m = 1; m <= 12; m++) {
    const mes = `${ano}-${String(m).padStart(2, "0")}`;
    meses.set(mes, { mes, contas: 0, contas_pagas: 0, ctes_mf_paga: 0, ctes_sem_conta: 0, qtd_ctes: 0, banco_sem_conta: 0, total: 0 });
  }
  const em = (d: string | null | undefined) => (d ? meses.get(d.slice(0, 7)) : undefined);
  for (const c of contas) {
    const m = em(c.data);
    if (!m || c.status === "cancelado") continue;
    m.contas += n(c.valor);
    if (c.status === "pago") m.contas_pagas += n(c.valor);
  }
  for (const c of ctes) {
    const m = em(c.emissao);
    if (!m || c.situacao === "cancelado") continue;
    m.qtd_ctes++;
    if (c.mf_paga) m.ctes_mf_paga += n(c.valor);
    if (faltaLancar(c)) m.ctes_sem_conta += n(c.valor);
  }
  for (const e of extrato) {
    const m = em(e.data);
    if (!m || e.conta_pagar_id || n(e.valor) >= 0 || !TRANSPORTADORA_NO_EXTRATO.test(e.descricao ?? "")) continue;
    m.banco_sem_conta += -n(e.valor);
  }
  return [...meses.values()].map((m) => {
    const x = { ...m, contas: r2(m.contas), contas_pagas: r2(m.contas_pagas), ctes_mf_paga: r2(m.ctes_mf_paga), ctes_sem_conta: r2(m.ctes_sem_conta), banco_sem_conta: r2(m.banco_sem_conta) };
    return { ...x, total: r2(x.contas + x.ctes_sem_conta + x.banco_sem_conta) };
  });
}

/** Por transportadora (ou fornecedor da conta), da que mais gastou: contas lançadas + CT-e sem conta. */
export function gastosPorTransportadora(contas: ContaFrete[], ctes: CteFrete[]) {
  const t = new Map<string, { nome: string; contas: number; ctes_sem_conta: number; qtd_ctes: number }>();
  const pegar = (nome: string | null) => {
    const k = (nome ?? "Sem nome").trim() || "Sem nome";
    if (!t.has(k.toLowerCase())) t.set(k.toLowerCase(), { nome: k, contas: 0, ctes_sem_conta: 0, qtd_ctes: 0 });
    return t.get(k.toLowerCase())!;
  };
  for (const c of contas) if (c.status !== "cancelado") pegar(c.fornecedor).contas += n(c.valor);
  for (const c of ctes) {
    if (c.situacao === "cancelado") continue;
    const x = pegar(c.transportadora);
    x.qtd_ctes++;
    if (faltaLancar(c)) x.ctes_sem_conta += n(c.valor);
  }
  return [...t.values()].map((x) => ({ ...x, contas: r2(x.contas), ctes_sem_conta: r2(x.ctes_sem_conta), total: r2(x.contas + x.ctes_sem_conta) }))
    .sort((a, b) => b.total - a.total);
}
