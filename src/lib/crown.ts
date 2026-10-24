// Época Crown Móveis (nome antigo da MF): quem trabalhou lá, com ou sem carteira, e quanto recebeu
// (pagamentos antigos lidos de planilhas, recibos e rescisões; tabela funcionario_pagamentos).
import { registrado, desligada } from "./admissaoFuncionario";

export type TipoPagamento = "salario" | "adiantamento" | "por_fora" | "rescisao" | "decimo" | "ferias" | "outro";
export const TIPOS_PAGAMENTO: Record<TipoPagamento, string> = {
  salario: "Salário", adiantamento: "Vale / adiantamento", por_fora: "Por fora", rescisao: "Rescisão",
  decimo: "13º", ferias: "Férias", outro: "Outro",
};
export type PagamentoAntigo = { funcionario_id: string; competencia: string; tipo: TipoPagamento; valor: number };
type PessoaCrown = { id: string; vinculo: string; situacao: string; ativo: boolean; epoca_crown?: boolean | null };

/** Fica fora da equipe atual: passou pela Crown e já saiu. */
export const soDaCrown = (f: PessoaCrown) => !!f.epoca_crown && desligada(f);

const centavos = (v: number) => Math.round(v * 100) / 100;

export function resumoCrown<P extends PessoaCrown>(pessoas: P[], pagamentos: PagamentoAntigo[]) {
  const daCrown = pessoas.filter((f) => f.epoca_crown);
  const linhas = daCrown.map((f) => {
    const meus = pagamentos.filter((p) => p.funcionario_id === f.id);
    const porTipo: Partial<Record<TipoPagamento, number>> = {};
    for (const p of meus) porTipo[p.tipo] = centavos((porTipo[p.tipo] ?? 0) + Number(p.valor));
    const meses = [...new Set(meus.map((p) => p.competencia.slice(0, 7)))].sort();
    return {
      f, comCarteira: registrado(f.vinculo), total: centavos(meus.reduce((s, p) => s + Number(p.valor), 0)), porTipo,
      primeiro: meses[0] ?? null, ultimo: meses[meses.length - 1] ?? null, pagamentos: meus,
    };
  });
  return {
    linhas,
    pessoas: linhas.length,
    comCarteira: linhas.filter((l) => l.comCarteira).length,
    semCarteira: linhas.filter((l) => !l.comCarteira).length,
    total: centavos(linhas.reduce((s, l) => s + l.total, 0)),
  };
}
