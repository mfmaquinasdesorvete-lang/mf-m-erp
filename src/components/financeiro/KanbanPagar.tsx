// Contas a pagar em quadro (Kanban): uma coluna por passo até o pagamento — 1 falta aprovar, 2 a decidir, 3 programadas,
// 4 pagar hoje, 5 pagas (30 dias) — e "não pagar" à parte. Cada coluna tem a sua cor, diz o que é e o que fazer; no topo,
// abas coloridas com quantas contas e quanto em cada passo (tocar leva à coluna). O cartão traz a cor do tipo da conta
// (transportadora, fornecedor, folha…) e o prazo em palavras. No computador dá para arrastar a conta para outra coluna,
// que faz a ação dela (pagar hoje, agendar, não pagar com motivo, voltar a decidir ou registrar o pagamento), com as
// mesmas travas da lista; no celular, as colunas deslizam para o lado e cada cartão tem os mesmos botões da lista.
import { useState, type DragEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { ModalAgendar, ModalNaoPagar, useProgramar } from "@/components/financeiro/DecisaoPagamento";
import { ChipTipo } from "@/components/financeiro/ResumoPagar";
import { EtiquetaUnidade } from "@/lib/unidade";
import { brl, hoje, somarDias } from "@/lib/format";
import { notify } from "@/lib/notify";
import { COLUNAS_PAGAR, colunaPagar, diaDoPagamento, soltarNaColuna, type ColunaPagar, type ContaDecisao } from "@/lib/programacao";
import { prazoPagar, TIPOS_PAGAR, type TipoPagar } from "@/lib/tiposPagar";

type ContaQuadro = ContaDecisao & {
  descricao: string; categoria?: string | null; data_pagamento?: string | null; fornecedor?: ({ nome: string } & NonNullable<ContaDecisao["fornecedor"]>) | null;
};

const COR_PRAZO = { atrasada: "font-semibold text-red-700", hoje: "font-semibold text-emerald-700", perto: "text-amber-800", longe: "text-slate-500", paga: "text-slate-500" };

export function KanbanPagar<T extends ContaQuadro>({ contas, podeDecidir, situacaoDe, acoesDe, onRegistrar, tipoDe }: {
  contas: T[]; podeDecidir: boolean; situacaoDe: (c: T) => ReactNode; acoesDe: (c: T) => ReactNode; onRegistrar: (c: T) => void; tipoDe: (c: T) => TipoPagar;
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
  const irPara = (id: ColunaPagar) => document.getElementById(`coluna-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });

  return (
    <>
      {/* abas coloridas: cada passo com quantas contas e quanto (tocar leva à coluna) */}
      <nav aria-label="Passos até o pagamento" className="relative -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0 xl:grid-cols-6">
        {colunas.map((col) => (
          <button key={col.id} type="button" onClick={() => irPara(col.id)} title={`${col.explica} ${col.fazer}`}
            className={`flex min-w-[9.5rem] shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop md:min-w-0 ${col.lista.length ? "" : "opacity-55"}`}
            style={{ background: col.fundo, color: col.tinta }}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-extrabold" style={{ background: "rgba(255,255,255,.28)" }}>{col.passo ?? "×"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold leading-tight">{col.rotulo}</span>
              <span className="num block whitespace-nowrap text-[13px] font-semibold opacity-90">{col.lista.length} · {brl(col.total)}</span>
            </span>
          </button>
        ))}
      </nav>
      <p className="mb-2 hidden text-[13px] text-slate-600 md:block">O caminho vai da esquerda para a direita. Arraste a conta para outra coluna para mudar o passo (pagar hoje, programar, não pagar, voltar a decidir ou registrar o pagamento).</p>
      {/* relative: o texto só para leitor de tela (sr-only) dos cartões fica preso aqui e não alarga a página no celular */}
      <div className="relative -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 md:mx-0 md:snap-none md:px-0" aria-label="Quadro das contas a pagar">
        {colunas.map((col) => {
          const ok = aceita(col.id);
          return (
            <section key={col.id} id={`coluna-${col.id}`} aria-label={col.rotulo}
              onDragOver={(e: DragEvent) => { if (!arrastando) return; e.preventDefault(); e.dataTransfer.dropEffect = ok ? "move" : "none"; setSobre(col.id); }}
              onDragLeave={(e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null); }}
              onDrop={(e: DragEvent) => { e.preventDefault(); if (arrastando) soltar(arrastando, col.id); fim(); }}
              className={`flex w-[86vw] max-w-[330px] shrink-0 snap-center scroll-ml-3 flex-col rounded-2xl border transition sm:w-[300px] ${col.corpo}
                ${sobre === col.id && ok ? "border-emerald-400 ring-2 ring-emerald-300" : sobre === col.id && ok === false ? "border-red-300 ring-2 ring-red-200" : "border-slate-200"}
                ${arrastando && ok === false ? "opacity-60" : ""}`}>
              <header className="rounded-t-2xl px-3.5 py-3" style={{ background: col.fundo, color: col.tinta }}>
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-extrabold" style={{ background: "rgba(255,255,255,.28)" }} aria-hidden>{col.passo ?? "×"}</span>
                  <h3 className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{col.passo ? `Passo ${col.passo} · ` : ""}{col.rotulo}</h3>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-extrabold text-[#0d1b2e]">{col.lista.length}</span>
                </div>
                <div className="num mt-1.5 whitespace-nowrap text-xl font-extrabold leading-tight">{brl(col.total)}</div>
                <p className="mt-1 text-[13px] leading-snug opacity-90">{col.explica}</p>
                <p className="mt-0.5 text-[13px] font-bold leading-snug">→ {col.fazer}</p>
              </header>
              <div className="flex min-h-[120px] flex-col gap-2 p-2">
                {col.lista.map((c) => {
                  const movel = podeDecidir && c.status === "aberto" && !c.fornecedor?.bloqueado && !ocupado;
                  const titulo = c.fornecedor?.nome || c.descricao;
                  const tipo = tipoDe(c);
                  const prazo = prazoPagar(c, dia);
                  return (
                    <article key={c.id} draggable={movel}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; setArrastando(c); }}
                      onDragEnd={fim}
                      style={{ borderLeftColor: TIPOS_PAGAR[tipo].cor }}
                      className={`rounded-xl border border-l-[5px] border-slate-200 bg-surface p-3 shadow-card ${movel ? "cursor-grab active:cursor-grabbing" : ""} ${arrastando?.id === c.id ? "opacity-50" : ""}`}>
                      <div className="flex items-start gap-1.5">
                        {movel && <GripVertical size={14} className="mt-0.5 hidden shrink-0 text-slate-400 md:block" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[15px] font-bold leading-snug text-fg" title={titulo}>{titulo}</div>
                          {titulo !== c.descricao && <div className="line-clamp-1 text-[13px] text-slate-600" title={c.descricao}>{c.descricao}</div>}
                        </div>
                        <EtiquetaUnidade id={c.unidade_id} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="num whitespace-nowrap text-lg font-extrabold text-fg">{brl(c.valor)}</span>
                        <span className={`num whitespace-nowrap text-[13px] ${COR_PRAZO[prazo.tom]}`}>{prazo.texto}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1"><ChipTipo tipo={tipo} /></div>
                      <div className="mt-1.5">{situacaoDe(c)}</div>
                      <div className="mt-2 border-t border-slate-100 pt-2 [&_a]:px-2.5 [&_a]:py-1.5 [&_a]:text-xs [&_button]:min-h-0 [&_button]:px-2.5 [&_button]:py-1.5 [&_button]:text-[13px]">{acoesDe(c)}</div>
                    </article>
                  );
                })}
                {!col.lista.length && <p className="px-1 py-6 text-center text-sm text-slate-500">{arrastando && aceita(col.id) ? "Solte aqui" : "Nada aqui"}</p>}
                {col.id === "pagas" && col.lista.length > 0 && <p className="px-1 text-center text-xs text-slate-500">As mais antigas ficam na lista (visão "Pagas").</p>}
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
