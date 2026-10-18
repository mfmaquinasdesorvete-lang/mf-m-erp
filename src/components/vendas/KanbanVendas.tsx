// Vendas em quadro (Kanban): uma coluna por passo da venda — 1 orçamento, 2 aprovado, 3 faturado, 4 entregue — e os
// cancelados à parte. Cada coluna tem a sua cor, diz o que é e o que fazer; no topo, abas coloridas com quantas vendas e
// quanto em cada passo (tocar leva à coluna). No celular as colunas deslizam para o lado. Tocar no cartão abre a venda
// (as mudanças de situação continuam dentro dela: aprovar, emitir a NF-e, entregar). Respeita a busca e os filtros da
// lista; entregues e cancelados mostram os mais novos e o resto fica na lista.
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { EtiquetaUnidade } from "@/lib/unidade";
import { brl, dataBR, pl } from "@/lib/format";
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
  const irPara = (id: ColunaVenda) => document.getElementById(`coluna-venda-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  return (
    <>
      {/* abas coloridas: cada passo com quantas vendas e quanto (tocar leva à coluna) */}
      <nav aria-label="Passos da venda" className="relative -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-5 md:px-0">
        {colunas.map((col) => (
          <button key={col.id} type="button" onClick={() => irPara(col.id)} title={`${col.explica} ${col.fazer}`}
            className={`flex min-w-[9.5rem] shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop md:min-w-0 ${col.n ? "" : "opacity-55"}`}
            style={{ background: col.fundo, color: col.tinta }}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: "rgba(255,255,255,.28)" }}>{col.passo ?? "×"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold leading-tight">{col.rotulo}</span>
              <span className="num block whitespace-nowrap text-xs font-semibold opacity-90">{col.n} · {brl(col.total)}</span>
            </span>
          </button>
        ))}
      </nav>
      {/* relative: o texto só para leitor de tela (sr-only) dos cartões fica preso aqui e não alarga a página no celular */}
      <div className="relative -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 md:mx-0 md:snap-none md:px-0" aria-label="Quadro das vendas">
        {colunas.map((col) => (
          <section key={col.id} id={`coluna-venda-${col.id}`} aria-label={col.rotulo}
            className={`flex w-[86vw] max-w-[330px] shrink-0 snap-center scroll-ml-3 flex-col rounded-2xl border border-slate-200 sm:w-[290px] ${col.corpo}`}>
            <header className="rounded-t-2xl px-4 py-3" style={{ background: col.fundo, color: col.tinta }}>
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: "rgba(255,255,255,.28)" }} aria-hidden>{col.passo ?? "×"}</span>
                <h3 className="min-w-0 flex-1 truncate text-sm font-bold">{col.passo ? `Passo ${col.passo} · ` : ""}{col.rotulo}</h3>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-bold text-[#0d1b2e]">{col.n}</span>
              </div>
              <div className="num mt-1.5 whitespace-nowrap text-xl font-bold leading-tight">{brl(col.total)}</div>
              <p className="mt-1 text-xs leading-snug opacity-90">{col.explica}</p>
              <p className="mt-0.5 text-xs font-bold leading-snug">→ {col.fazer}</p>
            </header>
            <div className="flex min-h-[120px] flex-col gap-2 p-2">
              {col.lista.map((v) => (
                <button key={v.id} type="button" onClick={() => onAbrir(v)} style={{ borderLeftColor: col.cor }}
                  className="rounded-xl border border-l-[5px] border-slate-200 bg-surface p-3 text-left shadow-card transition hover:shadow-pop active:bg-slate-50">
                  <span className="flex items-center gap-1.5 text-sm">
                    <b className="text-fg">#{v.numero}</b><EtiquetaUnidade id={(v as any).unidade_id} />
                    {v.numero_externo && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-2xs font-bold text-slate-600">TINY {v.numero_externo}</span>}
                    <span className="ml-auto text-xs text-slate-500">{dataBR(v.created_at).replace(/\/(\d{2})(\d{2})$/, "/$2")}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm font-semibold leading-snug text-fg" title={v.cliente?.nome ?? undefined}>{v.cliente?.nome ?? "—"}</span>
                  <span className="mt-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-500">{(v.itens ?? []).length} {pl((v.itens ?? []).length, "item", "itens")}</span>
                    <span className="num whitespace-nowrap text-lg font-bold text-fg">{brl(v.valor_total)}</span>
                  </span>
                  {extras && <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">{extras(v)}</span>}
                </button>
              ))}
              {!col.n && <p className="px-1 py-6 text-center text-sm text-slate-500">Nada aqui</p>}
              {col.fora > 0 && (
                <button type="button" onClick={() => onVerNaLista(col.id)} className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-brand hover:bg-white/60">
                  Mais {col.fora} na lista <ChevronRight size={15} aria-hidden />
                </button>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
