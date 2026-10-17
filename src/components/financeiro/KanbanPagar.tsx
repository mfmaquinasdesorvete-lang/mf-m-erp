// Contas a pagar em quadro (Kanban): uma coluna por etapa até o pagamento — a decidir, falta aprovar, programadas,
// pagar hoje, pagas (30 dias) e não pagar. No computador dá para arrastar a conta para outra coluna, que faz a ação
// dela (pagar hoje, agendar, não pagar com motivo, voltar a decidir ou registrar o pagamento), com as mesmas travas
// da lista; no celular, as colunas deslizam para o lado e cada cartão tem os mesmos botões da lista.
import { useState, type DragEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { ModalAgendar, ModalNaoPagar, useProgramar } from "@/components/financeiro/DecisaoPagamento";
import { EtiquetaUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, somarDias } from "@/lib/format";
import { notify } from "@/lib/notify";
import { COLUNAS_PAGAR, colunaPagar, diaDoPagamento, soltarNaColuna, type ColunaPagar, type ContaDecisao } from "@/lib/programacao";

type ContaQuadro = ContaDecisao & {
  descricao: string; categoria?: string | null; data_pagamento?: string | null; fornecedor?: ({ nome: string } & NonNullable<ContaDecisao["fornecedor"]>) | null;
};

export function KanbanPagar<T extends ContaQuadro>({ contas, podeDecidir, situacaoDe, acoesDe, onRegistrar }: {
  contas: T[]; podeDecidir: boolean; situacaoDe: (c: T) => ReactNode; acoesDe: (c: T) => ReactNode; onRegistrar: (c: T) => void;
}) {
  const dia = hoje();
  const desde = somarDias(-30);
  const { programar, ocupado } = useProgramar();
  const [arrastando, setArrastando] = useState<T | null>(null);
  const [sobre, setSobre] = useState<ColunaPagar | null>(null);
  const [janela, setJanela] = useState<{ tipo: "agendar" | "nao_pagar"; conta: T } | null>(null);

  const colunas = COLUNAS_PAGAR.map((col) => {
    const lista = contas.filter((c) => colunaPagar(c, dia) === col.id && (col.id !== "pagas" || (c.data_pagamento ?? "") >= desde))
      .sort((a, b) => (col.id === "pagas" ? (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? "") : diaDoPagamento(a).localeCompare(diaDoPagamento(b))));
    return { ...col, lista, total: lista.reduce((s, c) => s + Number(c.valor), 0) };
  });

  async function soltar(c: T, destino: ColunaPagar) {
    const r = soltarNaColuna(c, destino, dia);
    if (!r) return;
    if ("motivo" in r) return notify(r.motivo, "erro");
    if (r.acao === "limpar") await programar([c.id], "limpar");
    else if (r.acao === "pagar_hoje") await programar([c.id], "agendar", dia);
    else if (r.acao === "agendar") setJanela({ tipo: "agendar", conta: c });
    else if (r.acao === "nao_pagar") setJanela({ tipo: "nao_pagar", conta: c });
    else onRegistrar(c);
  }
  const fim = () => { setArrastando(null); setSobre(null); };
  const aceita = (col: ColunaPagar) => {
    if (!arrastando) return null;
    const r = soltarNaColuna(arrastando, col, dia);
    return r ? "acao" in r : null;
  };

  return (
    <>
      <p className="mb-2 hidden text-xs text-slate-500 md:block">Arraste a conta para outra coluna para mudar a etapa (pagar hoje, programar, não pagar, voltar a decidir ou registrar o pagamento).</p>
      <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 md:mx-0 md:snap-none md:px-0" aria-label="Quadro das contas a pagar">
        {colunas.map((col) => {
          const ok = aceita(col.id);
          return (
            <section key={col.id} aria-label={col.rotulo}
              onDragOver={(e: DragEvent) => { if (!arrastando) return; e.preventDefault(); e.dataTransfer.dropEffect = ok ? "move" : "none"; setSobre(col.id); }}
              onDragLeave={(e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null); }}
              onDrop={(e: DragEvent) => { e.preventDefault(); if (arrastando) soltar(arrastando, col.id); fim(); }}
              className={`flex w-[85vw] max-w-[320px] shrink-0 snap-center flex-col rounded-2xl border bg-slate-50/70 transition sm:w-[290px] md:w-[280px]
                ${sobre === col.id && ok ? "border-emerald-400 ring-2 ring-emerald-300" : sobre === col.id && ok === false ? "border-red-300 ring-2 ring-red-200" : "border-slate-200"}
                ${arrastando && ok === false ? "opacity-60" : ""}`}>
              <header className="rounded-t-2xl border-b border-slate-200 bg-surface px-3 py-2.5" style={{ boxShadow: `inset 0 3px 0 ${col.cor}` }} title={col.dica}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.cor }} aria-hidden />
                  <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{col.rotulo}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{col.lista.length}</span>
                </div>
                <div className="num mt-0.5 text-xs font-semibold text-slate-600">{brl(col.total)}</div>
              </header>
              <div className="flex min-h-[120px] flex-col gap-2 p-2">
                {col.lista.map((c) => {
                  const movel = podeDecidir && c.status === "aberto" && !c.fornecedor?.bloqueado && !ocupado;
                  const titulo = c.fornecedor?.nome || c.descricao;
                  return (
                    <article key={c.id} draggable={movel}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; setArrastando(c); }}
                      onDragEnd={fim}
                      className={`rounded-xl border border-slate-200 bg-surface p-2.5 shadow-card ${movel ? "cursor-grab active:cursor-grabbing" : ""} ${arrastando?.id === c.id ? "opacity-50" : ""}`}>
                      <div className="flex items-start gap-1.5">
                        {movel && <GripVertical size={14} className="mt-0.5 hidden shrink-0 text-slate-400 md:block" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm font-semibold text-fg" title={titulo}>{titulo}</div>
                          {titulo !== c.descricao && <div className="line-clamp-1 text-xs text-slate-500" title={c.descricao}>{c.descricao}</div>}
                        </div>
                        <EtiquetaUnidade id={c.unidade_id} />
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between gap-2">
                        <span className="num text-base font-bold text-fg">{brl(c.valor)}</span>
                        <span className="num whitespace-nowrap text-xs text-slate-500">
                          {c.status === "pago" && c.data_pagamento ? `pago ${dataBR(c.data_pagamento).slice(0, 5)}` : `vence ${dataBR(c.vencimento).slice(0, 5)}`}
                        </span>
                      </div>
                      <div className="mt-1.5">{situacaoDe(c)}</div>
                      <div className="mt-2 border-t border-slate-100 pt-2 [&_a]:px-2.5 [&_a]:py-1.5 [&_a]:text-xs [&_button]:min-h-0 [&_button]:px-2.5 [&_button]:py-1.5 [&_button]:text-xs">{acoesDe(c)}</div>
                    </article>
                  );
                })}
                {!col.lista.length && <p className="px-1 py-6 text-center text-xs text-slate-400">{arrastando && aceita(col.id) ? "Solte aqui" : "Nada aqui"}</p>}
                {col.id === "pagas" && col.lista.length > 0 && <p className="px-1 text-center text-[11px] text-slate-400">As mais antigas ficam na lista (visão "Pagas").</p>}
              </div>
            </section>
          );
        })}
      </div>
      {janela?.tipo === "agendar" && <ModalAgendar contas={[janela.conta]} onClose={() => setJanela(null)} />}
      {janela?.tipo === "nao_pagar" && <ModalNaoPagar contas={[janela.conta]} onClose={() => setJanela(null)} />}
    </>
  );
}
