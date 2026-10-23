// Quadro por etapas no jeito do Fluxo de pedidos, para as outras telas de processo (OS, compras, produção…):
// a faixa "precisa de ação agora", um bloco por etapa (quantos, quanto vale, quantos pedem ação), o quadro com uma
// coluna por etapa no computador e uma etapa embaixo da outra no celular e no tablet. Cada tela monta o seu cartão
// com o CartaoEtapa: quem, quanto, há quanto tempo, o próximo passo e o botão que faz esse passo.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Loader2, X, type LucideIcon } from "lucide-react";
import { RolagemLateral } from "@/components/ui";
import { brl } from "@/lib/format";

export type Nivel = 0 | 1 | 2;
export type EtapaQuadro = { id: string; titulo: string; curto: string; frase: string; cor: string };
export type ItemQuadro = { id: string; etapa: string; nivel: Nivel; alerta?: string | null; desde: string; valor?: number };

const NO_QUADRO = 25;

/** Tela larga o bastante para o quadro com colunas */
function useTelaLarga(q = "(min-width: 1024px)") {
  const [ok, setOk] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const f = () => setOk(m.matches);
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, [q]);
  return ok;
}

/** Ordena: o mais grave primeiro, depois o que espera há mais tempo */
export function ordenarQuadro<T extends ItemQuadro>(l: T[]) {
  return [...l].sort((a, b) => b.nivel - a.nivel || a.desde.localeCompare(b.desde));
}

