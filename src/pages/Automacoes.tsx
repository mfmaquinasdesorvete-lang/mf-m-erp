// Gestão → Automações (só o administrador): tudo o que o ERP faz sozinho, sem ninguém apertar botão, separado por área
// (financeiro, notas, vendas, cadastros, avisos, equipe e IA, sistema), com quando roda (horário de Brasília), se está em
// dia e o atalho para a tela. Embaixo, as próximas automações que estão na fila de pedidos (grupo IA do Sobre → Pedidos).
// Os mesmos números do Sobre → Monitor (saude_sistema); o Monitor fica com os detalhes técnicos.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, ListTodo, PauseCircle, RefreshCw, Zap } from "lucide-react";
import { Button, Card, PageHeader, Stat } from "@/components/ui";
import { haQuanto, useSaude } from "@/components/sobre/Monitor";
import { useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { pl } from "@/lib/format";
import {
  AREAS_AUTOMACAO, AUTOMACOES, SITUACAO_AUTO, agendaEmPortugues, situacaoAutomacao, type AreaAutomacao, type Automacao,
} from "@/lib/monitor";

type ItemFila = { id: string; item: string; detalhe: string | null; situacao: string; grupo: string; pedido_em: string };
const PROBLEMA = new Set(["falhou", "atrasada"]);

export default function Automacoes() {
  const { master } = usePerfil();
  const q = useSaude();
  const s = q.data;
  const { data: pedidos = [] } = useRows<ItemFila>("pedidos_checklist", {
    select: "id, item, detalhe, situacao, grupo, pedido_em", order: "pedido_em", key: ["automacoes"],
    filtro: (x) => x.eq("grupo", "IA").in("situacao", ["fila", "fazendo"]),
  });

  const porArea = useMemo(() => {
    const grupos = new Map<AreaAutomacao | "outras", Automacao[]>();
    for (const a of s?.automacoes ?? []) {
      const area = AUTOMACOES[a.nome]?.area ?? "outras";
      if (area === "pessoal" && !master) continue; // carteira pessoal: só a conta master
      grupos.set(area, [...(grupos.get(area) ?? []), a]);
    }
    return grupos;
  }, [s, master]);

  if (q.isError) return <Card className="p-4 text-sm text-red-800">Não deu para ler as automações: {(q.error as Error).message}</Card>;
  const todas = [...porArea.values()].flat();
  const sit = (a: Automacao) => situacaoAutomacao(a, s!.agora);
  const comProblema = s ? todas.filter((a) => PROBLEMA.has(sit(a))).length : 0;
  const ordem = [...(Object.keys(AREAS_AUTOMACAO) as AreaAutomacao[]), "outras" as const];

  return (
    <div className="space-y-5">
      <PageHeader title="Automações" subtitle="O que o ERP faz sozinho, sem ninguém apertar botão. Horários de Brasília."
        actions={<Button variant="secondary" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw size={16} className={q.isFetching ? "animate-spin" : ""} /> Conferir agora</Button>} />

      {!s ? <Card className="p-4 text-sm text-slate-500">Conferindo as automações…</Card> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Automações" valor={todas.length} icon={Zap} tom="info" sub="rodando sozinhas" />
            <Stat label="Em dia" valor={todas.filter((a) => sit(a) === "ok").length} icon={CheckCircle2} tom="bom" />
            <Stat label="Com problema" valor={comProblema} icon={AlertTriangle} tom={comProblema ? "critico" : "neutro"} sub="falhou ou atrasada" />
            <Stat label="Desligadas" valor={todas.filter((a) => sit(a) === "desligada").length} icon={PauseCircle} tom="neutro" />
          </div>

          {ordem.filter((area) => porArea.get(area)?.length).map((area) => (
            <section key={area}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{area === "outras" ? "Outras" : AREAS_AUTOMACAO[area]}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {porArea.get(area)!.sort((a, b) => (AUTOMACOES[a.nome]?.nome ?? a.nome).localeCompare(AUTOMACOES[b.nome]?.nome ?? b.nome)).map((a) => {
                  const st = SITUACAO_AUTO[sit(a)];
                  const def = AUTOMACOES[a.nome];
                  return (
                    <li key={a.nome}>
                      <Card className="flex h-full flex-col gap-1.5 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.ponto}`} aria-hidden />
                          <h3 className="min-w-0 flex-1 font-bold text-fg">{def?.nome ?? a.nome}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${st.cor}`}>{st.nome}</span>
                        </div>
                        {def && <p className="text-sm text-slate-600">{def.texto}</p>}
                        <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-1 text-xs text-slate-500">
                          <Clock size={12} aria-hidden /> {agendaEmPortugues(a.agenda)} · última {haQuanto(a.ultima, s.agora)}
                          {a.falhas_24h ? <b className="text-red-700">· {a.falhas_24h} {pl(a.falhas_24h, "falha", "falhas")} em 24 h</b> : null}
                          {def?.tela && <Link to={def.tela} className="ml-auto inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">Abrir <ArrowRight size={12} aria-hidden /></Link>}
                        </p>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-fg"><ListTodo size={18} className="text-brand" aria-hidden /> Próximas automações (na fila de pedidos)</h2>
        <p className="mb-3 text-sm text-slate-500">O que já foi pedido para a IA do dia a dia e ainda não está pronto. A lista sai do Sobre → Pedidos.</p>
        {!pedidos.length ? <p className="text-sm text-slate-500">Nada na fila.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {pedidos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-2 py-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${p.situacao === "fazendo" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"}`}>{p.situacao === "fazendo" ? "Fazendo" : "Na fila"}</span>
                <span className="min-w-0 flex-1 basis-64"><b className="text-fg">{p.item}</b>{p.detalhe && <span className="block text-xs text-slate-500">{p.detalhe}</span>}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">Detalhes técnicos (erros, funções e backup): <Link to="/sobre?aba=monitor" className="font-semibold text-sky-700 hover:underline">Sobre → Chats e saúde → Monitor</Link></p>
      </Card>
    </div>
  );
}
