// Sobre → Resumo (a página de entrada do Sobre): um painel com tudo de relance. Primeiro a Central dos chats (quem
// está publicando, quem precisa de você e a linha do tempo); depois um cartão curto de cada parte — próximos passos
// do Handoff, pedidos do dia, ideias, a rodada em curso e o que mudou — cada um com o atalho para a aba completa.
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Clock, Flag, History, Hourglass, Lightbulb, ListChecks, Rocket, ThumbsUp, UserRound, Zap, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { useRows } from "@/lib/data";
import { dataBR, hoje, pl } from "@/lib/format";
import { RODADA_ATUAL } from "@/lib/rodada";
import { atrasada, indicadoresHandoff, indicadoresIdeias, partesTituloIdeia, proximosPassos, ROTULO_RESPONSAVEL, type ItemProjeto } from "@/lib/projeto";
import { CentralChats, type ChatCentral } from "./CentralChats";
import { useItensProjeto } from "./ItemProjeto";

export type AbaResumo = "handoff" | "pedidos" | "ideias" | "rodada" | "atualizacoes";
type Versao = { numero: string; dia: string; titulo?: string | null; itens: string[]; mudancas: unknown[] };
type ItemChecklist = { id: string; pedido_em: string; grupo: string; item: string; situacao: "feito" | "fazendo" | "fila" | "voce" };

