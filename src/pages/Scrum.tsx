// Scrum das equipes (Gestão → Scrum): cada equipe (ERP Line, Produção, Assistência, Vendas, Financeiro) tem o seu
// backlog, sprints de 1 ou 2 semanas, quadro, daily, revisão, retrospectiva e painel com burndown e velocidade.
// No alto, as equipes lado a lado (a sprint de cada uma e o ritmo); tocar numa equipe abre o trabalho dela.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Flag, Lightbulb } from "lucide-react";
import { Card, PageHeader, Tabs } from "@/components/ui";
import { Backlog } from "@/components/scrum/Backlog";
import { ComoUsar } from "@/components/scrum/ComoUsar";
import { DailyScrum } from "@/components/scrum/DailyScrum";
import { Equipe } from "@/components/scrum/Equipe";
import { PainelScrum } from "@/components/scrum/PainelScrum";
import { Quadro } from "@/components/scrum/Quadro";
import { Sprints } from "@/components/scrum/Sprints";
import { Barra, pct, useScrum } from "@/components/scrum/comum";
import { ItemModal } from "@/components/scrum/ItemModal";
import { usePerfil } from "@/lib/auth";
import { ler } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { diaBrasilia, diasRestantes, resumoDaily, ritmoSprint, velocidade, type Daily, type ItemScrum, type Sprint, type TimeScrum } from "@/lib/scrum";

type Aba = "quadro" | "backlog" | "sprints" | "daily" | "painel" | "equipe";
const ABAS: { value: Aba; label: string }[] = [
  { value: "quadro", label: "Quadro" }, { value: "backlog", label: "Backlog" }, { value: "sprints", label: "Sprints" },
  { value: "daily", label: "Daily" }, { value: "painel", label: "Painel" }, { value: "equipe", label: "Equipe" },
];
const COR_RITMO = { no_ritmo: "text-emerald-700", adiantada: "text-emerald-700", atrasada: "text-red-700", sem_pontos: "text-amber-700" } as const;
const TEXTO_RITMO = { no_ritmo: "no ritmo", adiantada: "adiantada", atrasada: "atrasada", sem_pontos: "sem pontos" } as const;

