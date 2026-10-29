// Recibos da equipe agrupados por pessoa (Funcionários → Recibos, pedido de 29/10): um cartão por pessoa, em vez de
// uma lista só. A pessoa é a outra ponta do recibo (quem recebeu no pagamento); o nome é comparado sem acento.
import { normalizarNome } from "./pastaFuncionario";

type ReciboBase = { tipo: string; recebedor_nome: string; pagador_nome: string; valor: number | string; data_pagamento: string; cancelado_em?: string | null };

export const pessoaDoRecibo = (r: ReciboBase) => (r.tipo === "pagamento" ? r.recebedor_nome : r.pagador_nome).trim();
export const chavePessoa = (nome: string) => normalizarNome(nome);

export type GrupoPessoa = { chave: string; nome: string; qtd: number; total: number; ultimo: string };

/** Um grupo por pessoa: quantos recibos, o total (sem os cancelados, em centavos) e a data do último; o mais recente primeiro. */
export function recibosPorPessoa(recibos: ReciboBase[]): GrupoPessoa[] {
  const m = new Map<string, GrupoPessoa & { centavos: number }>();
  for (const r of recibos) {
    const nome = pessoaDoRecibo(r);
    const chave = chavePessoa(nome);
    const g = m.get(chave) ?? { chave, nome, qtd: 0, total: 0, centavos: 0, ultimo: "" };
    g.qtd++;
    if (!r.cancelado_em) g.centavos += Math.round(Number(r.valor) * 100);
    if (r.data_pagamento > g.ultimo) g.ultimo = r.data_pagamento;
    m.set(chave, g);
  }
  return [...m.values()]
    .map(({ centavos, ...g }) => ({ ...g, total: centavos / 100 }))
    .sort((a, b) => b.ultimo.localeCompare(a.ultimo) || a.nome.localeCompare(b.nome));
}
