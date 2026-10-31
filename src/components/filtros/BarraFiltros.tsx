// Barra de filtros única das listas (nova em 31/10, pedido da usuária: "muita coisa, confuso; quero mais função").
// Uma linha, sempre na mesma ordem: Visão (filtros prontos com a contagem e os salvos pela pessoa), busca que sugere
// filtros, período (diz qual data vale) e Filtros (painel ao lado no computador, de baixo no celular). O que está
// ligado aparece embaixo em pílulas com "×" e o resultado ao lado. Proposta aprovada:
// https://claude.ai/artifact/YBkemVWvgNHmoW1XEGfJxV · regras no manual (src/design/README.md, padrão "Lista com busca").
// As partes novas são opcionais (visoes, ligados, sugestoes, resultado): a tela que ainda não passa continua igual,
// só que com o painel novo. Também: chips de situação, rodapé com quantidade e total e a seleção de várias linhas.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, ListFilter, Search, SlidersHorizontal, X } from "lucide-react";
import { brl, hoje, pl } from "@/lib/format";
import { ATALHOS, periodoDoAtalho, rotuloPeriodo, SEM_PERIODO, temPeriodo, type Periodo } from "@/lib/filtroLista";
import { Button, chip, useFecharComEsc } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { guardarVisoesSalvas, lerVisoesSalvas, mesmoEstado, type VisaoSalva } from "@/lib/visoesSalvas";

/** Um filtro em uso, mostrado como pílula com "×" (ex.: { rotulo: "UF", valor: "SP", tirar }). */
export type FiltroLigado = { rotulo: string; valor: string; tirar: () => void };
/** Filtro pronto da tela (ex.: a situação "Pendentes"), com a quantidade. */
export type VisaoPronta = { id: string; nome: string; n?: number; cor?: string };
/** Sugestão que a busca mostra quando o texto bate com um filtro (ex.: "Vendedor: Carla"). */
export type SugestaoFiltro = { tipo: string; rotulo: string; aplicar: () => void };
export type Visoes = {
  lista: VisaoPronta[]; ativa: string | null; escolher: (id: string) => void;
  /** Salvar visões: a chave da página e o estado dos filtros (só dados simples) e como aplicar um salvo. */
  pagina?: string; estado?: Record<string, unknown>; aplicar?: (estado: Record<string, unknown>) => void;
};
type Salva = VisaoSalva;

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const igual = mesmoEstado;
const lerSalvas = lerVisoesSalvas;