export default function Scrum() {
  const { user_id } = usePerfil();
  const { times, sprints, itens, pessoas, escolhas, carregando, erro } = useScrum();
  const [params, setParams] = useSearchParams();
  const hoje = diaBrasilia(new Date().toISOString());
  const minhaEquipe = times.find((t) => t.membros.includes(user_id)) ?? times[0];
  const time = times.find((t) => t.id === params.get("time")) ?? minhaEquipe;
  const aba = (ABAS.some((a) => a.value === params.get("aba")) ? params.get("aba") : "quadro") as Aba;
  const ir = (mudar: { time?: string; aba?: Aba }) => {
    const p = new URLSearchParams(params);
    if (mudar.time) p.set("time", mudar.time);
    if (mudar.aba) p.set("aba", mudar.aba);
    setParams(p, { replace: true });
  };
  const [janela, setJanela] = useState<{ item: ItemScrum | null; sprint?: string | null } | null>(null);
  const [diaDaily, setDiaDaily] = useState(hoje);
  // o passo a passo vem aberto enquanto a equipe ainda não fechou nenhuma sprint (depois, fechado; dá para abrir)
  const [guia, setGuia] = useState<boolean | null>(null);

  const doTime = useMemo(() => ({
    sprints: sprints.filter((s) => s.time_id === time?.id),
    itens: itens.filter((i) => i.time_id === time?.id),
  }), [sprints, itens, time?.id]);
  const ativa = doTime.sprints.find((s) => s.status === "ativa") ?? null;
  const planejada = doTime.sprints.find((s) => s.status === "planejada") ?? null;
  const itensAtiva = ativa ? doTime.itens.filter((i) => i.sprint_id === ativa.id) : [];
  const backlog = doTime.itens.filter((i) => !i.sprint_id);
  const media = velocidade(doTime.sprints).media;

  // daily só da sprint em andamento da equipe aberta
  const { data: dailies = [] } = useQuery({
    queryKey: ["scrum_daily", ativa?.id],
    enabled: !!ativa,
    queryFn: async () => ((await ler(supabase.from("scrum_daily").select("*").eq("sprint_id", ativa!.id).order("created_at"))) ?? []) as Daily[],
  });
  const impedimentos = time ? resumoDaily(dailies, time.membros, diaDaily).impedimentos.length : 0;

  if (carregando) return <div><PageHeader title="Scrum das equipes" /><p className="text-sm text-slate-500">Carregando…</p></div>;
  if (erro) return <div><PageHeader title="Scrum das equipes" /><Card className="p-6 text-sm text-red-700">Não deu para abrir o Scrum: {(erro as Error).message}</Card></div>;
  if (!time) return <div><PageHeader title="Scrum das equipes" /><Card className="p-6 text-sm text-slate-500">Nenhuma equipe cadastrada.</Card></div>;

  return (
    <div>
      <PageHeader title="Scrum das equipes"
        subtitle="Backlog, sprints curtas, quadro, daily, revisão e retrospectiva de cada equipe. Entregar pouco e sempre, medir a velocidade e tirar os impedimentos do caminho." />

      <nav aria-label="Equipes" className="relative -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0 xl:grid-cols-5">
        {times.map((t) => <CartaoEquipe key={t.id} time={t} ativo={t.id === time.id} eu={t.membros.includes(user_id)} sprints={sprints} itens={itens} hoje={hoje} onClick={() => ir({ time: t.id })} />)}
      </nav>

      <Card className="mb-4 p-3 sm:p-4" >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-fg"><span className="h-3 w-3 rounded-full" style={{ background: time.cor }} aria-hidden />{time.nome}</h2>
          {ativa ? (
            <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 text-sm text-slate-600">
              <span className="font-semibold text-fg">Sprint {ativa.numero}</span>
              <span>{dataBR(ativa.inicio)} a {dataBR(ativa.fim)} · {diasRestantes(ativa, hoje)} {pl(diasRestantes(ativa, hoje), "dia útil", "dias úteis")} {pl(diasRestantes(ativa, hoje), "resta", "restam")}</span>
              {ativa.objetivo && <span className="flex min-w-0 items-center gap-1"><Flag size={13} className="shrink-0 text-modulo-texto" aria-hidden /><span className="truncate">{ativa.objetivo}</span></span>}
            </p>
          ) : (
            <p className="text-sm text-slate-600">Nenhuma sprint em andamento{planejada ? ` · sprint ${planejada.numero} planejada` : ""}.</p>
          )}
        </div>
      </Card>

      <ComoUsar time={time} backlog={backlog} aberto={guia ?? (!ativa && doTime.sprints.every((s) => s.status !== "encerrada"))} onAberto={setGuia} irPara={(a) => ir({ aba: a })} />

      <Tabs value={aba} onChange={(a) => ir({ aba: a })} options={ABAS} />

      {aba === "quadro" && (ativa
        ? <Quadro time={time} sprint={ativa} itens={itensAtiva} pessoas={pessoas} onAbrir={(i) => setJanela({ item: i })} onNovo={() => setJanela({ item: null, sprint: ativa.id })} />
        : <SemSprint planejada={planejada} onSprints={() => ir({ aba: "sprints" })} onBacklog={() => ir({ aba: "backlog" })} />)}
      {aba === "backlog" && <Backlog time={time} itens={backlog} destino={planejada ?? ativa} media={media} pessoas={pessoas} onAbrir={(i) => setJanela({ item: i })} />}
      {aba === "sprints" && <Sprints time={time} sprints={doTime.sprints} itens={doTime.itens} media={media} onAbrir={(i) => setJanela({ item: i })} />}
      {aba === "daily" && (ativa
        ? <DailyScrum time={time} sprint={ativa} dailies={dailies} pessoas={pessoas} dia={diaDaily} onDia={setDiaDaily} />
        : <SemSprint planejada={planejada} onSprints={() => ir({ aba: "sprints" })} onBacklog={() => ir({ aba: "backlog" })} />)}
      {aba === "painel" && <PainelScrum time={time} sprints={doTime.sprints} ativa={ativa} itensAtiva={itensAtiva} backlog={backlog} impedimentos={impedimentos} pessoas={pessoas} hoje={hoje} />}
      {aba === "equipe" && <Equipe time={time} pessoas={escolhas} />}

      {janela && (
        <ItemModal key={janela.item?.id ?? "novo"} time={times.find((t) => t.id === janela.item?.time_id) ?? time} item={janela.item} sprintInicial={janela.sprint}
          sprints={sprints} itensDoTime={doTime.itens} todosItens={itens} times={times} pessoas={escolhas} todasPessoas={pessoas}
          onClose={() => setJanela(null)} onAbrir={(i) => setJanela({ item: i })} />
      )}
    </div>
  );
}

