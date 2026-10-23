// Filtros das listas de notas: período (atalhos ou de/até), número de/até, valor e UF. Mostra quantas notas
// e o total do que ficou na lista.
import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { brl, hoje, pl } from "@/lib/format";
import { chip } from "@/components/ui";
import { ATALHOS, FILTRO_VAZIO, filtrosEmUso, periodoDoAtalho, type FiltroNota } from "@/lib/filtroNotas";

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

export function useFiltrosNotas() {
  // a lista abre no mês atual (as notas do mês); "Limpar" volta para qualquer data
  const [f, setF] = useState<FiltroNota>(() => ({ ...FILTRO_VAZIO, ...periodoDoAtalho("mes", hoje()) }));
  const [aberto, setAberto] = useState(false);
  return { f, setF, aberto, setAberto };
}

export function BotaoFiltros({ f, aberto, onAbrir }: { f: FiltroNota; aberto: boolean; onAbrir: () => void }) {
  const n = filtrosEmUso(f);
  return (
    <button type="button" onClick={onAbrir} aria-expanded={aberto}
      className={`inline-flex min-h-toque items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition sm:min-h-0 sm:py-2 ${n ? "border-brand bg-brand/10 text-brand" : "border-slate-300 bg-surface text-slate-700 hover:bg-slate-50"}`}>
      <SlidersHorizontal size={16} /> Data, número e valor{n ? ` (${n})` : ""}
    </button>
  );
}