export function QuadroEtapas<T extends ItemQuadro>({ etapas, itens, cartao, carregando, nome, mostrarValor = true }: {
  etapas: EtapaQuadro[]; itens: T[]; cartao: (i: T) => ReactNode; carregando?: boolean;
  /** como chamar um item e vários ("OS"/"OS", "ordem de compra"/"ordens de compra") */
  nome: [string, string]; mostrarValor?: boolean;
}) {
  const largo = useTelaLarga();
  const [etapa, setEtapaState] = useState<string | null>(null);
  // escolheu uma etapa no bloco: rola até a lista dela (senão ela abre lá embaixo, fora da vista)
  const setEtapa = (e: string | null) => { setEtapaState(e); if (e) setTimeout(() => document.getElementById("quadro-lista")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const [soAcao, setSoAcao] = useState(false);
  const [alerta, setAlerta] = useState<string | null>(null);

  const { resumo, porAlerta, total, nivelGeral } = useMemo(() => {
    const resumo = new Map(etapas.map((e) => [e.id, { qtd: 0, valor: 0, alertas: 0, nivel: 0 as Nivel }]));
    const porAlerta = new Map<string, number>();
    let total = 0, nivelGeral: Nivel = 0;
    for (const i of itens) {
      const r = resumo.get(i.etapa);
      if (!r) continue;
      r.qtd++;
      r.valor += Number(i.valor || 0);
      if (i.nivel > 0) {
        total++;
        r.alertas++;
        r.nivel = Math.max(r.nivel, i.nivel) as Nivel;
        nivelGeral = Math.max(nivelGeral, i.nivel) as Nivel;
        if (i.alerta) porAlerta.set(i.alerta, (porAlerta.get(i.alerta) ?? 0) + 1);
      }
    }
    return { resumo, porAlerta: [...porAlerta], total, nivelGeral };
  }, [itens, etapas]);

  const porEtapa = useMemo(() => {
    const m = new Map<string, T[]>(etapas.map((e) => [e.id, []]));
    for (const i of itens) {
      if ((soAcao && i.nivel === 0) || (alerta && i.alerta !== alerta)) continue;
      m.get(i.etapa)?.push(i);
    }
    for (const [k, l] of m) m.set(k, ordenarQuadro(l));
    return m;
  }, [itens, etapas, soAcao, alerta]);

  const filtrando = soAcao || !!alerta;
  const vazio = filtrando ? "Nada pedindo ação nesta etapa." : `Nenhuma ${nome[0]} nesta etapa agora.`;
  const valorDe = (l: T[]) => l.reduce((s, i) => s + Number(i.valor || 0), 0);

  return (
    <div className="space-y-3">
      {/* precisa de ação agora */}
      {!total ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={18} className="shrink-0" /> Nada atrasado: tudo em dia.
        </div>
      ) : (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-1.5 ${nivelGeral === 2 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <AlertTriangle size={18} className={`shrink-0 ${nivelGeral === 2 ? "text-red-600" : "text-amber-700"}`} />
          <div className="flex min-w-0 flex-1 basis-56 flex-wrap items-center gap-x-2 gap-y-1">
            <p className={`text-sm font-bold ${nivelGeral === 2 ? "text-red-800" : "text-amber-900"}`}>
              {total} {total === 1 ? `${nome[0]} precisa` : `${nome[1]} precisam`} de ação agora
            </p>
            <div className="flex flex-wrap gap-1.5">
              {porAlerta.map(([a, n]) => (
                <button key={a} type="button" aria-pressed={alerta === a} onClick={() => { const igual = alerta === a; setAlerta(igual ? null : a); setSoAcao(!igual); }}
                  className={`max-w-full truncate whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold transition ${alerta === a
                    ? "border-brand bg-brand text-brand-fg" : "border-slate-300 bg-surface text-slate-700 hover:border-brand hover:text-brand"}`}>
                  {n} {a}
                </button>
              ))}
            </div>
          </div>
          <button type="button" aria-pressed={filtrando} onClick={() => { setSoAcao(!filtrando); setAlerta(null); }}
            className={`inline-flex min-h-[38px] w-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1 text-sm font-semibold shadow-sm transition sm:min-h-0 sm:w-auto ${
              filtrando ? "bg-brand text-brand-fg" : "border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50"}`}>
            {filtrando ? <><X size={15} /> Ver todas</> : "Ver só essas"}
          </button>
        </div>
      )}

      {/* um bloco por etapa (no celular, uma faixa que rola para o lado em vez de 3 linhas de blocos) */}
      <div className={`faixa-chips gap-2 pt-1.5 sm:grid sm:grid-cols-3 sm:pt-0 ${etapas.length > 6 ? "lg:grid-cols-7" : etapas.length > 4 ? "lg:grid-cols-6" : "lg:grid-cols-4"}`} role="tablist" aria-label="Etapas">
        {etapas.map((e) => {
          const r = resumo.get(e.id)!;
          const ativo = etapa === e.id;
          return (
            <button key={e.id} type="button" role="tab" aria-selected={ativo} onClick={() => setEtapa(ativo ? null : e.id)} title={`${e.titulo}: ${e.frase}`}
              className={`relative flex w-[6.5rem] min-w-0 flex-col rounded-xl border bg-surface p-2 text-left sm:w-auto shadow-card transition hover:-translate-y-0.5 hover:border-brand/60 sm:p-3 ${ativo ? "border-brand ring-2 ring-brand/40" : "border-slate-200"}`}>
              <span className="flex items-center gap-1.5 text-2xs font-semibold leading-tight text-slate-600 sm:pr-5 sm:text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.cor }} />
                <span className="truncate">{e.curto}</span>
              </span>
              <span className={`num mt-1.5 text-2xl font-bold leading-none ${r.qtd ? "text-fg" : "text-slate-400"}`}>{r.qtd}</span>
              {mostrarValor && <span className="num mt-1 truncate text-2xs text-slate-500">{brl(r.valor)}</span>}
              {r.alertas > 0 && (
                <span className={`num absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-2xs font-bold text-white ring-2 ring-[rgb(var(--canvas))] sm:right-2 sm:top-2 sm:ring-0 ${r.nivel === 2 ? "bg-solido-vermelho" : "bg-solido-ambar"}`}
                  aria-label={`${r.alertas} pedem ação`}>{r.alertas}</span>
              )}
            </button>
          );
        })}
      </div>

      <div id="quadro-lista" className="scroll-mt-20" />
      {carregando ? (
        <p className="py-10 text-center text-slate-500">Carregando…</p>
      ) : etapa ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setEtapa(null)} className="link-acao inline-flex items-center gap-1.5 text-sm">
            <ArrowLeft size={15} /> Ver todas as etapas
          </button>
          <Secao e={etapas.find((x) => x.id === etapa)!} lista={porEtapa.get(etapa) ?? []} limite={200} vazio={vazio} cartao={cartao} valor={mostrarValor ? valorDe : undefined} />
        </div>
      ) : largo ? (
        <RolagemLateral className="-mx-1" caixa="px-1 pb-3">
          <div className="flex min-w-full gap-2.5">
            {etapas.map((e) => {
              const lista = porEtapa.get(e.id) ?? [];
              if (!lista.length) {
                return (
                  <button key={e.id} type="button" onClick={() => setEtapa(e.id)} title={`${e.titulo}: ${e.frase}`}
                    className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-3 text-slate-400 transition hover:border-slate-300 hover:text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.cor }} />
                    <span className="num text-xs font-bold">0</span>
                    <span className="rotate-180 whitespace-nowrap text-xs font-semibold [writing-mode:vertical-rl]">{e.titulo}</span>
                  </button>
                );
              }
              return (
                <section key={e.id} className="flex min-w-[220px] flex-1 basis-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-1.5">
                  <header className="px-1.5 pb-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.cor }} />
                      <h2 className="flex-1 text-sm font-bold leading-tight text-fg">{e.titulo}</h2>
                      <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{lista.length}</span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-500">{e.frase}</p>
                    {mostrarValor && <div className="num mt-1.5 text-xs font-semibold text-slate-600">{brl(valorDe(lista))}</div>}
                  </header>
                  <div className="space-y-2">{lista.slice(0, NO_QUADRO).map(cartao)}</div>
                  {lista.length > NO_QUADRO && (
                    <button type="button" onClick={() => setEtapa(e.id)} className="mt-2 rounded-lg py-2 text-sm font-semibold text-brand hover:bg-slate-100">Ver mais {lista.length - NO_QUADRO}</button>
                  )}
                </section>
              );
            })}
          </div>
        </RolagemLateral>
      ) : (
        <div className="space-y-5">
          {etapas.map((e) => {
            const lista = porEtapa.get(e.id) ?? [];
            if (!lista.length) {
              return (
                <button key={e.id} type="button" onClick={() => setEtapa(e.id)}
                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-left text-sm text-slate-400">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.cor }} />
                  <span className="font-semibold">{e.titulo}</span>
                  <span className="ml-auto text-xs">{filtrando ? "nada pedindo ação" : "nenhuma"}</span>
                </button>
              );
            }
            return <Secao key={e.id} e={e} lista={lista} limite={NO_QUADRO} vazio={vazio} cartao={cartao} valor={mostrarValor ? valorDe : undefined} onMais={() => setEtapa(e.id)} />;
          })}
        </div>
      )}
    </div>
  );
}

