// Vendas em quadro (Kanban): uma coluna por passo da venda — 1 orçamento, 2 aprovado, 3 faturado, 4 entregue — e os
// cancelados à parte. Cada coluna tem a sua cor, diz o que é e o que fazer; no topo, abas coloridas com quantas vendas e
// quanto em cada passo (tocar leva à coluna). No celular as colunas deslizam para o lado. Tocar no cartão abre a venda
// (as mudanças de situação continuam dentro dela: aprovar, emitir a NF-e, entregar). Respeita a busca e os filtros da
// lista; entregues e cancelados mostram os mais novos e o resto fica na lista.
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { EtiquetaUnidade } from "@/lib/unidade";
import { brl, dataBR } from "@/lib/format";
import type { Pedido } from "@/lib/types";

export type ColunaVenda = "orcamento" | "aprovado" | "faturado" | "entregue" | "cancelado";

export const COLUNAS_VENDA: {
  id: ColunaVenda; passo: number | null; rotulo: string; explica: string; fazer: string; fundo: string; tinta: string; cor: string; corpo: string;
}[] = [
  { id: "orcamento", passo: 1, rotulo: "Orçamentos", cor: "#7c3aed", explica: "Proposta feita, esperando o cliente.", fazer: "Aprovar quando o cliente fechar.",
    fundo: "linear-gradient(135deg,#8b5cf6 0%,#7c3aed 55%,#6d28d9 100%)", tinta: "#ffffff", corpo: "bg-purple-50/50" },
  { id: "aprovado", passo: 2, rotulo: "Aprovados", cor: "#0ea5e9", explica: "O cliente fechou; falta a nota.", fazer: "Emitir a NF-e e separar.",
    fundo: "linear-gradient(135deg,#67e8f9 0%,#38bdf8 50%,#0ea5e9 100%)", tinta: "#062c43", corpo: "bg-sky-50/50" },
  { id: "faturado", passo: 3, rotulo: "Faturados", cor: "#4338ca", explica: "Nota emitida; falta chegar ao cliente.", fazer: "Despachar e marcar entregue.",
    fundo: "linear-gradient(135deg,#6366f1 0%,#4f46e5 55%,#4338ca 100%)", tinta: "#ffffff", corpo: "bg-indigo-50/50" },
  { id: "entregue", passo: 4, rotulo: "Entregues", cor: "#10b981", explica: "Chegou ao cliente.", fazer: "Conferir se o pagamento entrou.",
    fundo: "linear-gradient(135deg,#6ee7b7 0%,#34d399 45%,#10b981 100%)", tinta: "#022c1e", corpo: "bg-emerald-50/50" },
  { id: "cancelado", passo: null, rotulo: "Cancelados", cor: "#e11d48", explica: "Não vai seguir.", fazer: "Nada a fazer (o motivo fica na venda).",
    fundo: "linear-gradient(135deg,#e11d48 0%,#be123c 55%,#9f1239 100%)", tinta: "#ffffff", corpo: "bg-red-50/50" },
];

/** Quantos cartões cada coluna mostra (as vendas mais novas); o resto fica na lista. */
export const NO_QUADRO = 30;

/** Vendas de cada coluna, as mais novas primeiro, com o total e quantas ficaram de fora do quadro. */
export function colunasDoQuadro<T extends Pick<Pedido, "status" | "created_at" | "valor_total">>(vendas: T[], limite = NO_QUADRO) {
  return COLUNAS_VENDA.map((col) => {
    const todas = vendas.filter((v) => v.status === col.id).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return { ...col, lista: todas.slice(0, limite), n: todas.length, total: todas.reduce((s, v) => s + Number(v.valor_total || 0), 0), fora: Math.max(0, todas.length - limite) };
  });
}

export function KanbanVendas<T extends Pedido>({ vendas, onAbrir, onVerNaLista, extras }: {
  vendas: T[]; onAbrir: (v: T) => void; onVerNaLista: (c: ColunaVenda) => void;
  /** o que vai embaixo do valor no cartão (pagamento e envio) */
  extras?: (v: T) => ReactNode;
}) {
  const colunas = colunasDoQuadro(vendas);
  // quadro enxuto (gestão à vista): cabeçalho de uma linha, cartão com nº, cliente, valor e data — o resto fica na venda
  return (
    <div className="relative -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 md:mx-0 md:snap-none md:px-0" aria-label="Quadro das vendas">
      {colunas.map((col) => (
        <section key={col.id} id={`coluna-venda-${col.id}`} aria-label={col.rotulo}
          className="flex w-[80vw] max-w-[300px] shrink-0 snap-center scroll-ml-3 flex-col rounded-xl bg-slate-50 sm:w-[250px]">
          <header className="flex items-center gap-2 px-3 pb-1 pt-2.5" title={`${col.explica} ${col.fazer}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.cor }} aria-hidden />
            <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{col.rotulo}</h3>
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-slate-600">{col.n}</span>
          </header>
          <p className="num px-3 pb-2 text-xs text-slate-500">{brl(col.total)}</p>
          <div className="flex min-h-[80px] flex-col gap-1.5 px-2 pb-2">
            {col.lista.map((v) => (
              <button key={v.id} type="button" onClick={() => onAbrir(v)} style={{ borderLeftColor: col.cor }}
                className="rounded-lg border border-l-[3px] border-slate-200 bg-surface px-2.5 py-2 text-left shadow-sm transition hover:shadow-card active:bg-slate-50">
                <span className="block truncate text-sm font-semibold text-fg" title={v.cliente?.nome ?? undefined}>
                  <span className="text-slate-500">#{v.numero}</span> {v.cliente?.nome ?? "—"}
                </span>
                {/* celular: pagamento e envio numa linha própria embaixo (ao lado do valor ficavam espremidos, letra por linha) */}
                <span className="mt-1 flex items-center gap-1.5 max-md:flex-wrap">
                  <EtiquetaUnidade id={(v as any).unidade_id} />
                  {extras && <span className="flex min-w-0 items-center gap-1 overflow-hidden max-md:order-last max-md:w-full max-md:flex-wrap">{extras(v)}</span>}
                  <span className="num ml-auto whitespace-nowrap text-sm font-bold text-fg">{brl(v.valor_total)}</span>
                  <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-bold text-white" style={{ background: col.cor }}>
                    {dataBR(v.created_at).slice(0, 5)}
                  </span>
                </span>
              </button>
            ))}
            {!col.n && <p className="px-1 py-4 text-center text-xs text-slate-500">Nada aqui</p>}
            {col.fora > 0 && (
              <button type="button" onClick={() => onVerNaLista(col.id)} className="link-acao inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs">
                Mais {col.fora} na lista <ChevronRight size={14} aria-hidden />
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
