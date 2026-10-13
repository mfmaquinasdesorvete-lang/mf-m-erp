// Peças comuns dos painéis de cada área (Vendas, Notas, Financeiro…): cabeçalho na cor da área com o período,
// cartões com tendência, funil, filtro por clique, "precisa de atenção" e atalhos para as telas da área.
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowRight, ArrowUpRight, X, type LucideIcon } from "lucide-react";
import { hoje, somarDias } from "@/lib/format";
import { todosItens, useVisivel } from "@/lib/menu";
import type { Tela } from "@/lib/permissoes";

export type Periodo = "hoje" | "7d" | "30d" | "mes" | "ano";
/** `anterior`: para "vs …" nos cartões · `comparado`: para frases ("32% a mais que no mês passado") */
export const PERIODOS: { id: Periodo; rotulo: string; anterior: string; comparado: string }[] = [
  { id: "hoje", rotulo: "Hoje", anterior: "ontem", comparado: "ontem" },
  { id: "7d", rotulo: "7 dias", anterior: "7 dias antes", comparado: "nos 7 dias anteriores" },
  { id: "30d", rotulo: "30 dias", anterior: "30 dias antes", comparado: "nos 30 dias anteriores" },
  { id: "mes", rotulo: "Mês", anterior: "mês passado", comparado: "no mês passado" },
  { id: "ano", rotulo: "Ano", anterior: "ano passado", comparado: "no ano passado" },
];

/** "32% a mais que no mês passado" (vazio quando não há com o que comparar). */
export function frasePeriodo(delta: number | null | undefined, p: Periodo, mais = "a mais", menos = "a menos") {
  if (delta == null || Math.round(delta) === 0) return "";
  return `${Math.abs(Math.round(delta))}% ${delta > 0 ? mais : menos} que ${PERIODOS.find((x) => x.id === p)!.comparado}`;
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Faixa = [string, string];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (dia: string) => new Date(dia + "T12:00:00Z");

/** Período escolhido e o anterior de mesmo tamanho (datas AAAA-MM-DD). Mês e ano comparam até o mesmo dia. */
export function intervalos(p: Periodo): { atual: Faixa; anterior: Faixa } {
  const fim = hoje();
  const d = utc(fim);
  if (p === "mes" || p === "ano") {
    const ini = p === "mes" ? `${fim.slice(0, 7)}-01` : `${fim.slice(0, 4)}-01-01`;
    const ant = p === "mes" ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1, 12)) : new Date(Date.UTC(d.getUTCFullYear() - 1, 0, 1, 12));
    const ultimoDia = p === "mes" ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0, 12)).getUTCDate() : 31;
    const fimAnt = p === "mes"
      ? `${iso(ant).slice(0, 8)}${String(Math.min(d.getUTCDate(), ultimoDia)).padStart(2, "0")}`
      : `${d.getUTCFullYear() - 1}${fim.slice(4)}`;
    return { atual: [ini, fim], anterior: [iso(ant), fimAnt === `${d.getUTCFullYear() - 1}-02-29` ? `${d.getUTCFullYear() - 1}-02-28` : fimAnt] };
  }
  const n = p === "hoje" ? 1 : p === "7d" ? 7 : 30;
  return { atual: [somarDias(-(n - 1)), fim], anterior: [somarDias(-(2 * n - 1)), somarDias(-n)] };
}

/** Data (ou data e hora) dentro da faixa. */
export const dentro = (data: string | null | undefined, [a, b]: Faixa) => !!data && data.slice(0, 10) >= a && data.slice(0, 10) <= b;

/** Variação em % (null = antes era zero e agora não é · undefined = zero nos dois: nada a comparar). */
export const variacao = (agora: number, antes: number): number | null | undefined => (antes > 0 ? ((agora - antes) / antes) * 100 : agora > 0 ? null : undefined);

