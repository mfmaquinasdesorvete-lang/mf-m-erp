// Quanto custou montar cada unidade: as peças consumidas pela OP com o custo de cada uma.
// Na OP concluída vem do que o banco guardou na conclusão (op_custos, custo do dia); na OP aberta é a previsão
// pela ficha técnica com o custo de hoje (mesma regra da baixa: todos os níveis, kit pelas peças dele).
import { consumoEstrutura, type LinhaFicha } from "./estrutura";
import type { KitComponente } from "./types";

export type LinhaCustoOp = { componente_id?: string | null; descricao: string; quantidade: number; custo_unitario: number };
export type PecaCustoOp = LinhaCustoOp & {
  /** quantidade e custo em cada unidade produzida */
  porUnidade: number; custoPorUnidade: number;
  /** custo da peça na OP inteira e a parte dela no custo */
  total: number; parte: number;
};
export type ResumoCustoOp = { total: number; porUnidade: number; pecas: PecaCustoOp[]; semCusto: number };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Total da OP, custo de cada unidade e as peças da mais cara para a mais barata. */
export function resumoCustoOp(linhas: LinhaCustoOp[], quantidadeOp: number): ResumoCustoOp {
  const n = Number(quantidadeOp) > 0 ? Number(quantidadeOp) : 1;
  const comTotal = linhas
    .filter((l) => Number(l.quantidade) > 0)
    .map((l) => ({ ...l, quantidade: Number(l.quantidade), custo_unitario: Number(l.custo_unitario) || 0, total: Number(l.quantidade) * (Number(l.custo_unitario) || 0) }));
  const total = comTotal.reduce((s, l) => s + l.total, 0);
  const pecas = comTotal
    .map((l) => ({ ...l, porUnidade: l.quantidade / n, custoPorUnidade: l.total / n, parte: total > 0 ? l.total / total : 0, total: l.total }))
    .sort((a, b) => b.total - a.total || a.descricao.localeCompare(b.descricao, "pt-BR"));
  return { total: r2(total), porUnidade: r2(total / n), pecas, semCusto: pecas.filter((p) => !p.custo_unitario).length };
}

/** Previsão para a OP aberta: as peças da ficha técnica para `quantidade` unidades com o custo de hoje. */
export function previsaoCustoOp(
  fichas: LinhaFicha[],
  produtos: { id: string; descricao: string; preco_custo?: number | null; subconjunto_estocado?: boolean | null }[],
  produtoId: string, quantidade: number, kits: KitComponente[] = [],
): LinhaCustoOp[] {
  return [...consumoEstrutura(fichas, produtos, produtoId, Number(quantidade) > 0 ? Number(quantidade) : 1, kits)].map(([id, q]) => {
    const p = produtos.find((x) => x.id === id);
    return { componente_id: id, descricao: p?.descricao ?? "Peça sem cadastro", quantidade: q, custo_unitario: Number(p?.preco_custo ?? 0) };
  });
}
