// Gráficos em SVG puro (sem biblioteca): colunas simples, colunas agrupadas e barras horizontais.
// Regras: barras ≤ 24px com ponta arredondada de 4px e base reta, grade de 1px discreta,
// legenda quando há 2+ séries, detalhe ao passar o mouse e alternativa em tabela.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { brl } from "@/lib/format";

export type Serie = { nome: string; cor: string };
type Ponto = { rotulo: string; valores: number[] };

const compacto = (v: number) =>
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : Math.abs(v) >= 1e3 ? `${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`
      : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Arredonda o topo do eixo para um número "limpo" e gera 4 divisões. */
function escala(max: number) {
  if (max <= 0) return { topo: 1, ticks: [0] };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto)!;
  const topo = passo * 4;
  return { topo, ticks: [0, 1, 2, 3, 4].map((i) => i * passo) };
}

/** Caminho de uma coluna com ponta arredondada (4px) e base reta. */
function coluna(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function Legenda({ series }: { series: Serie[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => (
        <span key={s.nome} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} aria-hidden /> {s.nome}
        </span>
      ))}
    </div>
  );
}

/** Colunas (1 ou 2 séries lado a lado) com eixo em R$. */
export function Colunas({ dados, series, altura = 220, formatar = brl }: {
  dados: Ponto[]; series: Serie[]; altura?: number; formatar?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const largura = 640;
  const m = { t: 10, r: 8, b: 28, l: 58 };
  const ih = altura - m.t - m.b;
  const iw = largura - m.l - m.r;
  const { topo, ticks } = useMemo(() => escala(Math.max(0, ...dados.flatMap((d) => d.valores))), [dados]);
  const banda = iw / Math.max(dados.length, 1);
  const barra = Math.min(24, (banda * 0.7) / series.length);
  const gap = 2;
  const grupo = barra * series.length + gap * (series.length - 1);
  const y = (v: number) => m.t + ih - (v / topo) * ih;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Legenda series={series} />
        <button onClick={() => setTabela(!tabela)} className="ml-auto text-xs font-semibold text-brand hover:underline">
          {tabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {tabela ? (
        <TabelaDados dados={dados} series={series} formatar={formatar} />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${largura} ${altura}`} className="h-auto w-full" role="img"
            aria-label={`Gráfico: ${series.map((s) => s.nome).join(" e ")}`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={largura - m.r} y1={y(t)} y2={y(t)} stroke="var(--grade)" strokeWidth={1} />
                <text x={m.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={12} fill="var(--eixo-texto)" className="num">{compacto(t)}</text>
              </g>
            ))}
            {dados.map((d, i) => {
              const x0 = m.l + i * banda + (banda - grupo) / 2;
              return (
                <g key={d.rotulo} onMouseEnter={() => setHover(i)}>
                  <rect x={m.l + i * banda} y={m.t} width={banda} height={ih} fill={hover === i ? "var(--hover)" : "transparent"} />
                  {d.valores.map((v, s) => (
                    <path key={s} d={coluna(x0 + s * (barra + gap), y(v), barra, y(0) - y(v))} fill={series[s].cor} />
                  ))}
                  <text x={m.l + i * banda + banda / 2} y={altura - 8} textAnchor="middle" fontSize={12} fill="var(--eixo-texto)">{d.rotulo}</text>
                </g>
              );
            })}
            <line x1={m.l} x2={largura - m.r} y1={y(0)} y2={y(0)} stroke="var(--eixo)" strokeWidth={1} />
          </svg>
          {hover !== null && (
            <Dica esquerda={((m.l + hover * banda + banda / 2) / largura) * 100}>
              <div className="mb-1 font-semibold text-fg">{dados[hover].rotulo}</div>
              {series.map((s, k) => (
                <div key={s.nome} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.cor }} />
                  <span className="text-slate-500">{s.nome}</span>
                  <span className="num ml-auto pl-3 font-semibold text-fg">{formatar(dados[hover].valores[k])}</span>
                </div>
              ))}
            </Dica>
          )}
        </div>
      )}
    </div>
  );
}

function Dica({ esquerda, children }: { esquerda: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-1 z-10 min-w-[150px] -translate-x-1/2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs shadow-pop"
      style={{ left: `${Math.min(Math.max(esquerda, 14), 86)}%` }}>
      {children}
    </div>
  );
}

/** Ranking em barras horizontais (ex.: produtos mais vendidos). Série única: sem legenda. */
export function Ranking({ itens, cor = "var(--serie-1)", formatar = brl }: {
  itens: { rotulo: string; valor: number; detalhe?: string }[]; cor?: string; formatar?: (v: number) => string;
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length) return <p className="py-6 text-center text-sm text-slate-500">Sem vendas no período.</p>;
  return (
    <ul className="space-y-3">
      {itens.map((i) => (
        <li key={i.rotulo} title={`${i.rotulo}: ${formatar(i.valor)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{i.rotulo}</span>
            <span className="num shrink-0 font-semibold text-fg">{formatar(i.valor)}</span>
          </div>
          <div className="h-2 rounded-r bg-slate-100">
            <div className="h-2 rounded-r" style={{ width: `${(i.valor / max) * 100}%`, background: cor }} />
          </div>
          {i.detalhe && <div className="mt-0.5 text-xs text-slate-500">{i.detalhe}</div>}
        </li>
      ))}
    </ul>
  );
}

function TabelaDados({ dados, series, formatar }: { dados: Ponto[]; series: Serie[]; formatar: (v: number) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr><th className="th pl-0">Período</th>{series.map((s) => <th key={s.nome} className="th text-right">{s.nome}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {dados.map((d) => (
            <tr key={d.rotulo}>
              <td className="py-1.5 text-slate-600">{d.rotulo}</td>
              {d.valores.map((v, k) => <td key={k} className="num py-1.5 text-right">{formatar(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Largura real do contêiner, para o SVG ser desenhado em pixels de verdade (texto legível no celular). */
function useLargura(padrao = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(padrao);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Curva suave (Catmull-Rom → Bézier) passando pelos pontos. */
function curva(p: [number, number][]) {
  if (!p.length) return "";
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const lim = (v: number) => Math.min(Math.max(v, Math.min(p1[1], p2[1])), Math.max(p1[1], p2[1]));
    d += ` C${c1[0]},${lim(c1[1])} ${c2[0]},${lim(c2[1])} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Área com linha suave e preenchimento em degradê (1 a 3 séries), cursor com detalhe e alternativa em tabela. */
export function Area({ dados, series, altura = 240, formatar = brl }: {
  dados: Ponto[]; series: Serie[]; altura?: number; formatar?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const [ref, largura] = useLargura();
  const m = { t: 12, r: 22, b: 28, l: 54 };
  const ih = altura - m.t - m.b;
  const iw = largura - m.l - m.r;
  const { topo, ticks } = useMemo(() => escala(Math.max(0, ...dados.flatMap((d) => d.valores))), [dados]);
  const passo = iw / Math.max(dados.length - 1, 1);
  const x = (i: number) => m.l + i * passo;
  const y = (v: number) => m.t + ih - (v / topo) * ih;
  const id = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Legenda series={series} />
        <button onClick={() => setTabela(!tabela)} className="ml-auto text-xs font-semibold text-brand hover:underline">
          {tabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {tabela ? <TabelaDados dados={dados} series={series} formatar={formatar} /> : (
        <div className="relative" ref={ref}>
          <svg viewBox={`0 0 ${largura} ${altura}`} width={largura} height={altura} className="block w-full touch-pan-y" role="img"
            aria-label={`Gráfico de área: ${series.map((s) => s.nome).join(" e ")}`}
            onMouseLeave={() => setHover(null)}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - r.left) / r.width) * largura;
              setHover(Math.max(0, Math.min(dados.length - 1, Math.round((px - m.l) / passo))));
            }}>
            <defs>
              {series.map((s, k) => (
                <linearGradient key={k} id={`g${id}${k}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.cor} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={s.cor} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={largura - m.r} y1={y(t)} y2={y(t)} stroke="var(--grade)" strokeWidth={1} />
                <text x={m.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={12} fill="var(--eixo-texto)" className="num">{compacto(t)}</text>
              </g>
            ))}
            {series.map((s, k) => {
              const pts = dados.map((d, i) => [x(i), y(d.valores[k] ?? 0)] as [number, number]);
              const linha = curva(pts);
              return (
                <g key={s.nome}>
                  <path d={`${linha} L${x(dados.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#g${id}${k})`} />
                  <path d={linha} fill="none" stroke={s.cor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            })}
            {dados.map((d, i) => (
              <text key={d.rotulo} x={x(i)} y={altura - 8} textAnchor="middle" fontSize={12} fill="var(--eixo-texto)">{d.rotulo}</text>
            ))}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={y(0)} stroke="var(--eixo)" strokeWidth={1} strokeDasharray="3 3" />
                {series.map((s, k) => (
                  <circle key={k} cx={x(hover)} cy={y(dados[hover].valores[k] ?? 0)} r={4.5} fill={s.cor} stroke="rgb(var(--surface))" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
          {hover !== null && (
            <Dica esquerda={(x(hover) / largura) * 100}>
              <div className="mb-1 font-semibold text-fg">{dados[hover].rotulo}</div>
              {series.map((s, k) => (
                <div key={s.nome} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.cor }} />
                  <span className="text-slate-500">{s.nome}</span>
                  <span className="num ml-auto pl-3 font-semibold text-fg">{formatar(dados[hover].valores[k] ?? 0)}</span>
                </div>
              ))}
            </Dica>
          )}
        </div>
      )}
    </div>
  );
}

/** Rosca com total no centro e legenda com valor e % ao lado. */
export function Rosca({ fatias, total: rotuloTotal = "Total", formatar = brl }: {
  fatias: { rotulo: string; valor: number; cor: string }[]; total?: string; formatar?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const soma = fatias.reduce((s, f) => s + f.valor, 0);
  const R = 52, C = 2 * Math.PI * R, folga = soma > 0 && fatias.filter((f) => f.valor > 0).length > 1 ? 3 : 0;
  let acum = 0;
  const foco = hover !== null ? fatias[hover] : null;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" role="img" aria-label={fatias.map((f) => `${f.rotulo}: ${formatar(f.valor)}`).join("; ")}>
          <circle cx={64} cy={64} r={R} fill="none" stroke="rgb(var(--slate-100))" strokeWidth={14} />
          {soma > 0 && fatias.map((f, i) => {
            const len = (f.valor / soma) * C;
            const el = f.valor > 0 && (
              <circle key={f.rotulo} cx={64} cy={64} r={R} fill="none" stroke={f.cor} strokeWidth={hover === i ? 17 : 14}
                strokeDasharray={`${Math.max(len - folga, 0.5)} ${C}`} strokeDashoffset={-acum}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-pointer transition-[stroke-width]" />
            );
            acum += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{foco ? foco.rotulo : rotuloTotal}</div>
            <div className="num text-lg font-bold leading-tight text-fg">{compacto(foco ? foco.valor : soma)}</div>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {fatias.map((f, i) => (
          <li key={f.rotulo} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${hover === i ? "bg-slate-50" : ""}`}>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: f.cor }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-slate-700">{f.rotulo}</span>
            <span className="num font-semibold text-fg">{formatar(f.valor)}</span>
            <span className="num w-10 text-right text-xs text-slate-500">{soma ? Math.round((f.valor / soma) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
