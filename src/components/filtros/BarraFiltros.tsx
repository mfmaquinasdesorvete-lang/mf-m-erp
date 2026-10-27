// Barra de filtros única das listas: busca, período (atalhos ou de/até) e os outros filtros guardados num botão,
// para a lista começar logo abaixo. No celular (24/10) a busca e os botões de período e filtros ficam numa linha só:
// os botões viram ícones (com o número dos filtros em uso) e as ações da tela (`direita`) descem para a linha de baixo. Também: chips de situação compactos, rodapé com quantidade e total (como no
// Tiny) e a seleção de várias linhas.
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Search, SlidersHorizontal, X } from "lucide-react";
import { brl, hoje, pl } from "@/lib/format";
import { ATALHOS, periodoDoAtalho, rotuloPeriodo, SEM_PERIODO, temPeriodo, type Periodo } from "@/lib/filtroLista";
import { chip } from "@/components/ui";

export function BarraFiltros({ busca, onBusca, placeholder = "Buscar…", periodo, onPeriodo, rotuloData = "Data", campoData, filtros, nFiltros = 0, onLimpar, direita }: {
  /** sem onBusca: barra só com período e filtros (telas sem busca por texto) */
  busca?: string; onBusca?: (v: string) => void; placeholder?: string;
  /** Período da coluna de data da lista (sem onPeriodo: sem o botão de período). */
  periodo?: Periodo; onPeriodo?: (p: Periodo) => void; rotuloData?: string;
  /** Qual data o período usa (ex.: vencimento, emissão, pagamento), escolhida no painel do período. */
  campoData?: CampoDataPeriodo;
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
    `relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold transition sm:px-3 ${ativo ? "border-brand bg-brand/10 text-brand" : aberto ? "border-slate-400 bg-slate-50 text-fg" : "border-slate-300 bg-surface text-slate-700 hover:bg-slate-50"}`;
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {onBusca && (
          <div className="relative min-w-0 flex-1 basis-40 sm:basis-64 sm:max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input h-10 pl-9" type="search" placeholder={placeholder} aria-label={placeholder} value={busca ?? ""} onChange={(e) => onBusca(e.target.value)} />
          </div>
        )}
        {comPeriodo && (
          // no celular, sem período escolhido, só o nome da data: o botão Filtros cabe na mesma linha
          <button type="button" onClick={() => alternar("periodo")} aria-expanded={painel === "periodo"} title={`${rotuloData}: ${rotuloPeriodo(periodo!, hoje())}`}
            className={`${botao(ativoPeriodo, painel === "periodo")} min-w-0 !shrink`}>
            <CalendarDays size={16} className="shrink-0" aria-hidden />
            {/* celular: só o ícone (com o período escolhido, o período curto); o nome completo fica no título */}
            <span className={`max-w-52 truncate ${ativoPeriodo ? "max-sm:max-w-24" : "max-sm:sr-only"}`}>{ativoPeriodo
              ? <><span className="hidden sm:inline">{rotuloData}: </span>{rotuloPeriodo(periodo!, hoje())}</>
              : <>{rotuloData}<span className="hidden sm:inline">: {rotuloPeriodo(periodo!, hoje())}</span></>}</span>
          </button>
        )}
        {filtros && (
          <button type="button" onClick={() => alternar("filtros")} aria-expanded={painel === "filtros"} className={botao(nFiltros > 0, painel === "filtros")}>
            <SlidersHorizontal size={16} aria-hidden /> <span className="max-sm:sr-only">Filtros</span>
            {nFiltros > 0 && <span className="rounded-full bg-brand px-1.5 text-xs leading-5 text-brand-fg max-sm:absolute max-sm:-right-1.5 max-sm:-top-1.5">{nFiltros}</span>}
          </button>
        )}
        {algo && onLimpar && (
          // celular: o "Limpar" só aparece com busca ou filtro; o período sozinho se troca no próprio botão (não sobra numa linha)
          <button type="button" onClick={() => { onLimpar(); setPainel(null); }} aria-label="Limpar filtros" title="Limpar filtros"
            className={`inline-flex h-10 items-center gap-1 px-2 text-sm font-semibold text-slate-600 hover:text-fg ${!busca && nFiltros === 0 ? "max-sm:hidden" : ""}`}>
            <X size={15} aria-hidden /> <span className="hidden sm:inline">Limpar</span>
          </button>
        )}
        {direita && <div className="ml-auto flex flex-wrap items-center justify-end gap-2 max-sm:basis-full">{direita}</div>}
      </div>
      {painel === "periodo" && comPeriodo && <PainelPeriodo periodo={periodo!} onChange={onPeriodo!} rotulo={rotuloData} campoData={campoData} />}
      {painel === "filtros" && filtros && (
        <div className="cartao flex flex-wrap items-end gap-2 p-2.5">{filtros}</div>
      )}
    </div>
  );
}

export type CampoDataPeriodo = { valor: string; opcoes: { v: string; rotulo: string }[]; onChange: (v: string) => void };

