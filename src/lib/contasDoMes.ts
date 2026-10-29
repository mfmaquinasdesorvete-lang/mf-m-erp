// Contas do mês do painel pessoal: as que voltam todo mês (ex.: o DAS de um MEI, que vence no dia 20 e se refere ao
// mês anterior). Para cada conta, os meses desde que ela começou: pago, atrasado, vencendo (dentro dos dias de aviso)
// ou ainda longe. O mês guardado no pagamento é o mês a que a conta se refere (a competência).

export type ContaMensal = {
  id: string; nome: string; dia_vencimento: number;
  /** a conta que vence neste mês se refere ao mês anterior (DAS, impostos) */
  mes_anterior: boolean;
  valor: number | null; conta_id: string | null; avisar_dias: number; observacao: string | null;
  /** primeiro mês (competência) acompanhado, "AAAA-MM" */
  desde: string | null; ativa: boolean; ordem: number; criado_em?: string;
};
export type PagoMensal = {
  id: string; mensal_id: string; mes: string; pago_em: string; valor: number | null; comprovante: string | null;
  lancamento_id: string | null; anulado: boolean;
};
export type Situacao = "pago" | "atrasado" | "vencendo" | "em_dia";
export type ItemDoMes = { conta: ContaMensal; mes: string; vencimento: string; situacao: Situacao; dias: number; pago: PagoMensal | null };

export const somarMes = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const ultimoDia = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86400000);

/** Vencimento da conta de uma competência: o dia escolhido no próprio mês, ou no seguinte se ela se refere ao mês anterior. */
export function vencimentoDe(c: Pick<ContaMensal, "dia_vencimento" | "mes_anterior">, mes: string) {
  const ym = c.mes_anterior ? somarMes(mes, 1) : mes;
  return `${ym}-${String(Math.min(c.dia_vencimento, ultimoDia(ym))).padStart(2, "0")}`;
}

/**
 * Os meses de cada conta ativa, do primeiro acompanhado até o que vence no mês de hoje (no máximo os 12 últimos),
 * do mais urgente ao mais tranquilo. Os pagos ficam no fim.
 */
export function contasDoMes(contas: ContaMensal[], pagos: PagoMensal[], hoje: string): ItemDoMes[] {
  const mesHoje = hoje.slice(0, 7);
  const itens: ItemDoMes[] = [];
  for (const c of contas.filter((x) => x.ativa)) {
    // a competência que vence no mês de hoje
    const ultima = c.mes_anterior ? somarMes(mesHoje, -1) : mesHoje;
    let mes = c.desde ?? (c.criado_em ? (c.mes_anterior ? somarMes(c.criado_em.slice(0, 7), -1) : c.criado_em.slice(0, 7)) : ultima);
    if (mes < somarMes(ultima, -11)) mes = somarMes(ultima, -11);
    for (; mes <= ultima; mes = somarMes(mes, 1)) {
      const vencimento = vencimentoDe(c, mes);
      const pago = pagos.find((p) => p.mensal_id === c.id && p.mes === mes && !p.anulado) ?? null;
      const dias = diasEntre(hoje, vencimento);
      const situacao: Situacao = pago ? "pago" : dias < 0 ? "atrasado" : dias <= c.avisar_dias ? "vencendo" : "em_dia";
      itens.push({ conta: c, mes, vencimento, situacao, dias, pago });
    }
  }
  const peso: Record<Situacao, number> = { atrasado: 0, vencendo: 1, em_dia: 2, pago: 3 };
  return itens.sort((a, b) => peso[a.situacao] - peso[b.situacao] || a.vencimento.localeCompare(b.vencimento));
}

/**
 * O próximo mês da conta quando não há nada em aberto: o seguinte ao último que apareceu (pago); sem nenhum, o mês
 * "desde" (que ainda não venceu) ou, sem ele, a competência que vence no mês de hoje.
 */
export function proximoMes(c: ContaMensal, itens: ItemDoMes[], hoje: string): { mes: string; vencimento: string } {
  const ultimo = itens.filter((i) => i.conta.id === c.id).reduce((m, i) => (i.mes > m ? i.mes : m), "");
  const atual = c.mes_anterior ? somarMes(hoje.slice(0, 7), -1) : hoje.slice(0, 7);
  const mes = ultimo ? somarMes(ultimo, 1) : c.desde && c.desde > atual ? c.desde : atual;
  return { mes, vencimento: vencimentoDe(c, mes) };
}

/** O que avisar agora: atrasado ou vencendo dentro dos dias de aviso. */
export const paraAvisar = (itens: ItemDoMes[]) => itens.filter((i) => i.situacao === "atrasado" || i.situacao === "vencendo");

export function textoPrazo(i: Pick<ItemDoMes, "situacao" | "dias">) {
  if (i.situacao === "pago") return "pago";
  if (i.dias < 0) return `atrasado há ${-i.dias} ${-i.dias === 1 ? "dia" : "dias"}`;
  if (i.dias === 0) return "vence hoje";
  if (i.dias === 1) return "vence amanhã";
  return `vence em ${i.dias} dias`;
}