/** Cartão do resumo: ícone na cor da parte, título, o atalho para a aba completa e o conteúdo. */
function Bloco({ titulo, icone: Icone, cor, abrir, rotuloAbrir, children }: {
  titulo: string; icone: LucideIcon; cor: string; abrir: () => void; rotuloAbrir: string; children: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${cor} text-white shadow-sm`} aria-hidden><Icone size={16} /></span>
        <h2 className="min-w-0 flex-1 truncate text-base font-bold text-fg">{titulo}</h2>
        <button type="button" onClick={abrir} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-modulo-texto hover:underline">
          {rotuloAbrir} <ArrowRight size={13} aria-hidden />
        </button>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  );
}

/** Número pequeno com rótulo, na cor do assunto. */
function Numero({ rotulo, valor, tom = "neutro", icone: Icone }: { rotulo: string; valor: ReactNode; tom?: "neutro" | "bom" | "atencao" | "critico" | "info"; icone?: LucideIcon }) {
  const cor = { neutro: "bg-slate-100 text-fg", bom: "bg-emerald-50 text-emerald-700", atencao: "bg-amber-50 text-amber-700", critico: "bg-red-50 text-red-700", info: "bg-sky-50 text-sky-700" }[tom];
  return (
    <div className={`min-w-0 rounded-lg px-2.5 py-2 ${cor}`}>
      <div className="num flex items-center gap-1.5 text-lg font-bold leading-none">{Icone && <Icone size={14} aria-hidden />}{valor}</div>
      <div className="mt-1 truncate text-2xs font-semibold opacity-80">{rotulo}</div>
    </div>
  );
}

const COR_CHECK: Record<ItemChecklist["situacao"], string> = { feito: "bg-emerald-500", fazendo: "bg-amber-500", fila: "bg-slate-400", voce: "bg-red-500" };

export function ResumoSobre({ ehAdmin, podeHandoff, ultima, onIrAba }: {
  ehAdmin: boolean; podeHandoff: boolean; ultima: Versao | null; onIrAba: (a: AbaResumo) => void;
}) {
  const dia = hoje();
  const { data: chats = [] } = useRows<ChatCentral>("chats_claude", { order: "ordem", ascending: true });
  const { data: itens = [] } = useItensProjeto();
  const { data: checklist = [] } = useRows<ItemChecklist>("pedidos_checklist", { order: "ordem", ascending: true });
  const ind = indicadoresHandoff(itens, dia);
  const passos = proximosPassos(itens as ItemProjeto[], dia, 5);
  const ideias = indicadoresIdeias(itens.filter((i) => i.tipo === "ideia"));
  // pedidos: o dia mais recente com pedido
  const diaPedidos = checklist.reduce((m, i) => (i.pedido_em > m ? i.pedido_em : m), "");
  const doDia = checklist.filter((i) => i.pedido_em === diaPedidos);
  const conta = (s: ItemChecklist["situacao"]) => doDia.filter((i) => i.situacao === s).length;
  const precisam = checklist.filter((i) => i.situacao === "voce");
  const feitosRodada = RODADA_ATUAL.pedidos.filter((p) => p.situacao === "feito").length;

  return (
    <div className="space-y-4">
      {/* 1ª seção: a central dos chats */}
      {ehAdmin && <CentralChats chats={chats} />}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {podeHandoff && (
          <Bloco titulo="Próximos passos" icone={ListChecks} cor="from-sky-500 to-blue-700" abrir={() => onIrAba("handoff")} rotuloAbrir="Handoff">
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              <Numero rotulo="abertas" valor={ind.abertas} />
              <Numero rotulo="alta prioridade" valor={ind.alta} tom={ind.alta ? "critico" : "neutro"} icone={Flag} />
              <Numero rotulo="atrasadas" valor={ind.atrasadas} tom={ind.atrasadas ? "critico" : "bom"} icone={AlertTriangle} />
              <Numero rotulo="aguardando" valor={ind.aguardando} tom={ind.aguardando ? "atencao" : "neutro"} icone={Hourglass} />
            </div>
            {!passos.length ? <p className="text-sm text-slate-500">Nenhuma pendência para fazer agora.</p> : (
              <ol className="space-y-1.5">
                {passos.map((p, n) => (
                  <li key={p.id} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-1.5">
                    <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-modulo/15 text-xs font-bold text-modulo-texto">{n + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg" title={p.titulo}>{partesTituloIdeia(p.titulo).texto}</span>
                      <span className="flex flex-wrap gap-x-2 text-2xs text-slate-500">
                        {p.responsavel && <span>{ROTULO_RESPONSAVEL[p.responsavel]}</span>}
                        {p.prioridade === "alta" && <span className="font-bold text-red-600">alta</span>}
                        {p.situacao === "andamento" && <span className="font-semibold text-sky-600">fazendo</span>}
                        {p.prazo && <span className={atrasada(p, dia) ? "font-bold text-red-600" : ""}>prazo {dataBR(p.prazo).slice(0, 5)}</span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Bloco>
        )}

        <Bloco titulo="Pedidos" icone={ClipboardList} cor="from-emerald-500 to-teal-700" abrir={() => onIrAba("pedidos")} rotuloAbrir="Checklist">
          <p className="mb-2 text-xs text-slate-500">{diaPedidos ? `Do dia ${dataBR(diaPedidos)}: ${doDia.length} ${pl(doDia.length, "pedido", "pedidos")}` : "Nenhum pedido ainda."}</p>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            <Numero rotulo="feitos" valor={conta("feito")} tom="bom" icone={CheckCircle2} />
            <Numero rotulo="fazendo" valor={conta("fazendo")} tom={conta("fazendo") ? "atencao" : "neutro"} icone={Clock} />
            <Numero rotulo="na fila" valor={conta("fila")} />
            <Numero rotulo="precisam de você" valor={precisam.length} tom={precisam.length ? "critico" : "bom"} icone={UserRound} />
          </div>
          {doDia.length > 0 && (
            <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              {(["feito", "fazendo", "fila", "voce"] as const).map((s) => conta(s) > 0 && <span key={s} className={COR_CHECK[s]} style={{ width: `${(conta(s) / doDia.length) * 100}%` }} />)}
            </div>
          )}
          {precisam.length > 0 && (
            <ul className="space-y-1">
              {precisam.slice(0, 3).map((i) => (
                <li key={i.id} className="flex min-w-0 items-center gap-2 text-sm"><span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden /><span className="truncate text-fg" title={i.item}>{i.item}</span></li>
              ))}
              {precisam.length > 3 && <li className="text-xs text-slate-500">e mais {precisam.length - 3}.</li>}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Ideias" icone={Lightbulb} cor="from-amber-500 to-orange-600" abrir={() => onIrAba("ideias")} rotuloAbrir="Ver ideias">
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            <Numero rotulo="novas" valor={ideias.novas} tom={ideias.novas ? "atencao" : "neutro"} />
            <Numero rotulo="em avaliação" valor={ideias.avaliando} tom="info" />
            <Numero rotulo="planejadas" valor={ideias.planejadas} tom="info" />
            <Numero rotulo="feitas" valor={ideias.feitas} tom="bom" />
          </div>
          <div className="space-y-1.5 text-sm">
            {ideias.maisVotada && (
              <p className="flex min-w-0 items-center gap-2"><ThumbsUp size={14} className="shrink-0 text-sky-600" aria-hidden />
                <span className="truncate"><b className="text-fg">Mais votada:</b> {partesTituloIdeia(ideias.maisVotada.titulo).texto} ({ideias.maisVotada.votos.length})</span></p>
            )}
            <p className="flex items-center gap-2"><Zap size={14} className="shrink-0 text-emerald-600" aria-hidden />
              <span><b className="text-fg">{ideias.ganhoRapido}</b> {pl(ideias.ganhoRapido, "ideia", "ideias")} de ganho rápido (ajuda muito, pouco trabalho)</span></p>
          </div>
        </Bloco>

        {podeHandoff && (
          <Bloco titulo="Rodada atual" icone={Rocket} cor="from-indigo-500 to-violet-700" abrir={() => onIrAba("rodada")} rotuloAbrir="Rodada">
            <p className="font-semibold leading-snug text-fg">{RODADA_ATUAL.titulo}</p>
            <p className="mt-1 line-clamp-3 text-sm text-slate-600">{RODADA_ATUAL.resumo}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-indigo-500" style={{ width: `${RODADA_ATUAL.pedidos.length ? (feitosRodada / RODADA_ATUAL.pedidos.length) * 100 : 0}%` }} /></span>
              <span className="num font-semibold">{feitosRodada} de {RODADA_ATUAL.pedidos.length} feitos</span>
            </div>
          </Bloco>
        )}

        {ultima && (
          <Bloco titulo="O que mudou" icone={History} cor="from-teal-500 to-cyan-700" abrir={() => onIrAba("atualizacoes")} rotuloAbrir="Atualizações">
            <p className="text-sm text-slate-600"><b className="text-fg">Versão {ultima.numero}</b> · {dataBR(ultima.dia)} · {ultima.mudancas.length} {pl(ultima.mudancas.length, "mudança", "mudanças")} no dia</p>
            {ultima.titulo && <p className="mt-1 text-sm font-semibold text-fg">{ultima.titulo}</p>}
            <ul className="mt-2 space-y-1">
              {ultima.itens.slice(0, 4).map((t) => <li key={t} className="flex gap-2 text-sm text-slate-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden /><span className="line-clamp-2">{t}</span></li>)}
            </ul>
          </Bloco>
        )}

      </div>
    </div>
  );
}