/** Atalhos (Hoje, 7 dias, Este mês, Mês passado, Este ano) e De/Até; com `campoData`, também qual data vale. */
export function PainelPeriodo({ periodo, onChange, rotulo = "Data", campoData }: { periodo: Periodo; onChange: (p: Periodo) => void; rotulo?: string; campoData?: CampoDataPeriodo }) {
  const dia = hoje();
  return (
    <div className="cartao flex flex-wrap items-end gap-2 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {campoData ? (
          <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">Período por
            <select className="input h-8 w-auto py-0 text-xs" value={campoData.valor} onChange={(e) => campoData.onChange(e.target.value)}>
              {campoData.opcoes.map((o) => <option key={o.v} value={o.v}>{o.rotulo}</option>)}
            </select>
          </label>
        ) : <span className="text-xs font-semibold text-slate-600">{rotulo}:</span>}
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
/** `cores`: cada situação com a sua cor (bolinha quando solta, fundo quando escolhida), como os selos da lista. */
export function ChipsSituacao<T extends string>({ opcoes, valor, onChange, rotulo = "Situação", cores }: {
  opcoes: { value: T; label: string; n: number }[]; valor: T; onChange: (v: T) => void; rotulo?: string;
  cores?: Partial<Record<T, { ponto: string; ativo: string }>>;
}) {
  return (
    <div className="faixa-chips mb-3" role="group" aria-label={rotulo}>
      {opcoes.map((o, i) => {
        if (!o.n && i > 0 && o.value !== valor) return null;
        const ativo = o.value === valor;
        const cor = cores?.[o.value];
        return (
          <button key={o.value} type="button" aria-pressed={ativo} onClick={() => onChange(o.value)}
            className={chip(ativo, cor ? `${cor.ativo} border-transparent text-white shadow-card` : undefined)}>
            {cor && <span className={`h-2 w-2 rounded-full ${ativo ? "bg-white/90" : cor.ponto}`} aria-hidden />}
            {o.label} <span className="num ml-0.5 opacity-80">{o.n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Rodapé fixo da lista: quantidade e total do que está filtrado (como no Tiny); com seleção, as ações em lote. */
export function RodapeLista({ quantidade, nome, total, rotuloTotal = "valor total", extras, selecionados = 0, totalSelecionados, acoes, onLimparSelecao, dica = "Marque as linhas para as ações em lote." }: {
  quantidade: number; nome: [string, string]; total?: number; rotuloTotal?: string;
  /** a dica do computador quando nada está marcado (null: sem dica, ex.: no quadro, onde não se marca) */
  dica?: string | null;
  /** outras somas da lista (ex.: recebido e a receber), ao lado do total */
  extras?: { valor: number; rotulo: string; cor?: string }[];
  selecionados?: number; totalSelecionados?: number; acoes?: ReactNode; onLimparSelecao?: () => void;
}) {
  return (
    // celular: fica logo acima da barra de atalhos fixa do pé da tela, numa faixa baixa (os números numa linha só,
    // sem a dica das ações em lote) para não cobrir a lista
    // com linhas marcadas a faixa ganha a cor do sistema e as ações em lote aparecem como botões cheios, bem à vista
    <div className={`sticky bottom-[calc(5.4rem+env(safe-area-inset-bottom,0px))] z-10 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border py-1.5 pl-3 pr-14 shadow-card backdrop-blur md:bottom-0 md:pr-4 md:gap-y-2 md:px-4 md:py-2 ${selecionados > 0 && acoes ? "border-brand bg-surface ring-2 ring-brand/40" : "border-slate-200 bg-surface/95"}`}>
      {selecionados > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Ações em lote">
          <span className="rounded-full bg-brand px-2.5 py-1 text-sm font-bold text-brand-fg">{selecionados} {pl(selecionados, "selecionado", "selecionados")}</span>
          {totalSelecionados != null && <span className="num text-sm font-semibold text-fg">{brl(totalSelecionados)}</span>}
          {acoes && <span className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 md:inline">Ações em lote:</span>}
          {acoes}
          {onLimparSelecao && (
            <button type="button" onClick={onLimparSelecao} className="inline-flex items-center gap-1 px-1 text-xs font-semibold text-slate-600 hover:text-fg"><X size={13} aria-hidden /> Limpar seleção</button>
          )}
        </div>
      ) : dica ? <span className="hidden text-xs text-slate-500 md:inline">{dica}</span> : null}
      <div className="ml-auto flex w-full flex-nowrap items-end justify-between gap-x-3 gap-y-1 overflow-x-auto text-right md:w-auto md:flex-wrap md:justify-end md:gap-x-5">
        <div className="text-left md:text-right"><div className="num whitespace-nowrap text-xs font-bold leading-tight text-fg sm:text-sm md:text-base">{quantidade.toLocaleString("pt-BR")}</div><div className="text-2xs leading-tight text-slate-500">{pl(quantidade, nome[0], nome[1])}</div></div>
        {total != null && <div><div className="num whitespace-nowrap text-xs font-bold leading-tight text-fg sm:text-sm md:text-base">{brl(total)}</div><div className="text-2xs leading-tight text-slate-500">{rotuloTotal}</div></div>}
        {extras?.map((x) => <div key={x.rotulo}><div className={`num whitespace-nowrap text-xs font-bold leading-tight sm:text-sm md:text-base ${x.cor ?? "text-fg"}`}>{brl(x.valor)}</div><div className="text-2xs leading-tight text-slate-500">{x.rotulo}</div></div>)}
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
