// Barra de filtros única das listas: busca, período (atalhos ou de/até) e os outros filtros guardados num botão,
// para a lista começar logo abaixo. Também: chips de situação compactos, rodapé com quantidade e total (como no
// Tiny) e a seleção de várias linhas.
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Search, SlidersHorizontal, X } from "lucide-react";
import { brl, hoje, pl } from "@/lib/format";
import { ATALHOS, periodoDoAtalho, rotuloPeriodo, SEM_PERIODO, temPeriodo, type Periodo } from "@/lib/filtroLista";

export function BarraFiltros({ busca, onBusca, placeholder = "Buscar…", periodo, onPeriodo, rotuloData = "Data", filtros, nFiltros = 0, onLimpar, direita }: {
  busca: string; onBusca: (v: string) => void; placeholder?: string;
  /** Período da coluna de data da lista (sem onPeriodo: sem o botão de período). */
  periodo?: Periodo; onPeriodo?: (p: Periodo) => void; rotuloData?: string;
  /** Outros filtros (selects, botões): ficam no painel do botão "Filtros". */
  filtros?: ReactNode; nFiltros?: number;
  /** Limpa tudo (busca, período e os outros filtros). */
  onLimpar?: () => void;
  direita?: ReactNode;
}) {
  const [painel, setPainel] = useState<"periodo" | "filtros" | null>(null);
  const comPeriodo = !!(periodo && onPeriodo);
  const ativoPeriodo = comPeriodo && temPeriodo(periodo!);
  const algo = !!busca || ativoPeriodo || nFiltros > 0;
  const alternar = (p: "periodo" | "filtros") => setPainel((x) => (x === p ? null : p));
  const botao = (ativo: boolean, aberto: boolean) =>
    `inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition ${ativo ? "border-brand bg-brand/10 text-brand" : aberto ? "border-slate-400 bg-slate-50 text-fg" : "border-slate-300 bg-surface text-slate-700 hover:bg-slate-50"}`;
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64 sm:max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input h-10 pl-9" type="search" placeholder={placeholder} aria-label={placeholder} value={busca} onChange={(e) => onBusca(e.target.value)} />
        </div>
        {comPeriodo && (
          <button type="button" onClick={() => alternar("periodo")} aria-expanded={painel === "periodo"} className={botao(ativoPeriodo, painel === "periodo")}>
            <CalendarDays size={16} aria-hidden /> <span className="max-w-[13rem] truncate">{rotuloData}: {rotuloPeriodo(periodo!, hoje())}</span>
          </button>
        )}
        {filtros && (
          <button type="button" onClick={() => alternar("filtros")} aria-expanded={painel === "filtros"} className={botao(nFiltros > 0, painel === "filtros")}>
            <SlidersHorizontal size={16} aria-hidden /> Filtros{nFiltros > 0 && <span className="rounded-full bg-brand px-1.5 text-xs leading-5 text-brand-fg">{nFiltros}</span>}
          </button>
        )}
        {algo && onLimpar && (
          <button type="button" onClick={() => { onLimpar(); setPainel(null); }} className="inline-flex h-10 items-center gap-1 px-2 text-sm font-semibold text-slate-600 hover:text-fg">
            <X size={15} aria-hidden /> Limpar
          </button>
        )}
        {direita && <div className="ml-auto flex flex-wrap items-center gap-2">{direita}</div>}
      </div>
      {painel === "periodo" && comPeriodo && <PainelPeriodo periodo={periodo!} onChange={onPeriodo!} rotulo={rotuloData} />}
      {painel === "filtros" && filtros && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-surface p-2.5">{filtros}</div>
      )}
    </div>
  );
}

