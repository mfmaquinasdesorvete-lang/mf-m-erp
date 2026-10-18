// Painel da equipe: números da sprint em andamento, burndown, velocidade das últimas sprints e pontos por pessoa.
import { AlertTriangle, CalendarClock, Flame, Gauge, ListTodo, Trophy } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { pl } from "@/lib/format";
import {
  burndown, diasRestantes, pontosPorPessoa, ritmoSprint, somaPontos, sprintsParaBacklog, velocidade,
  type ItemScrum, type Sprint, type TimeScrum,
} from "@/lib/scrum";
import { Avatar, nomeDe, pct, type Pessoa } from "./comum";

const RITMO = {
  no_ritmo: { texto: "No ritmo", tom: "bom" },
  adiantada: { texto: "Adiantada", tom: "bom" },
  atrasada: { texto: "Atrasada", tom: "critico" },
  sem_pontos: { texto: "Sem pontos", tom: "atencao" },
} as const;

const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function PainelScrum({ time, sprints, ativa, itensAtiva, backlog, impedimentos, pessoas, hoje }: {
  time: TimeScrum; sprints: Sprint[]; ativa: Sprint | null; itensAtiva: ItemScrum[]; backlog: ItemScrum[];
  impedimentos: number; pessoas: Pessoa[]; hoje: string;
}) {
  const vel = velocidade(sprints);
  const ptsBacklog = somaPontos(backlog);
  const prev = sprintsParaBacklog(ptsBacklog, vel.media);
  const ritmo = ativa ? ritmoSprint(ativa, itensAtiva, hoje) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <Stat label={ativa ? `Sprint ${ativa.numero}` : "Sprint"} icon={Flame} valor={ritmo ? `${ritmo.feito}/${ritmo.total}` : "—"}
          sub={ritmo ? `pontos feitos · ${pct(ritmo.progresso)}` : "nenhuma em andamento"} />
        <Stat label="Ritmo" icon={Gauge} valor={ritmo ? RITMO[ritmo.situacao].texto : "—"} tom={ritmo ? RITMO[ritmo.situacao].tom : "neutro"}
          sub={ritmo ? `${pct(ritmo.tempo)} do tempo passou` : undefined} />
        <Stat label="Dias úteis restantes" icon={CalendarClock} valor={ativa ? diasRestantes(ativa, hoje) : "—"} tom={ativa && diasRestantes(ativa, hoje) <= 1 ? "atencao" : "neutro"} />
        <Stat label="Velocidade" icon={Trophy} valor={vel.media != null ? `${vel.media} pts` : "—"}
          sub={vel.entrega != null ? `entrega ${pct(vel.entrega)} do planejado` : "aparece depois da 1ª sprint"} />
        <Stat label="Backlog" icon={ListTodo} valor={`${ptsBacklog} pts`} sub={prev != null ? `cerca de ${prev} ${pl(prev, "sprint", "sprints")}` : `${backlog.length} ${pl(backlog.length, "item", "itens")}`} />
        <Stat label="Impedimentos" icon={AlertTriangle} valor={impedimentos} tom={impedimentos ? "critico" : "bom"} sub={impedimentos ? "abertos na daily" : "nenhum aberto"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {ativa ? <Burndown time={time} sprint={ativa} itens={itensAtiva} hoje={hoje} /> : (
          <Card className="grid min-h-[200px] place-items-center p-6 text-center text-sm text-slate-500">O burndown aparece quando a sprint começa.</Card>
        )}
        <Velocidade time={time} historico={vel.historico} media={vel.media} />
      </div>
      {ativa && itensAtiva.length > 0 && <PorPessoa time={time} itens={itensAtiva} pessoas={pessoas} />}
    </div>
  );
}