function Secao<T extends ItemQuadro>({ e, lista, limite, vazio, cartao, valor, onMais }: {
  e: EtapaQuadro; lista: T[]; limite: number; vazio: string; cartao: (i: T) => ReactNode; valor?: (l: T[]) => number; onMais?: () => void;
}) {
  return (
    <section>
      <header className="mb-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.cor }} />
          <h2 className="text-base font-bold text-fg">{e.titulo}</h2>
          <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{lista.length}</span>
          {valor && <span className="num text-sm text-slate-500">{brl(valor(lista))}</span>}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{e.frase}</p>
      </header>
      {lista.length ? (
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">{lista.slice(0, limite).map(cartao)}</div>
      ) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">{vazio}</p>}
      {lista.length > limite && onMais && (
        <button type="button" onClick={onMais} className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-brand hover:bg-slate-100">Ver mais {lista.length - limite}</button>
      )}
    </section>
  );
}

/** Dias desde a data (0 = hoje) */
export function diasDesde(data: string | null | undefined, hoje = new Date()) {
  if (!data) return 0;
  const d = new Date(data.length <= 10 ? `${data}T12:00:00` : data);
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / 86400000));
}

/** Cartão de uma etapa: quem, quanto, há quanto tempo, o alerta, o próximo passo e o botão que faz esse passo */
export function CartaoEtapa({ cor, titulo, subtitulo, valor, etiquetas, dias, nivel, alerta, proximo, botao, onAbrir, extra }: {
  cor: string; titulo: ReactNode; subtitulo?: ReactNode; valor?: number | null; etiquetas?: ReactNode; dias?: number;
  nivel: Nivel; alerta?: string | null; proximo?: string;
  botao?: { rotulo: string; icon: LucideIcon; onClick: () => void; ocupado?: boolean; secundario?: boolean } | null;
  onAbrir: () => void; extra?: ReactNode;
}) {
  return (
    <article className={`rounded-xl border border-l-4 bg-surface p-2.5 shadow-sm transition hover:shadow-card ${nivel === 2 ? "border-red-300" : nivel === 1 ? "border-amber-300" : "border-slate-200"}`}
      style={{ borderLeftColor: cor }}>
      <button type="button" onClick={onAbrir} className="block w-full text-left">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-fg">{titulo}</span>
            {subtitulo && <span className="block truncate text-sm text-slate-600">{subtitulo}</span>}
          </span>
          {!!valor && <span className="num shrink-0 whitespace-nowrap text-sm font-bold text-fg">{brl(valor)}</span>}
        </span>
        {(etiquetas || dias != null) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {etiquetas}
            {dias != null && (
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold ${nivel === 2 ? "bg-red-50 text-red-700" : nivel === 1 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                <Clock size={11} aria-hidden /> {dias === 0 ? "hoje" : `${dias} ${dias === 1 ? "dia" : "dias"}`}
              </span>
            )}
          </span>
        )}
        {alerta && nivel > 0 && <span className={`mt-1.5 block text-xs font-bold ${nivel === 2 ? "text-red-700" : "text-amber-800"}`}>{alerta}</span>}
      </button>
      {(proximo || botao || extra) && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          {proximo && <p className="text-xs text-slate-500">Próximo passo: <b className="text-slate-700">{proximo}</b></p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {botao && (
              <button type="button" disabled={botao.ocupado} onClick={botao.onClick}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${botao.secundario
                  ? "border border-slate-300 bg-surface text-fg hover:border-brand" : "bg-brand text-brand-fg hover:opacity-90"}`}>
                {botao.ocupado ? <Loader2 size={14} className="animate-spin" /> : <botao.icon size={14} aria-hidden />} {botao.rotulo}
              </button>
            )}
            {extra}
          </div>
        </div>
      )}
    </article>
  );
}