function SemSprint({ planejada, onSprints, onBacklog }: { planejada: Sprint | null; onSprints: () => void; onBacklog: () => void }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-slate-600">{planejada ? `A sprint ${planejada.numero} está planejada: inicie quando os itens estiverem nela.` : "Nenhuma sprint em andamento."}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onSprints} className="rounded-lg bg-modulo-escuro px-3.5 py-2 text-sm font-semibold text-white">{planejada ? "Abrir a sprint" : "Planejar a sprint"}</button>
        <button type="button" onClick={onBacklog} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700">Ver o backlog</button>
      </div>
    </Card>
  );
}

/** Cartão de uma equipe no alto: sprint em andamento, pontos feitos, ritmo e backlog. */
function CartaoEquipe({ time, ativo, eu, sprints, itens, hoje, onClick }: {
  time: TimeScrum; ativo: boolean; eu: boolean; sprints: Sprint[]; itens: ItemScrum[]; hoje: string; onClick: () => void;
}) {
  const s = sprints.find((x) => x.time_id === time.id && x.status === "ativa");
  const daSprint = s ? itens.filter((i) => i.sprint_id === s.id) : [];
  const r = s ? ritmoSprint(s, daSprint, hoje) : null;
  const backlog = itens.filter((i) => i.time_id === time.id && !i.sprint_id).length;
  const ideias = itens.filter((i) => i.time_id === time.id && i.ideia_id && i.status !== "feito").length;
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`flex min-w-[13rem] shrink-0 flex-col gap-1.5 rounded-2xl border bg-surface p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop md:min-w-0 ${ativo ? "ring-2" : "border-slate-200"}`}
      style={ativo ? { borderColor: time.cor, boxShadow: `0 0 0 2px ${time.cor}` } : undefined}>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: time.cor }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-fg">{time.nome}</span>
        {eu && <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">minha</span>}
      </span>
      {r && s ? (
        <>
          <span className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-600">Sprint {s.numero}</span>
            <span className={`font-bold ${COR_RITMO[r.situacao]}`}>{TEXTO_RITMO[r.situacao]}</span>
          </span>
          <Barra valor={r.progresso} cor={time.cor} rotulo={`Sprint ${s.numero} de ${time.nome}`} />
          <span className="num text-[11px] text-slate-500">{r.feito}/{r.total} pts · {pct(r.progresso)} · {diasRestantes(s, hoje)} d úteis</span>
        </>
      ) : <span className="text-xs text-slate-500">sem sprint em andamento</span>}
      <span className="flex items-center gap-2 text-[11px] text-slate-500">
        <span>backlog: {backlog}</span>
        {ideias > 0 && <span className="flex items-center gap-0.5 text-amber-700"><Lightbulb size={11} aria-hidden />{ideias}</span>}
      </span>
    </button>
  );
}