export function PainelFiltros({ f, onChange, comUf = false, rotuloData = "Emissão" }: {
  f: FiltroNota; onChange: (f: FiltroNota) => void; comUf?: boolean; rotuloData?: string;
}) {
  const set = (k: keyof FiltroNota) => (e: { target: { value: string } }) => onChange({ ...f, [k]: e.target.value });
  const dia = hoje();
  const rotulo = "mb-1 block text-xs font-semibold text-slate-600";
  return (
    <div className="cartao mb-3 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-slate-600">{rotuloData}:</span>
        {ATALHOS.map((a) => {
          const p = periodoDoAtalho(a.id, dia);
          const ativo = f.de === p.de && f.ate === p.ate;
          return (
            <button key={a.id} type="button" aria-pressed={ativo} onClick={() => onChange({ ...f, ...(ativo ? { de: "", ate: "" } : p) })}
              className={chip(ativo)}>
              {a.rotulo}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <label><span className={rotulo}>De</span><input className="input" type="date" value={f.de} max={f.ate || undefined} onChange={set("de")} /></label>
        <label><span className={rotulo}>Até</span><input className="input" type="date" value={f.ate} min={f.de || undefined} onChange={set("ate")} /></label>
        <label><span className={rotulo}>Nº da nota (de)</span><input className="input" inputMode="numeric" value={f.numDe} onChange={set("numDe")} placeholder="Ex.: 431" /></label>
        <label><span className={rotulo}>Nº até</span><input className="input" inputMode="numeric" value={f.numAte} onChange={set("numAte")} placeholder="só um nº: deixe vazio" /></label>
        <label><span className={rotulo}>Valor mínimo</span><input className="input" inputMode="decimal" value={f.valorMin} onChange={set("valorMin")} placeholder="R$" /></label>
        <label><span className={rotulo}>Valor máximo</span><input className="input" inputMode="decimal" value={f.valorMax} onChange={set("valorMax")} placeholder="R$" /></label>
        {comUf && (
          <label><span className={rotulo}>UF</span>
            <select className="input" value={f.uf} onChange={set("uf")}><option value="">Todas</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
          </label>
        )}
      </div>
      {filtrosEmUso(f) > 0 && (
        <button type="button" onClick={() => onChange(FILTRO_VAZIO)} className="link-discreto mt-2 inline-flex items-center gap-1 text-xs"><X size={13} /> Limpar filtros</button>
      )}
    </div>
  );
}

/** Número, valor e UF (a data fica no botão de período da barra de filtros). */
export function CamposNota({ f, onChange, comUf = false }: { f: FiltroNota; onChange: (f: FiltroNota) => void; comUf?: boolean }) {
  const set = (k: keyof FiltroNota) => (e: { target: { value: string } }) => onChange({ ...f, [k]: e.target.value });
  const r = "text-xs font-semibold text-slate-600";
  const c = "input mt-0.5 h-9 w-[7.5rem]";
  return (
    <>
      <label className={r}>Nº de<input className={c} inputMode="numeric" value={f.numDe} onChange={set("numDe")} placeholder="Ex.: 431" /></label>
      <label className={r}>Nº até<input className={c} inputMode="numeric" value={f.numAte} onChange={set("numAte")} /></label>
      <label className={r}>Valor mín.<input className={c} inputMode="decimal" value={f.valorMin} onChange={set("valorMin")} placeholder="R$" /></label>
      <label className={r}>Valor máx.<input className={c} inputMode="decimal" value={f.valorMax} onChange={set("valorMax")} placeholder="R$" /></label>
      {comUf && (
        <label className={r}>UF
          <select className="input mt-0.5 h-9 w-[5.5rem]" value={f.uf} onChange={set("uf")}><option value="">Todas</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </label>
      )}
    </>
  );
}

/** Quantos dos campos de número, valor e UF estão em uso (a data conta à parte). */
export const camposEmUso = (f: FiltroNota) => [f.numDe || f.numAte, f.valorMin || f.valorMax, f.uf].filter(Boolean).length;

/** "12 notas · R$ 45.000,00" do que ficou na lista. */
/** Cartões coloridos do que está na lista (o mês, ao abrir): quantas notas, o valor sem as canceladas, o ticket médio
 *  e o que pede atenção (rejeitadas, na fila, processando). `situacao`: chave de situacaoEmitida/situacaoRecebida. */
export function CartoesNotas({ notas, ativo, periodo, tipo }: {
  notas: { valor: number; situacao: string }[]; ativo: boolean; periodo: { de?: string; ate?: string }; tipo: "emitidas" | "recebidas";
}) {
  if (!ativo) return null;
  const validas = notas.filter((x) => x.situacao !== "cancelada");
  const total = validas.reduce((t, x) => t + x.valor, 0);
  const canceladas = notas.length - validas.length;
  const atencao = notas.filter((x) => ["erro", "denegada", "processando", "contingencia", "pendente", "aguardando_vinculo", "revisao"].includes(x.situacao)).length;
  const quando = periodo.de && periodo.ate ? (periodo.de.slice(0, 7) === periodo.ate.slice(0, 7) && periodo.de.endsWith("-01") ? nomeDoMes(periodo.de) : `${dataCurta(periodo.de)} a ${dataCurta(periodo.ate)}`) : "todas as datas";
  const cards: [string, string, string, string][] = [
    [tipo === "emitidas" ? "Notas emitidas" : "Notas recebidas", String(notas.length), quando, "from-sky-500/15 to-sky-500/5 text-sky-700"],
    ["Valor", brl(total), canceladas ? `sem ${canceladas} ${pl(canceladas, "cancelada", "canceladas")}` : "sem canceladas", "from-emerald-500/15 to-emerald-500/5 text-emerald-700"],
    ["Ticket médio", validas.length ? brl(total / validas.length) : "—", `${validas.length} ${pl(validas.length, "nota válida", "notas válidas")}`, "from-violet-500/15 to-violet-500/5 text-violet-700"],
    ["Pedem atenção", String(atencao), atencao ? (tipo === "emitidas" ? "rejeitadas, na fila ou processando" : "conferir ou vincular produto") : "tudo certo", atencao ? "from-red-500/15 to-red-500/5 text-red-700" : "from-slate-500/10 to-slate-500/5 text-slate-500"],
  ];
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map(([rot, valor, sub, cor]) => (
        <div key={rot} className={`rounded-2xl border border-slate-200 bg-gradient-to-br p-3 ${cor}`}>
          <p className="text-2xs font-semibold uppercase opacity-80">{rot}</p>
          <p className="num text-xl font-bold text-fg">{valor}</p>
          <p className="truncate text-2xs opacity-80">{sub}</p>
        </div>
      ))}
    </div>
  );
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
