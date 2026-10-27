// Relatório de vendas do período para imprimir (pedido de 27/10): todas as vendas, o total, o lucro e o gráfico por dia.
// Venda = aprovada, faturada ou entregue (orçamento e cancelada ficam fora). Lucro = total − frete − custo dos itens
// (custo do cadastro do produto); item sem custo conta como custo zero e o relatório avisa quantos são.
import { diaLocal, noPeriodo, type Periodo } from "./filtroLista";

export const STATUS_VENDA = ["aprovado", "faturado", "entregue"] as const;

export type VendaRel = {
  numero: number; created_at: string; status: string; cliente: string; vendedor: string | null;
  valor_total: number; frete: number; itens: { produto_id: string | null; quantidade: number }[];
};

export type LinhaRelVenda = { numero: number; dia: string; cliente: string; vendedor: string; status: string; total: number; custo: number; lucro: number; semCusto: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumoVendas(vendas: VendaRel[], periodo: Periodo, custoDe: (produtoId: string) => number | null) {
  const linhas: LinhaRelVenda[] = vendas
    .filter((v) => (STATUS_VENDA as readonly string[]).includes(v.status) && noPeriodo(v.created_at, periodo))
    .map((v) => {
      let custo = 0, semCusto = 0;
      for (const i of v.itens) {
        const c = i.produto_id ? custoDe(i.produto_id) : null;
        if (c == null || c <= 0) semCusto++;
        else custo += c * Number(i.quantidade || 0);
      }
      const total = Number(v.valor_total || 0);
      return { numero: v.numero, dia: diaLocal(v.created_at), cliente: v.cliente, vendedor: v.vendedor ?? "", status: v.status,
        total: r2(total), custo: r2(custo), lucro: r2(total - Number(v.frete || 0) - custo), semCusto };
    })
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.numero - b.numero);

  const soma = (f: (l: LinhaRelVenda) => number) => r2(linhas.reduce((s, l) => s + f(l), 0));
  const total = soma((l) => l.total);
  const lucro = soma((l) => l.lucro);
  const porDia = new Map<string, number>();
  for (const l of linhas) porDia.set(l.dia, r2((porDia.get(l.dia) ?? 0) + l.total));
  const porVendedor = new Map<string, { qtd: number; total: number }>();
  for (const l of linhas) {
    const k = l.vendedor || "Sem vendedor";
    const x = porVendedor.get(k) ?? { qtd: 0, total: 0 };
    porVendedor.set(k, { qtd: x.qtd + 1, total: r2(x.total + l.total) });
  }
  return {
    linhas, total, lucro, custo: soma((l) => l.custo), frete: soma((l) => l.total - l.lucro - l.custo),
    qtd: linhas.length, ticket: linhas.length ? r2(total / linhas.length) : 0,
    margem: total > 0 ? Math.round((lucro / total) * 1000) / 10 : 0,
    itensSemCusto: linhas.reduce((s, l) => s + l.semCusto, 0),
    porDia: [...porDia].map(([dia, valor]) => ({ dia, valor })),
    porVendedor: [...porVendedor].map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.total - a.total),
  };
}
export type ResumoVendas = ReturnType<typeof resumoVendas>;
