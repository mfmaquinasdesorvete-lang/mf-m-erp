// Resumo do fluxo: um bloco por etapa (quantos, quanto vale, quantos pedem ação) e a faixa do que precisa de ação agora.
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { brl } from "@/lib/format";
import { ALERTAS, COLUNAS, type ColunaId, type Nivel, type TipoAlerta } from "@/lib/fluxo";

export type ResumoEtapa = { qtd: number; valor: number; alertas: number; nivel: Nivel };

/** Blocos clicáveis: escolhem a etapa mostrada (clicar de novo volta para todas). */
export function BlocosEtapas({ resumo, etapa, onEtapa }: {
  resumo: Record<ColunaId, ResumoEtapa>; etapa: ColunaId | null; onEtapa: (e: ColunaId | null) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-6" role="tablist" aria-label="Etapas do fluxo">
      {COLUNAS.map((c) => {
        const r = resumo[c.id];
        const ativo = etapa === c.id;
        return (
          <button key={c.id} type="button" role="tab" aria-selected={ativo} onClick={() => onEtapa(ativo ? null : c.id)}
            title={`${c.titulo}: ${c.frase}${r.alertas ? ` ${r.alertas} pedem ação agora.` : ""}`}
            className={`relative flex min-w-0 flex-col rounded-xl border bg-surface p-2 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand/60 sm:p-3 ${
              ativo ? "border-brand ring-2 ring-brand/40" : "border-slate-200"}`}>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold leading-tight text-slate-600 sm:pr-5 sm:text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.cor }} />
              <span className="truncate">{c.curto}</span>
            </span>
            <span className={`num mt-1.5 text-2xl font-extrabold leading-none ${r.qtd ? "text-fg" : "text-slate-400"}`}>{r.qtd}</span>
            <span className="num mt-1 truncate text-[11px] text-slate-500">{brl(r.valor)}</span>
            {r.alertas > 0 && (
              <>
                <span className={`num absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-bold text-white ring-2 ring-[rgb(var(--canvas))] sm:right-2 sm:top-2 sm:ring-0 ${r.nivel === 2 ? "bg-red-500" : "bg-amber-500"}`}
                  aria-label={`${r.alertas} pedem ação`}>{r.alertas}</span>
                <span className={`mt-1.5 hidden text-[11px] font-bold lg:block ${r.nivel === 2 ? "text-red-600" : "text-amber-700"}`}>
                  {r.alertas === 1 ? "1 pede ação" : `${r.alertas} pedem ação`}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Faixa "precisa de ação agora": quantos, por quê, e o botão para ver só esses. */
export function FaixaAcao({ porTipo, total, nivel, soAcao, tipo, onSoAcao, onTipo }: {
  porTipo: [TipoAlerta, number][]; total: number; nivel: Nivel; soAcao: boolean; tipo: TipoAlerta | null;
  onSoAcao: (v: boolean) => void; onTipo: (t: TipoAlerta) => void;
}) {
  if (!total) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
        <CheckCircle2 size={18} className="shrink-0" /> Nada atrasado: todos os pedidos estão em dia.
      </div>
    );
  }
  const vermelho = nivel === 2;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 ${vermelho ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <AlertTriangle size={20} className={`shrink-0 ${vermelho ? "text-red-600" : "text-amber-700"}`} />
      <div className="min-w-0 flex-1 basis-56">
        <p className={`text-sm font-bold ${vermelho ? "text-red-800" : "text-amber-900"}`}>
          {total === 1 ? "1 pedido precisa de ação agora" : `${total} pedidos precisam de ação agora`}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {porTipo.map(([t, n]) => (
            <button key={t} type="button" onClick={() => onTipo(t)} aria-pressed={tipo === t} title={tipo === t ? "Mostrar todos de novo" : "Mostrar só esses pedidos"}
              className={`max-w-full truncate whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold transition ${tipo === t
                ? "border-brand bg-brand text-brand-fg" : "border-slate-300 bg-surface text-slate-700 hover:border-brand hover:text-brand"}`}>
              {n} {ALERTAS[t][n === 1 ? 0 : 1]}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => onSoAcao(!soAcao)} aria-pressed={soAcao}
        className={`inline-flex min-h-[42px] w-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition sm:min-h-0 sm:w-auto ${
          soAcao ? "bg-brand text-brand-fg" : "border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50"}`}>
        {soAcao ? <><X size={15} /> Ver todos os pedidos</> : "Ver só esses"}
      </button>
    </div>
  );
}