export function BarraFiltros({ busca, onBusca, placeholder = "Buscar…", periodo, onPeriodo, rotuloData = "Data", campoData, filtros, nFiltros = 0, onLimpar, direita, visoes, ligados, sugestoes, resultado }: {
  /** sem onBusca: barra só com período e filtros (telas sem busca por texto) */
  busca?: string; onBusca?: (v: string) => void; placeholder?: string;
  /** Período da coluna de data da lista (sem onPeriodo: sem o botão de período). */
  periodo?: Periodo; onPeriodo?: (p: Periodo) => void; rotuloData?: string;
  /** Qual data o período usa (ex.: vencimento, emissão, pagamento), escolhida no painel do período. */
  campoData?: CampoDataPeriodo;
  /** Outros filtros (selects, campos): ficam no painel do botão "Filtros". */
  filtros?: ReactNode; nFiltros?: number;
  /** Limpa tudo (busca, período e os outros filtros). */
  onLimpar?: () => void;
  direita?: ReactNode;
  /** Filtros prontos (no lugar dos chips de situação) e as visões salvas pela pessoa. */
  visoes?: Visoes;
  /** Filtros em uso, em pílulas com "×" (sem isto, a tela mostra só o número no botão Filtros). */
  ligados?: FiltroLigado[];
  /** A busca sugere estes filtros quando o texto bate (Enter escolhe). */
  sugestoes?: SugestaoFiltro[];
  /** O que ficou na lista (ex.: "12 notas · R$ 45.000,00"), ao lado das pílulas. */
  resultado?: ReactNode;
}) {
  const [painel, setPainel] = useState<"periodo" | "filtros" | "visao" | null>(null);
  const comPeriodo = !!(periodo && onPeriodo);
  const ativoPeriodo = comPeriodo && temPeriodo(periodo!);
  const nLigados = ligados?.length ?? nFiltros;
  const algo = !!busca || ativoPeriodo || nLigados > 0;
  const alternar = (p: "periodo" | "filtros" | "visao") => setPainel((x) => (x === p ? null : p));
  const novo = !!(visoes || ligados || resultado); // tela já no jeito novo: pílulas e "Limpar tudo" na segunda linha
  const botao = (ativo: boolean, aberto: boolean) =>
    `botao-toque relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold transition sm:px-3 ${ativo ? "border-brand bg-brand/10 text-brand" : aberto ? "border-slate-400 bg-slate-50 text-fg" : "border-slate-300 bg-surface text-slate-700 hover:bg-slate-50"}`;
  useFecharComEsc(painel === "filtros", () => setPainel(null));
  const fecharFora = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (painel !== "visao") return;
    const fora = (e: MouseEvent) => { if (!fecharFora.current?.contains(e.target as Node)) setPainel(null); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [painel]);

  // busca que sugere filtros
  const [ativa, setAtiva] = useState(0);
  const [focada, setFocada] = useState(false);
  const achadas = useMemo(() => {
    const t = semAcento((busca ?? "").trim());
    if (t.length < 2 || !sugestoes) return [];
    // o mais parecido primeiro: igual ao digitado, depois começa com, depois uma palavra começa com, depois contém
    const nota = (r: string) => { const x = semAcento(r); return x === t ? 0 : x.startsWith(t) ? 1 : x.split(/\s+/).some((w) => w.startsWith(t)) ? 2 : x.includes(t) ? 3 : 9; };
    return sugestoes.map((s) => ({ s, n: nota(s.rotulo) })).filter((x) => x.n < 9).sort((a, b) => a.n - b.n).slice(0, 6).map((x) => x.s);
  }, [busca, sugestoes]);
  const mostrarSugestoes = focada && achadas.length > 0;
  const escolherSugestao = (s: SugestaoFiltro) => { s.aplicar(); onBusca?.(""); setAtiva(0); };

  const nomeVisao = (() => {
    if (!visoes) return "";
    const salva = lerSalvas(visoes.pagina).find((v) => igual(v.estado, visoes.estado));
    if (salva) return salva.nome;
    return visoes.lista.find((v) => v.id === visoes.ativa)?.nome ?? "Visão personalizada";
  })();

  return (
    <div className="mb-3 space-y-2">
      <div className={`flex items-center gap-2 ${novo && visoes ? "max-sm:flex-wrap" : "flex-wrap"}`}>
        {visoes && (
          <div ref={fecharFora} className="relative min-w-0 max-sm:flex-1">
            <button type="button" onClick={() => alternar("visao")} aria-haspopup="listbox" aria-expanded={painel === "visao"}
              className={`botao-toque ${botao(false, painel === "visao")} w-full max-w-56 !justify-start sm:max-w-60`} title="Filtros prontos e as suas visões salvas">
              <ListFilter size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{nomeVisao}</span>
              <ChevronDown size={15} className="ml-auto shrink-0 opacity-70" aria-hidden />
            </button>
            {painel === "visao" && <MenuVisoes visoes={visoes} fechar={() => setPainel(null)} />}
          </div>
        )}
        {onBusca && (
          <div className={`relative min-w-0 flex-1 basis-40 sm:basis-64 ${visoes ? "max-sm:order-first max-sm:basis-full" : "sm:max-w-md"}`}>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input h-10 pl-9" type="search" placeholder={placeholder} aria-label={placeholder}
              value={busca ?? ""} onChange={(e) => { onBusca(e.target.value); setAtiva(0); }}
              onFocus={() => setFocada(true)} onBlur={() => setTimeout(() => setFocada(false), 120)}
              aria-expanded={mostrarSugestoes} aria-controls={mostrarSugestoes ? "sugestoes-filtro" : undefined} aria-autocomplete="list"
              onKeyDown={(e) => {
                if (!mostrarSugestoes) return;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setAtiva((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + achadas.length) % achadas.length); }
                else if (e.key === "Enter") { e.preventDefault(); escolherSugestao(achadas[ativa] ?? achadas[0]); }
                else if (e.key === "Escape") setFocada(false);
              }} />
            {mostrarSugestoes && (
              <div id="sugestoes-filtro" role="listbox" aria-label="Filtrar por" className="cartao absolute inset-x-0 top-full z-gaveta mt-1 p-1.5 shadow-pop">
                <div className="px-2 pb-1 pt-0.5 text-2xs font-bold uppercase tracking-rotulo text-slate-500">Filtrar por</div>
                {achadas.map((s, i) => (
                  <button key={`${s.tipo}-${s.rotulo}`} type="button" role="option" aria-selected={i === ativa}
                    onMouseDown={(e) => { e.preventDefault(); escolherSugestao(s); }}
                    className={`linha-clicavel flex w-full items-center gap-3 px-2 py-2 text-left text-sm ${i === ativa ? "bg-slate-100" : ""}`}>
                    <span className="w-20 shrink-0 text-xs text-slate-500">{s.tipo}</span><span className="min-w-0 truncate font-semibold text-fg">{s.rotulo}</span>
                  </button>
                ))}
                <div className="px-2 pb-1 pt-1 text-2xs text-slate-500">Enter escolhe · ou continue digitando para buscar no texto</div>
              </div>
            )}
          </div>
        )}
        {comPeriodo && (
          <button type="button" onClick={() => alternar("periodo")} aria-expanded={painel === "periodo"} title={`${rotuloData}: ${rotuloPeriodo(periodo!, hoje())}`}
            className={`${botao(ativoPeriodo, painel === "periodo")} min-w-0 !shrink`}>
            <CalendarDays size={16} className="shrink-0" aria-hidden />
            {/* celular sem visões: só o ícone (com o período escolhido, o período curto); com visões a linha tem espaço */}
            <span className={`max-w-56 truncate ${visoes ? "" : ativoPeriodo ? "max-sm:max-w-24" : "max-sm:sr-only"}`}>{ativoPeriodo
              ? <><span className="hidden sm:inline">{rotuloData}: </span>{rotuloPeriodo(periodo!, hoje())}</>
              : <>{rotuloData}<span className="hidden sm:inline">: {rotuloPeriodo(periodo!, hoje())}</span></>}</span>
          </button>
        )}
        {filtros && (
          <button type="button" onClick={() => alternar("filtros")} aria-expanded={painel === "filtros"} aria-haspopup="dialog" className={botao(nLigados > 0, painel === "filtros")}>
            <SlidersHorizontal size={16} aria-hidden /> <span className="max-sm:sr-only">Filtros</span>
            {nLigados > 0 && <span className="rounded-full bg-brand px-1.5 text-xs leading-5 text-brand-fg max-sm:absolute max-sm:-right-1.5 max-sm:-top-1.5">{nLigados}</span>}
          </button>
        )}
        {!novo && algo && onLimpar && (
          // celular: o "Limpar" só aparece com busca ou filtro; o período sozinho se troca no próprio botão (não sobra numa linha)
          <button type="button" onClick={() => { onLimpar(); setPainel(null); }} aria-label="Limpar filtros" title="Limpar filtros"
            className={`inline-flex h-10 items-center gap-1 px-2 text-sm font-semibold text-slate-600 hover:text-fg ${!busca && nFiltros === 0 ? "max-sm:hidden" : ""}`}>
            <X size={15} aria-hidden /> <span className="hidden sm:inline">Limpar</span>
          </button>
        )}
        {direita && <div className="ml-auto flex flex-wrap items-center justify-end gap-2 max-sm:basis-full">{direita}</div>}
      </div>
      {painel === "periodo" && comPeriodo && <PainelPeriodo periodo={periodo!} onChange={onPeriodo!} rotulo={rotuloData} campoData={campoData} />}
      {novo && ((ligados?.length ?? 0) > 0 || resultado) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
          {ligados?.map((l) => (
            <span key={`${l.rotulo}-${l.valor}`} className="inline-flex h-8 max-w-full items-center gap-1 rounded-full bg-brand/10 pl-3 pr-1 text-sm text-fg">
              <span className="text-slate-500">{l.rotulo}:</span><span className="min-w-0 truncate font-semibold">{l.valor}</span>
              <button type="button" onClick={l.tirar} aria-label={`Tirar o filtro ${l.rotulo} ${l.valor}`} className="botao-icone h-6 w-6 rounded-full p-0"><X size={14} aria-hidden /></button>
            </span>
          ))}
          {(ligados?.length ?? 0) > 0 && onLimpar && <button type="button" onClick={onLimpar} className="link-acao px-1.5 text-sm">Limpar tudo</button>}
          {resultado && <span className="ml-auto text-sm text-slate-500 max-sm:basis-full">{resultado}</span>}
        </div>
      )}
      {painel === "filtros" && filtros && (
        <GavetaFiltros fechar={() => setPainel(null)} onLimpar={onLimpar} resultado={resultado}>{filtros}</GavetaFiltros>
      )}
    </div>
  );
}