export type Balde = { rotulo: string; atual: Faixa; anterior: Faixa };
/**
 * Pedaços do gráfico: dia a dia (Hoje mostra os últimos 7 dias, para ter com o que comparar) ou mês a mês no Ano.
 * Cada pedaço traz também o pedaço equivalente do período anterior.
 */
export function baldes(p: Periodo): Balde[] {
  if (p === "ano") {
    const d = utc(hoje());
    return Array.from({ length: d.getUTCMonth() + 1 }, (_, m) => {
      const mm = String(m + 1).padStart(2, "0");
      const ult = String(new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0, 12)).getUTCDate()).padStart(2, "0");
      const ultAnt = String(new Date(Date.UTC(d.getUTCFullYear() - 1, m + 1, 0, 12)).getUTCDate()).padStart(2, "0");
      return { rotulo: MESES[m], atual: [`${d.getUTCFullYear()}-${mm}-01`, `${d.getUTCFullYear()}-${mm}-${ult}`], anterior: [`${d.getUTCFullYear() - 1}-${mm}-01`, `${d.getUTCFullYear() - 1}-${mm}-${ultAnt}`] };
    });
  }
  const { atual, anterior } = intervalos(p === "hoje" ? "7d" : p);
  const dias: Balde[] = [];
  const deslocamento = Math.round((utc(atual[0]).getTime() - utc(anterior[0]).getTime()) / 864e5);
  for (let t = utc(atual[0]); iso(t) <= atual[1]; t = new Date(t.getTime() + 864e5)) {
    const dia = iso(t);
    const antes = iso(new Date(t.getTime() - deslocamento * 864e5));
    dias.push({ rotulo: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`, atual: [dia, dia], anterior: [antes, antes] });
  }
  return dias;
}

/** Período lembrado por área (cada painel guarda o seu). */
export function usePeriodo(area: string, padrao: Periodo = "mes") {
  const chave = `erp.painel.${area}.periodo`;
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    try { const v = localStorage.getItem(chave) as Periodo | null; return v && PERIODOS.some((p) => p.id === v) ? v : padrao; } catch { return padrao; }
  });
  const escolher = (p: Periodo) => { setPeriodo(p); try { localStorage.setItem(chave, p); } catch { /* sem armazenamento */ } };
  return [periodo, escolher] as const;
}

/** Cabeçalho na cor da área: título, frase-resumo, período e botões. */
export function CabecalhoPainel({ icone: Icone, area, titulo, resumo, periodo, onPeriodo, acoes }: {
  icone: LucideIcon; area: string; titulo: string; resumo?: ReactNode; periodo?: Periodo; onPeriodo?: (p: Periodo) => void; acoes?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-modulo to-modulo-escuro p-4 text-white shadow-card sm:p-6">
      <span className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur" aria-hidden><Icone size={24} /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">Painel · {area}</p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{titulo}</h1>
            {resumo && <p className="mt-1 max-w-2xl text-[15px] leading-snug text-white/90">{resumo}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {acoes}
          {periodo && onPeriodo && (
            <div role="tablist" aria-label="Período" className="grid grid-cols-5 gap-0.5 rounded-xl bg-black/15 p-1 ring-1 ring-white/15 backdrop-blur sm:inline-grid">
              {PERIODOS.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} onClick={() => onPeriodo(p.id)}
                  className={`min-h-[36px] whitespace-nowrap rounded-lg px-2.5 text-[13px] font-bold transition sm:px-3 ${periodo === p.id ? "bg-white text-modulo-texto shadow" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
                  {p.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Linha de tendência pequena dentro do cartão. */
function Faisca({ valores, cor }: { valores: number[]; cor: string }) {
  if (valores.length < 2 || valores.every((v) => v === 0)) return <div className="h-8" aria-hidden />;
  const max = Math.max(...valores), min = Math.min(0, ...valores);
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * 100, 28 - ((v - min) / (max - min || 1)) * 24 - 2] as const);
  const linha = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={`${linha} L100,28 L0,28 Z`} fill={cor} fillOpacity={0.12} />
      <path d={linha} fill="none" stroke={cor} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export type Cartao = {
  id: string; rotulo: string; valor: ReactNode; sub?: ReactNode; icone: LucideIcon; cor: string;
  /** variação em % contra o período anterior; `bomCair` para o que é melhor quando diminui (atrasos, devoluções) */
  delta?: number | null; bomCair?: boolean; tendencia?: number[]; onClick?: () => void; titulo?: string;
};

/** Cartão de indicador: número grande, variação contra o período anterior e linha de tendência. */
export function CartaoPainel({ c, anterior }: { c: Cartao; anterior?: string }) {
  const melhorou = c.delta == null ? true : c.bomCair ? c.delta <= 0 : c.delta >= 0;
  const Tag = c.onClick ? "button" : "div";
  return (
    <Tag type={c.onClick ? "button" : undefined} onClick={c.onClick} title={c.titulo}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface p-3.5 text-left shadow-card transition sm:p-4 ${c.onClick ? "hover:-translate-y-0.5 hover:shadow-pop" : ""}`}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: c.cor }} aria-hidden />
      <span className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold leading-tight text-slate-600">{c.rotulo}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${c.cor} 16%, transparent)`, color: c.cor }}><c.icone size={18} /></span>
      </span>
      <span className="num mt-1 block text-[22px] font-extrabold leading-none tracking-tight text-fg [overflow-wrap:anywhere] sm:text-[26px]">{c.valor}</span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
        {c.delta !== undefined && (
          c.delta === null
            ? <span className="font-semibold text-emerald-600">novo</span>
            : <span className={`inline-flex items-center font-bold ${melhorou ? "text-emerald-600" : "text-red-600"}`} title={anterior ? `comparado com ${anterior}` : undefined}>
                {c.delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(Math.round(c.delta))}%
                {anterior && <span className="ml-1 hidden font-normal text-slate-500 sm:inline">vs {anterior}</span>}
              </span>
        )}
        {c.sub && <span className="w-full leading-snug">{c.sub}</span>}
      </span>
      {c.tendencia && <span className="mt-2 block"><Faisca valores={c.tendencia} cor={c.cor} /></span>}
    </Tag>
  );
}

export type EtapaFunil = { rotulo: string; valor: number; sub?: string; onClick?: () => void };
/** Funil: cada etapa com a largura proporcional à primeira e a passagem (%) de uma etapa para a próxima. */
export function Funil({ etapas, cor = "rgb(var(--modulo))" }: { etapas: EtapaFunil[]; cor?: string }) {
  const base = Math.max(1, etapas[0]?.valor ?? 0);
  return (
    <ol className="space-y-1.5">
      {etapas.map((e, i) => {
        const largura = Math.max(6, (e.valor / base) * 100);
        const passou = i > 0 && etapas[i - 1].valor > 0 ? Math.round((e.valor / etapas[i - 1].valor) * 100) : null;
        const corpo = (
          <>
            <span className="relative block h-10 overflow-hidden rounded-xl bg-slate-100">
              <span className="absolute inset-y-0 left-0 rounded-xl transition-[width] duration-500"
                style={{ width: `${largura}%`, background: `color-mix(in srgb, ${cor} ${92 - i * 12}%, transparent)` }} />
              <span className="relative flex h-full items-center justify-between gap-2 px-3 text-sm">
                <span className="truncate font-semibold text-fg [text-shadow:0_0_6px_rgb(var(--surface))]">{e.rotulo}</span>
                <span className="num shrink-0 font-bold text-fg [text-shadow:0_0_6px_rgb(var(--surface))]">{e.valor}</span>
              </span>
            </span>
            {(e.sub || passou !== null) && (
              <span className="mt-0.5 block px-1 text-xs text-slate-500">
                {passou !== null && <b className="num text-slate-600">{passou}% da etapa anterior</b>}{passou !== null && e.sub ? " · " : ""}{e.sub}
              </span>
            )}
          </>
        );
        return (
          <li key={e.rotulo}>
            {e.onClick
              ? <button type="button" onClick={e.onClick} className="block w-full rounded-xl text-left transition hover:brightness-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-modulo">{corpo}</button>
              : corpo}
          </li>
        );
      })}
    </ol>
  );
}

/** Filtros escolhidos clicando nos gráficos (canal, vendedor…): mostra e deixa limpar. */
export function FiltrosAtivos({ filtros, onLimpar }: { filtros: { rotulo: string; valor: string; limpar: () => void }[]; onLimpar: () => void }) {
  if (!filtros.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-modulo/30 bg-modulo/5 px-3 py-2 text-sm">
      <span className="font-semibold text-slate-600">Mostrando só:</span>
      {filtros.map((f) => (
        <button key={f.rotulo} type="button" onClick={f.limpar} title="Tirar este filtro"
          className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 font-semibold text-fg shadow-sm ring-1 ring-slate-200 hover:ring-slate-300">
          <span className="text-slate-500">{f.rotulo}:</span> {f.valor} <X size={14} className="text-slate-400" />
        </button>
      ))}
      <button type="button" onClick={onLimpar} className="ml-auto text-xs font-semibold text-modulo-texto hover:underline">Ver tudo</button>
    </div>
  );
}

export type ItemAtencao = { icone: LucideIcon; cor: string; texto: string; sub?: string; to: string; state?: unknown };
/** Lista "Precisa de atenção": cada linha leva para onde resolver. */
export function ListaAtencao({ itens, vazio = "Tudo em dia por aqui." }: { itens: ItemAtencao[]; vazio?: string }) {
  if (!itens.length) return <p className="py-8 text-center text-slate-500">{vazio} ✅</p>;
  return (
    <ul className="space-y-2">
      {itens.map((a) => (
        <li key={a.texto}>
          <Link to={a.to} state={a.state} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-slate-200 hover:bg-slate-50">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${a.cor} 16%, transparent)`, color: a.cor }}><a.icone size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-snug text-slate-700">{a.texto}</span>
              {a.sub && <span className="block truncate text-xs text-slate-500">{a.sub}</span>}
            </span>
            <ArrowRight size={16} className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-modulo-texto" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** `tela`: o atalho só aparece para quem pode abrir a tela */
export type Atalho = { rotulo: string; icone: LucideIcon; to: string; state?: unknown; aviso?: number; tela?: Tela };
/** Atalhos para as telas da área (estilo app), com contador do que está pendente. */
export function AtalhosArea({ itens: todos, colunas = "grid-cols-3 sm:grid-cols-6" }: { itens: Atalho[]; colunas?: string }) {
  const navigate = useNavigate();
  const vis = useVisivel();
  // some o atalho da tela que a pessoa não vê (papel ou escondida em Usuários → Perfis)
  const itens = todos.filter((a) => { const m = todosItens.find((i) => i.to === a.to); return m ? vis.item(m) : !a.tela || vis.ve(a.tela); });
  if (!itens.length) return null;
  return (
    <div className={`grid gap-2 rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-card sm:gap-3 ${colunas}`}>
      {itens.map((a) => (
        <button key={a.rotulo} type="button" onClick={() => navigate(a.to, { state: a.state })}
          className="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-center transition hover:bg-slate-50">
          <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-modulo/15 text-modulo-texto ring-1 ring-modulo/25 transition group-hover:scale-105">
            <a.icone size={22} />
            {!!a.aviso && <span className="num absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-solido-vermelho px-1 text-[11px] font-bold text-white ring-2 ring-[rgb(var(--surface))]">{a.aviso}</span>}
          </span>
          <span className="text-xs font-semibold leading-tight text-slate-700 sm:text-[13px]">{a.rotulo}</span>
        </button>
      ))}
    </div>
  );
}