/** Atalhos (Hoje, 7 dias, Este mês, Mês passado, Este ano) e De/Até. */
export function PainelPeriodo({ periodo, onChange, rotulo = "Data" }: { periodo: Periodo; onChange: (p: Periodo) => void; rotulo?: string }) {
  const dia = hoje();
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-600">{rotulo}:</span>
        {ATALHOS.map((a) => {
          const p = periodoDoAtalho(a.id, dia);
          const ativo = periodo.de === p.de && periodo.ate === p.ate;
          return (
            <button key={a.id} type="button" aria-pressed={ativo} onClick={() => onChange(ativo ? SEM_PERIODO : p)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${ativo ? "border-brand bg-brand text-brand-fg" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {a.rotulo}
            </button>
          );
        })}
      </div>
      <label className="text-xs font-semibold text-slate-600">De
        <input className="input mt-0.5 h-9 w-[9.5rem]" type="date" value={periodo.de} max={periodo.ate || undefined} onChange={(e) => onChange({ ...periodo, de: e.target.value })} />
      </label>
      <label className="text-xs font-semibold text-slate-600">Até
        <input className="input mt-0.5 h-9 w-[9.5rem]" type="date" value={periodo.ate} min={periodo.de || undefined} onChange={(e) => onChange({ ...periodo, ate: e.target.value })} />
      </label>
      {temPeriodo(periodo) && (
        <button type="button" onClick={() => onChange(SEM_PERIODO)} className="h-9 px-1 text-xs font-semibold text-slate-600 hover:text-fg">Qualquer data</button>
      )}
    </div>
  );
}

/** Situações em botões pequenos com a contagem (a que não tem nada some, menos a escolhida e "todos"). */
export function ChipsSituacao<T extends string>({ opcoes, valor, onChange, rotulo = "Situação" }: {
  opcoes: { value: T; label: string; n: number }[]; valor: T; onChange: (v: T) => void; rotulo?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={rotulo}>
      {opcoes.map((o, i) => {
        if (!o.n && i > 0 && o.value !== valor) return null;
        const ativo = o.value === valor;
        return (
          <button key={o.value} type="button" aria-pressed={ativo} onClick={() => onChange(o.value)}
            className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${ativo ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`}>
            {o.label} <span className="num ml-0.5 opacity-80">{o.n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Rodapé fixo da lista: quantidade e total do que está filtrado (como no Tiny); com seleção, as ações em lote. */
export function RodapeLista({ quantidade, nome, total, rotuloTotal = "valor total", selecionados = 0, totalSelecionados, acoes, onLimparSelecao }: {
  quantidade: number; nome: [string, string]; total?: number; rotuloTotal?: string;
  selecionados?: number; totalSelecionados?: number; acoes?: ReactNode; onLimparSelecao?: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-surface/95 px-4 py-2 shadow-card backdrop-blur"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}>
      {selecionados > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <b className="text-sm text-fg">{selecionados} {pl(selecionados, "selecionado", "selecionados")}</b>
          {totalSelecionados != null && <span className="num text-sm text-slate-600">{brl(totalSelecionados)}</span>}
          {acoes}
          {onLimparSelecao && (
            <button type="button" onClick={onLimparSelecao} className="inline-flex items-center gap-1 px-1 text-xs font-semibold text-slate-600 hover:text-fg"><X size={13} aria-hidden /> Limpar seleção</button>
          )}
        </div>
      ) : <span className="text-xs text-slate-500">Marque as linhas para as ações em lote.</span>}
      <div className="ml-auto flex items-end gap-5 text-right">
        <div><div className="num text-base font-bold text-fg">{quantidade.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-500">{pl(quantidade, nome[0], nome[1])}</div></div>
        {total != null && <div><div className="num text-base font-bold text-fg">{brl(total)}</div><div className="text-[11px] text-slate-500">{rotuloTotal}</div></div>}
      </div>
    </div>
  );
}

/** Seleção de várias linhas (ids). "Todos" marca ou desmarca só o que está na lista filtrada. */
export function useSelecao() {
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const alternar = useCallback((id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const alternarTodos = useCallback((ids: string[]) => setSel((s) => {
    const todos = ids.length > 0 && ids.every((id) => s.has(id));
    const n = new Set(s);
    ids.forEach((id) => (todos ? n.delete(id) : n.add(id)));
    return n;
  }), []);
  const limpar = useCallback(() => setSel(new Set()), []);
  return useMemo(() => ({ sel, alternar, alternarTodos, limpar, tem: (id: string) => sel.has(id) }), [sel, alternar, alternarTodos, limpar]);
}
