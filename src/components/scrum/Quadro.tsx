// Quadro da sprint em andamento: A fazer → Fazendo → Revisão → Feito. No computador arrasta o cartão; no celular,
// as setas do cartão mudam a coluna.
import { useState, type DragEvent } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Lightbulb, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { COLUNAS, somaPontos, type ItemScrum, type Sprint, type StatusItem, type TimeScrum } from "@/lib/scrum";
import { Avatar, ChipTarefas, ChipTipo, Pontos, primeiroNome, type Pessoa } from "./comum";

const COR_COLUNA: Record<StatusItem, string> = { a_fazer: "#64748b", fazendo: "#0284c7", revisao: "#d97706", feito: "#059669" };

export function Quadro({ time, sprint, itens, pessoas, onAbrir, onNovo }: {
  time: TimeScrum; sprint: Sprint; itens: ItemScrum[]; pessoas: Pessoa[];
  onAbrir: (i: ItemScrum) => void; onNovo: () => void;
}) {
  const { user_id } = usePerfil();
  const invalidar = useInvalidate();
  const [meus, setMeus] = useState(false);
  const [arrastando, setArrastando] = useState<ItemScrum | null>(null);
  const [sobre, setSobre] = useState<StatusItem | null>(null);
  const visiveis = meus ? itens.filter((i) => i.responsavel_id === user_id) : itens;

  async function mover(i: ItemScrum, status: StatusItem) {
    if (i.status === status) return;
    // quem pega um item sem dono vira o responsável
    const dono = status === "fazendo" && !i.responsavel_id ? { responsavel_id: user_id } : {};
    const { error } = await supabase.from("scrum_itens").update({ status, ...dono }).eq("id", i.id);
    if (error) return notifyError(error);
    invalidar("scrum_itens");
  }
  const fim = () => { setArrastando(null); setSobre(null); };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onNovo}><Plus size={16} aria-hidden /> Item na sprint</Button>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={meus} onChange={(e) => setMeus(e.target.checked)} /> Só os meus
        </label>
        <p className="hidden text-xs text-slate-500 md:block">Arraste o cartão para mudar a coluna. Quem puxa para "Fazendo" um item sem dono vira o responsável.</p>
      </div>
      <div className="relative -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 md:mx-0 md:grid md:snap-none md:grid-cols-4 md:overflow-visible md:px-0" aria-label={`Quadro da sprint ${sprint.numero}`}>
        {COLUNAS.map((col, k) => {
          const lista = visiveis.filter((i) => i.status === col.id);
          return (
            <section key={col.id} aria-label={col.titulo}
              onDragOver={(e: DragEvent) => { if (!arrastando) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setSobre(col.id); }}
              onDragLeave={(e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null); }}
              onDrop={(e: DragEvent) => { e.preventDefault(); if (arrastando) mover(arrastando, col.id); fim(); }}
              className={`flex w-[82vw] max-w-[320px] shrink-0 snap-center flex-col rounded-2xl border bg-slate-50 transition md:w-auto md:max-w-none
                ${sobre === col.id ? "border-emerald-400 ring-2 ring-emerald-300" : "border-slate-200"}`}>
              <header className="flex items-center gap-2 rounded-t-2xl px-3 py-2.5 text-white" style={{ background: COR_COLUNA[col.id] }} title={col.dica}>
                <h3 className="min-w-0 flex-1 truncate text-sm font-bold">{col.titulo}</h3>
                <span className="num text-xs font-bold opacity-90">{somaPontos(lista)} pts</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#0d1b2e]">{lista.length}</span>
              </header>
              <div className="flex min-h-[140px] flex-col gap-2 p-2">
                {lista.map((i) => (
                  <article key={i.id} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; setArrastando(i); }}
                    onDragEnd={fim}
                    style={{ borderLeftColor: time.cor }}
                    className={`group rounded-xl border border-l-4 border-slate-200 bg-surface p-2.5 shadow-card ${arrastando?.id === i.id ? "opacity-50" : ""} cursor-grab active:cursor-grabbing`}>
                    <button type="button" onClick={() => onAbrir(i)} className="block w-full text-left">
                      <span className="flex items-start gap-1">
                        <GripVertical size={14} className="mt-0.5 hidden shrink-0 text-slate-400 md:block" aria-hidden />
                        <span className="line-clamp-3 min-w-0 flex-1 text-sm font-semibold leading-snug text-fg">{i.titulo}</span>
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <ChipTipo tipo={i.tipo} />
                        <Pontos pontos={i.pontos} />
                        <ChipTarefas item={i} />
                        {i.ideia_id && <Lightbulb size={13} className="text-amber-600" aria-label="Veio das Ideias" />}
                        <span className="ml-auto flex items-center gap-1 text-2xs font-semibold text-slate-500">
                          {i.responsavel_id && <>{primeiroNome(pessoas, i.responsavel_id)} <Avatar nome={primeiroNome(pessoas, i.responsavel_id)} cor={time.cor} tamanho={20} /></>}
                        </span>
                      </span>
                    </button>
                    {/* celular: setas no lugar do arrastar */}
                    <div className="mt-2 flex justify-between border-t border-slate-100 pt-1.5 md:hidden">
                      <Button type="button" tamanho="mini" variant="ghost" disabled={k === 0} onClick={() => mover(i, COLUNAS[k - 1]!.id)} aria-label={`Voltar para ${COLUNAS[k - 1]?.titulo ?? ""}`}
                        className="gap-0.5 disabled:opacity-30"><ChevronLeft size={14} aria-hidden />{COLUNAS[k - 1]?.titulo ?? ""}</Button>
                      <Button type="button" tamanho="mini" variant="ghost" disabled={k === COLUNAS.length - 1} onClick={() => mover(i, COLUNAS[k + 1]!.id)} aria-label={`Passar para ${COLUNAS[k + 1]?.titulo ?? ""}`}
                        className="gap-0.5 disabled:opacity-30">{COLUNAS[k + 1]?.titulo ?? ""}<ChevronRight size={14} aria-hidden /></Button>
                    </div>
                  </article>
                ))}
                {!lista.length && <p className="px-1 py-6 text-center text-sm text-slate-500">{arrastando ? "Solte aqui" : col.id === "a_fazer" && !itens.length ? "Traga itens do backlog" : "Nada aqui"}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
