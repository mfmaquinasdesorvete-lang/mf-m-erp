// Conciliação: sugestão de par para cada linha pendente do extrato (conta a receber/pagar com o mesmo valor,
// data próxima e nome parecido, ou a outra ponta de uma transferência entre contas da empresa), para aprovar
// de uma vez. Linha sem nenhum par possível fica como "divergente".

export type LinhaExtrato = { id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; status: string; conta_receber_id?: string | null; conta_pagar_id?: string | null };
export type ContaPar = {
  id: string; descricao: string; valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  unidade_id: string | null; conta_bancaria_id: string | null; cliente?: { nome: string } | null; fornecedor?: { nome: string } | null;
};
export type Sugestao =
  | { tipo: "receber" | "pagar"; contaId: string; rotulo: string; pontos: number }
  | { tipo: "transferencia"; parId: string; rotulo: string; pontos: number };

export const palavras = (s: string) => new Set(s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const dias = (a: string, b: string) => Math.abs((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 864e5);

/** Pontos de uma conta para a linha: valor igual vale 100, data próxima até 30, cada palavra em comum 15. */
export function pontuar(l: LinhaExtrato, c: ContaPar) {
  const valor = Number(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor);
  const ref = c.status === "pago" ? c.data_pagamento ?? c.vencimento : c.vencimento;
  const comuns = [...palavras(`${c.descricao} ${c.cliente?.nome ?? ""} ${c.fornecedor?.nome ?? ""}`)].filter((w) => palavras(l.descricao ?? "").has(w)).length;
  return { valor, ref, pontos: (Math.abs(valor - Math.abs(Number(l.valor))) < 0.01 ? 100 : 0) + Math.max(0, 30 - dias(ref, l.data)) + comuns * 15, comuns };
}

/**
 * Sugestões para as linhas pendentes. Só sugere quando o valor bate, a data está a até 15 dias (ou o nome bate)
 * e não há empate com outra conta; cada conta e cada linha entram em uma sugestão só (as de mais pontos primeiro).
 */
export function sugerir(linhas: LinhaExtrato[], receber: ContaPar[], pagar: ContaPar[], unidadeDaConta: Map<string, string | null>) {
  const ligadas = new Set(linhas.filter((l) => l.status === "conciliado").flatMap((l) => [l.conta_receber_id, l.conta_pagar_id]).filter(Boolean) as string[]);
  const pendentes = linhas.filter((l) => l.status === "pendente");
  const candidatos: { linha: string; s: Sugestao; segundo: number }[] = [];
  const semPar = new Set<string>();
  for (const l of pendentes) {
    const entrada = Number(l.valor) > 0;
    const unidade = unidadeDaConta.get(l.conta_bancaria_id) ?? null;
    const lista = (entrada ? receber : pagar)
      .filter((c) => c.status !== "cancelado" && !ligadas.has(c.id) && (!unidade || c.unidade_id === unidade))
      .filter((c) => c.status === "aberto" || !c.conta_bancaria_id || c.conta_bancaria_id === l.conta_bancaria_id)
      .map((c) => ({ c, ...pontuar(l, c) }))
      .filter((x) => Math.abs(x.valor - Math.abs(Number(l.valor))) < 0.01 && (dias(x.ref, l.data) <= 15 || x.comuns > 0))
      .sort((a, b) => b.pontos - a.pontos);
    // transferência: a mesma quantia ao contrário, em outra conta da empresa, até 3 dias de diferença
    const par = pendentes.find((o) => o.id !== l.id && o.conta_bancaria_id !== l.conta_bancaria_id && Math.abs(Number(o.valor) + Number(l.valor)) < 0.01 && dias(o.data, l.data) <= 3);
    if (par) candidatos.push({ linha: l.id, s: { tipo: "transferencia", parId: par.id, rotulo: "Transferência entre contas da empresa", pontos: 140 - dias(par.data, l.data) }, segundo: 0 });
    if (lista.length) {
      const [a, b] = lista;
      candidatos.push({ linha: l.id, s: { tipo: entrada ? "receber" : "pagar", contaId: a.c.id, rotulo: `${a.c.descricao}${a.c.cliente ? ` · ${a.c.cliente.nome}` : a.c.fornecedor ? ` · ${a.c.fornecedor.nome}` : ""}`, pontos: a.pontos }, segundo: b?.pontos ?? 0 });
    }
    if (!par && !lista.length) semPar.add(l.id);
  }
  // empate (duas contas iguais com pontos parecidos): não sugere, deixa para a pessoa escolher
  const validos = candidatos.filter((x) => x.s.pontos - x.segundo >= 10).sort((a, b) => b.s.pontos - a.s.pontos);
  const usadas = new Set<string>(), linhasUsadas = new Set<string>();
  const out = new Map<string, Sugestao>();
  for (const { linha, s } of validos) {
    const alvo = s.tipo === "transferencia" ? s.parId : s.contaId;
    if (linhasUsadas.has(linha) || usadas.has(alvo)) continue;
    out.set(linha, s);
    linhasUsadas.add(linha); usadas.add(alvo);
    if (s.tipo === "transferencia") linhasUsadas.add(s.parId); // a outra ponta vai junto
  }
  return { sugestoes: out, divergentes: semPar };
}