/** Pontos que faltam por dia útil: linha ideal tracejada e a real na cor da equipe. */
function Burndown({ time, sprint, itens, hoje }: { time: TimeScrum; sprint: Sprint; itens: ItemScrum[]; hoje: string }) {
  const b = burndown(sprint, itens, hoje);
  const W = 600, H = 230, E = 36, D = 12, T = 12, B = 28;
  const max = Math.max(1, b.inicial, b.escopo, ...b.real.filter((v): v is number => v != null));
  const x = (i: number) => E + (b.dias.length > 1 ? (i * (W - E - D)) / (b.dias.length - 1) : (W - E - D) / 2);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const reais = b.real.map((v, i) => (v == null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => !!p);
  const marcas = [0, Math.floor((b.dias.length - 1) / 2), b.dias.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const preenchidos = b.real.filter((v): v is number => v != null);
  const ultimo = preenchidos.length ? preenchidos[preenchidos.length - 1] : null;
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-fg">Burndown · sprint {sprint.numero}</h3>
        <span className="text-xs text-slate-500">{ultimo != null ? `faltam ${ultimo} pts` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Burndown: começou com ${b.inicial} pontos${ultimo != null ? `, faltam ${ultimo}` : ""}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={E} x2={W - D} y1={y(max * f)} y2={y(max * f)} className="stroke-slate-200" strokeWidth={1} />
            <text x={E - 6} y={y(max * f) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{Math.round(max * f)}</text>
          </g>
        ))}
        {marcas.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">{diaMes(b.dias[i]!)}</text>)}
        <polyline points={b.ideal.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" className="stroke-slate-400" strokeWidth={2} strokeDasharray="6 5" />
        {reais.length > 0 && <polyline points={reais.map((p) => p.join(",")).join(" ")} fill="none" stroke={time.cor} strokeWidth={3} strokeLinejoin="round" />}
        {reais.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill={time.cor} />)}
      </svg>
      <p className="mt-1 flex gap-4 text-[11px] text-slate-500"><span>╌ ideal</span><span style={{ color: time.cor }}>━ real</span><span>Abaixo da linha ideal = adiantada.</span></p>
    </Card>
  );
}

function Velocidade({ time, historico, media }: { time: TimeScrum; historico: Sprint[]; media: number | null }) {
  if (!historico.length) {
    return <Card className="grid min-h-[200px] place-items-center p-6 text-center text-sm text-slate-500">A velocidade aparece depois da primeira sprint encerrada.</Card>;
  }
  const W = 600, H = 230, E = 36, T = 12, B = 28;
  const max = Math.max(1, ...historico.map((s) => Math.max(s.pontos_planejados ?? 0, s.pontos_feitos ?? 0)));
  const largura = (W - E - 12) / historico.length;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-fg">Velocidade · planejado × feito</h3>
        {media != null && <span className="text-xs text-slate-500">média das 3 últimas: {media} pts</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Velocidade das últimas ${historico.length} sprints`}>
        <line x1={E} x2={W - 12} y1={y(0)} y2={y(0)} className="stroke-slate-300" />
        <text x={E - 6} y={y(max) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{max}</text>
        {historico.map((s, i) => {
          const x0 = E + i * largura + largura * 0.15, w = largura * 0.33;
          return (
            <g key={s.id}>
              <rect x={x0} y={y(s.pontos_planejados ?? 0)} width={w} height={y(0) - y(s.pontos_planejados ?? 0)} rx={3} className="fill-slate-300" />
              <rect x={x0 + w + 2} y={y(s.pontos_feitos ?? 0)} width={w} height={y(0) - y(s.pontos_feitos ?? 0)} rx={3} fill={time.cor} />
              <text x={x0 + w} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">S{s.numero}</text>
            </g>
          );
        })}
        {media != null && <line x1={E} x2={W - 12} y1={y(media)} y2={y(media)} stroke={time.cor} strokeDasharray="4 4" strokeWidth={1.5} />}
      </svg>
      <p className="mt-1 flex gap-4 text-[11px] text-slate-500"><span>▮ planejado</span><span style={{ color: time.cor }}>▮ feito</span><span>╌ média</span></p>
    </Card>
  );
}

function PorPessoa({ time, itens, pessoas }: { time: TimeScrum; itens: ItemScrum[]; pessoas: Pessoa[] }) {
  const lista = pontosPorPessoa(itens);
  const max = Math.max(1, ...lista.map((p) => p.feito + p.aberto));
  return (
    <Card className="p-4">
      <h3 className="mb-2 font-bold text-fg">Pontos por pessoa na sprint</h3>
      <ul className="space-y-2">
        {lista.map((p) => (
          <li key={p.id || "ninguem"} className="flex items-center gap-2 text-sm">
            <Avatar nome={p.id ? nomeDe(pessoas, p.id) : "?"} cor={p.id ? time.cor : undefined} />
            <span className="w-32 shrink-0 truncate sm:w-44">{nomeDe(pessoas, p.id || null)}</span>
            <div className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div style={{ width: `${(p.feito / max) * 100}%`, background: time.cor }} />
              <div className="bg-slate-300" style={{ width: `${(p.aberto / max) * 100}%` }} />
            </div>
            <span className="num w-20 shrink-0 text-right text-xs text-slate-600">{p.feito} / {p.feito + p.aberto} pts</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