/** Painel dos filtros: ao lado no computador, de baixo no celular (ao alcance do dedo). Cada filtro vale na hora;
 *  "Ver o resultado" só fecha. */
function GavetaFiltros({ children, fechar, onLimpar, resultado }: { children: ReactNode; fechar: () => void; onLimpar?: () => void; resultado?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("select, input, button")?.focus(); }, []);
  return (
    <>
      <div className="fixed inset-0 z-janela bg-ink/40" onClick={fechar} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Filtros"
        className="fixed z-janela flex flex-col bg-surface shadow-pop max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[85vh] max-sm:rounded-t-painel sm:inset-y-0 sm:right-0 sm:w-[24rem] sm:border-l sm:border-slate-200">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="flex-1 font-display text-base font-bold text-fg">Filtros</h2>
          <button type="button" onClick={fechar} aria-label="Fechar os filtros" className="botao-icone"><X size={18} /></button>
        </div>
        {/* os campos de cada tela, um embaixo do outro e na largura toda */}
        <div className="flex-1 overflow-y-auto px-4 py-3 [&>*]:w-full [&_.input]:w-full [&_label]:block [&_label]:w-full [&_select]:!h-10 [&_select]:!w-full [&_select]:!py-0 [&_input:not([type=checkbox]):not([type=radio])]:!h-10">
          <div className="grid gap-3 [&>*]:w-full [&>*]:max-w-none">{children}</div>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {onLimpar && <button type="button" onClick={onLimpar} className="link-acao px-1 text-sm">Limpar</button>}
          {resultado && <span className="min-w-0 flex-1 truncate text-right text-sm text-slate-500">{resultado}</span>}
          <Button type="button" onClick={fechar} className="ml-auto"><Check size={16} aria-hidden /> Ver o resultado</Button>
        </div>
      </div>
    </>
  );
}

