// Extratos recebidos (aba Extratos do painel pessoal): conta por conta, de quais meses já chegou o extrato do banco
// (PDF, arquivo OFX/CSV ou Meu Pluggy), quais têm só lançamentos digitados e quais estão faltando.
import { origemDo } from "@/lib/pessoalCards";
import type { ContaPessoal, LancPessoal } from "@/lib/pessoal";

export type Origem = "pdf" | "arquivo" | "pluggy" | "digitado";
export type SituacaoMes = "extrato" | "digitado" | "falta";
export type MesExtrato = {
  mes: string; situacao: SituacaoMes; qtd: number;
  /** primeiro e último dia com lançamento no mês */
  de: string | null; ate: string | null;
  origens: Origem[];
  /** o último extrato que chegou para no meio de um mês que já acabou (faltam os dias do fim) */
  parcial: boolean;
};
export type ExtratoConta = { conta: ContaPessoal; meses: MesExtrato[]; faltam: string[]; parciais: string[]; ultimo: string | null };

const somarMes = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const ultimoDia = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();

/** Meses do primeiro lançamento da conta até o mês de hoje (no máximo 60). */
export function extratosRecebidos(contas: ContaPessoal[], lancs: LancPessoal[], hoje: string): ExtratoConta[] {
  const mesHoje = hoje.slice(0, 7);
  return contas.map((conta) => {
    const daConta = lancs.filter((l) => l.conta_id === conta.id && !l.anulado && l.situacao === "realizado" && l.data <= hoje);
    const porMes = new Map<string, LancPessoal[]>();
    for (const l of daConta) porMes.set(l.data.slice(0, 7), [...(porMes.get(l.data.slice(0, 7)) ?? []), l]);
    const primeiro = [...porMes.keys()].sort()[0];
    if (!primeiro) return { conta, meses: [], faltam: [], parciais: [], ultimo: null };
    let inicio = primeiro;
    if (somarMes(mesHoje, -59) > inicio) inicio = somarMes(mesHoje, -59);
    const meses: MesExtrato[] = [];
    for (let m = inicio; m <= mesHoje; m = somarMes(m, 1)) {
      const ls = porMes.get(m) ?? [];
      const origens = [...new Set(ls.map((l) => origemDo(l) as Origem))];
      const doBanco = ls.filter((l) => origemDo(l) !== "digitado");
      const dias = doBanco.map((l) => l.data).sort();
      const de = dias[0] ?? null, ate = dias[dias.length - 1] ?? null;
      meses.push({ mes: m, situacao: doBanco.length ? "extrato" : ls.length ? "digitado" : "falta", qtd: ls.length, de, ate, origens, parcial: false });
    }
    // só dá para saber que faltam dias no fim do último extrato (nos outros meses, dia sem lançamento é normal)
    const ultimoExtrato = [...meses].reverse().find((x) => x.situacao === "extrato");
    if (ultimoExtrato?.ate && ultimoExtrato.mes < mesHoje && Number(ultimoExtrato.ate.slice(8)) < ultimoDia(ultimoExtrato.mes) - 4) ultimoExtrato.parcial = true;
    // o mês de hoje sem nada ainda não é falta (o extrato do mês sai depois)
    const faltam = meses.filter((x) => x.situacao !== "extrato" && x.mes < mesHoje).map((x) => x.mes);
    const parciais = meses.filter((x) => x.situacao === "extrato" && x.parcial).map((x) => x.mes);
    const ultimo = daConta.filter((l) => origemDo(l) !== "digitado").reduce<string | null>((u, l) => (!u || l.data > u ? l.data : u), null);
    return { conta, meses, faltam, parciais, ultimo };
  });
}