/** Lista de visões: as prontas da tela (com a contagem) e as que a pessoa salvou (ficam no perfil, valem em qualquer aparelho). */
function MenuVisoes({ visoes, fechar }: { visoes: Visoes; fechar: () => void }) {
  const [salvas, setSalvas] = useState<Salva[]>(() => lerSalvas(visoes.pagina));
  const [nome, setNome] = useState("");
  const podeSalvar = !!(visoes.pagina && visoes.estado && visoes.aplicar);
  function gravar(lista: Salva[]) {
    setSalvas(lista);
    guardarVisoesSalvas(visoes.pagina!, lista);
    supabase.rpc("salvar_preferencias", { p: { [`visoes:${visoes.pagina}`]: lista } }).then(() => null);
  }
  const salvaAtiva = salvas.find((v) => igual(v.estado, visoes.estado))?.id;
  return (
    <div role="listbox" aria-label="Visões" className="cartao absolute left-0 top-full z-gaveta mt-1 w-72 max-w-[calc(100vw-2rem)] p-1.5 shadow-pop">
      <div className="px-2 pb-1 pt-0.5 text-2xs font-bold uppercase tracking-rotulo text-slate-500">Prontas</div>
      {visoes.lista.map((v) => (
        <button key={v.id} type="button" role="option" aria-selected={!salvaAtiva && v.id === visoes.ativa} onClick={() => { visoes.escolher(v.id); fechar(); }}
          className={`linha-clicavel flex w-full items-center gap-2 px-2 py-2 text-left text-sm ${!salvaAtiva && v.id === visoes.ativa ? "font-semibold text-brand" : "text-fg"}`}>
          {v.cor && <span className={`h-2 w-2 shrink-0 rounded-full ${v.cor}`} aria-hidden />}
          <span className="min-w-0 flex-1 truncate">{v.nome}</span>
          {v.n != null && <span className="num text-xs text-slate-500">{v.n}</span>}
        </button>
      ))}
      {podeSalvar && <>
        <div className="mt-1 border-t border-slate-100 px-2 pb-1 pt-2 text-2xs font-bold uppercase tracking-rotulo text-slate-500">Minhas visões</div>
        {salvas.length === 0 && <p className="px-2 pb-1 text-xs text-slate-500">Ligue os filtros que você usa sempre e salve aqui.</p>}
        {salvas.map((v) => (
          <div key={v.id} className="flex items-center">
            <button type="button" role="option" aria-selected={v.id === salvaAtiva} onClick={() => { visoes.aplicar!(v.estado); fechar(); }}
              className={`linha-clicavel min-w-0 flex-1 truncate px-2 py-2 text-left text-sm ${v.id === salvaAtiva ? "font-semibold text-brand" : "text-fg"}`}>{v.nome}</button>
            <button type="button" onClick={() => gravar(salvas.filter((x) => x.id !== v.id))} aria-label={`Apagar a visão ${v.nome}`} title="Apagar esta visão" className="botao-icone h-8 w-8"><X size={14} /></button>
          </div>
        ))}
        <form className="mt-1 flex gap-1.5 border-t border-slate-100 p-1.5 pt-2" onSubmit={(e) => {
          e.preventDefault();
          const n = nome.trim(); if (!n) return;
          gravar([...salvas, { id: `v${Date.now()}`, nome: n.slice(0, 30), estado: visoes.estado! }]);
          setNome("");
        }}>
          <input className="input h-9 min-w-0 flex-1 text-sm" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Minhas de SP)" aria-label="Nome da visão" maxLength={30} />
          <button type="submit" disabled={!nome.trim()} className="botao-mini bg-brand text-brand-fg">Salvar esta</button>
        </form>
      </>}
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
