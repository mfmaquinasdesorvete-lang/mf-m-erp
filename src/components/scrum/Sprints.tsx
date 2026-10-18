// Sprints da equipe: planejar (objetivo, datas e itens), iniciar, encerrar com a revisão e a retrospectiva, e o
// histórico. Ao encerrar, o que não terminou volta para o backlog (função scrum_encerrar_sprint).
import { useState, type FormEvent } from "react";
import { CalendarRange, CheckCircle2, Flag, Play, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import {
  ROTULO_SPRINT, acimaDaCapacidade, diasDaSprint, proximaSprint, somaPontos, type ItemScrum, type Sprint, type TimeScrum,
} from "@/lib/scrum";
import { Barra, ChipTipo, Pontos, pct } from "./comum";

export function Sprints({ time, sprints, itens, media, onAbrir }: {
  time: TimeScrum; sprints: Sprint[]; itens: ItemScrum[]; media: number | null; onAbrir: (i: ItemScrum) => void;
}) {
  const { papel } = usePerfil();
  const invalidar = useInvalidate();
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<Sprint | null>(null);
  const [encerrando, setEncerrando] = useState<Sprint | null>(null);
  const ordenadas = [...sprints].sort((a, b) => b.numero - a.numero);
  const temPlanejada = sprints.some((s) => s.status === "planejada");
  const ativa = sprints.find((s) => s.status === "ativa");
  const daSprint = (s: Sprint) => itens.filter((i) => i.sprint_id === s.id);

  async function iniciar(s: Sprint) {
    const pts = somaPontos(daSprint(s));
    if (!daSprint(s).length) return notify("Coloque itens do backlog na sprint antes de iniciar.", "erro");
    if (!(await confirmar(`Iniciar a sprint ${s.numero} com ${pts} pontos? O burndown começa a contar.`, { ok: "Iniciar" }))) return;
    const { error } = await supabase.rpc("scrum_iniciar_sprint", { p_sprint: s.id });
    if (error) return notifyError(error);
    invalidar("scrum_sprints");
    notify(`Sprint ${s.numero} em andamento. Boa sprint!`);
  }

  async function excluir(s: Sprint) {
    if (!(await confirmar(`Excluir a sprint ${s.numero}? Os itens dela voltam para o backlog.`, { perigo: true, ok: "Excluir" }))) return;
    const { error } = await supabase.from("scrum_sprints").delete().eq("id", s.id);
    if (error) return notifyError(error);
    invalidar("scrum_sprints", "scrum_itens");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => setNova(true)} disabled={temPlanejada} title={temPlanejada ? "Já existe uma sprint planejada" : undefined}>
          <CalendarRange size={16} aria-hidden /> Planejar próxima sprint
        </Button>
        <p className="text-[13px] text-slate-600">
          Sprint de {time.sprint_dias === 7 ? "1 semana" : "2 semanas"}{media != null && <> · velocidade média <b className="num">{media}</b> pts</>}
          {temPlanejada && " · já existe uma sprint planejada: mande itens do backlog para ela."}
        </p>
      </div>

      {!ordenadas.length && <Card className="p-8 text-center text-sm text-slate-500">Nenhuma sprint ainda. Planeje a primeira: um objetivo curto e os itens do alto do backlog que cabem no período.</Card>}

      {ordenadas.map((s) => {
        const lista = daSprint(s);
        const pts = somaPontos(lista);
        const feitos = somaPontos(lista.filter((i) => i.status === "feito"));
        const alerta = s.status === "planejada" && acimaDaCapacidade(pts, media);
        return (
          <Card key={s.id} className={`p-4 ${s.status === "ativa" ? "ring-2 ring-modulo" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-fg">
                  Sprint {s.numero}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.status === "ativa" ? "bg-sky-100 text-sky-800" : s.status === "planejada" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{ROTULO_SPRINT[s.status]}</span>
                </h3>
                <p className="text-[13px] text-slate-600">{dataBR(s.inicio)} a {dataBR(s.fim)} · {diasDaSprint(s.inicio, s.fim).length} dias úteis</p>
                {s.objetivo && <p className="mt-1 flex items-start gap-1 text-sm text-fg"><Flag size={14} className="mt-0.5 shrink-0 text-modulo-texto" aria-hidden />{s.objetivo}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {s.status === "planejada" && <>
                  <Button type="button" variant="secondary" onClick={() => setEditando(s)}>Editar</Button>
                  <Button type="button" onClick={() => iniciar(s)} disabled={!!ativa} title={ativa ? "Encerre a sprint em andamento antes" : undefined}><Play size={15} aria-hidden /> Iniciar</Button>
                  {papel === "admin" && <Button type="button" variant="ghost" className="text-red-700" onClick={() => excluir(s)} aria-label={`Excluir a sprint ${s.numero}`}><Trash2 size={15} aria-hidden /></Button>}
                </>}
                {s.status === "ativa" && <>
                  <Button type="button" variant="secondary" onClick={() => setEditando(s)}>Editar</Button>
                  <Button type="button" onClick={() => setEncerrando(s)}><CheckCircle2 size={15} aria-hidden /> Encerrar com revisão e retro</Button>
                </>}
              </div>
            </div>

            {s.status === "encerrada" ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>Entregue: <b className="num">{s.pontos_feitos ?? 0}</b> de <b className="num">{s.pontos_planejados ?? 0}</b> pts</span>
                  <span className="text-slate-500">{pct(s.pontos_planejados ? (s.pontos_feitos ?? 0) / s.pontos_planejados : null)} do planejado</span>
                </div>
                <Barra valor={s.pontos_planejados ? (s.pontos_feitos ?? 0) / s.pontos_planejados : 0} cor={time.cor} rotulo="Pontos entregues" />
                {(s.revisao || s.retro_bom || s.retro_melhorar || s.retro_acoes) && (
                  <details className="rounded-lg bg-slate-50 p-3 text-sm">
                    <summary className="cursor-pointer font-semibold text-fg">Revisão e retrospectiva</summary>
                    <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                      {([["Revisão: o que foi entregue", s.revisao], ["Foi bom", s.retro_bom], ["Melhorar", s.retro_melhorar], ["Ações para a próxima", s.retro_acoes]] as const)
                        .filter(([, v]) => v).map(([t, v]) => (
                          <div key={t} className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t}</dt><dd className="whitespace-pre-line text-fg">{v}</dd></div>
                        ))}
                    </dl>
                  </details>
                )}
                {lista.length > 0 && <p className="text-xs text-slate-500">{lista.length} {pl(lista.length, "item entregue", "itens entregues")}.</p>}
              </div>
            ) : (
              <div className="mt-3">
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                  <span><b className="num">{lista.length}</b> {pl(lista.length, "item", "itens")} · <b className="num">{pts}</b> pts{s.status === "ativa" && <> · feito <b className="num">{feitos}</b></>}</span>
                  {alerta && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Acima da velocidade média ({media} pts): tire algo ou divida</span>}
                </div>
                {s.status === "ativa" && <Barra valor={pts ? feitos / pts : 0} cor={time.cor} rotulo="Pontos feitos" />}
                {lista.length > 0 ? (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {lista.map((i) => (
                      <li key={i.id}>
                        <button type="button" onClick={() => onAbrir(i)} className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:bg-slate-50">
                          <span className={`min-w-0 flex-1 truncate ${i.status === "feito" ? "text-slate-500 line-through" : "text-fg"}`}>{i.titulo}</span>
                          <ChipTipo tipo={i.tipo} /><Pontos pontos={i.pontos} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-500">Sem itens: use a seta → no Backlog para trazer os itens do alto.</p>}
              </div>
            )}
          </Card>
        );
      })}

      {(nova || editando) && <SprintModal time={time} sprints={sprints} sprint={editando} onClose={() => { setNova(false); setEditando(null); }} />}
      {encerrando && <EncerrarModal sprint={encerrando} itens={daSprint(encerrando)} onClose={() => setEncerrando(null)} />}
    </div>
  );
}

function SprintModal({ time, sprints, sprint, onClose }: { time: TimeScrum; sprints: Sprint[]; sprint: Sprint | null; onClose: () => void }) {
  const invalidar = useInvalidate();
  const sugestao = proximaSprint(time, sprints.filter((s) => s.id !== sprint?.id), hoje());
  const [objetivo, setObjetivo] = useState(sprint?.objetivo ?? "");
  const [inicio, setInicio] = useState(sprint?.inicio ?? sugestao.inicio);
  const [fim, setFim] = useState(sprint?.fim ?? sugestao.fim);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (fim < inicio) return notify("O fim precisa ser depois do início.", "erro");
    setSalvando(true);
    const dados = { objetivo: objetivo.trim() || null, inicio, fim };
    const { error } = sprint
      ? await supabase.from("scrum_sprints").update(dados).eq("id", sprint.id)
      : await supabase.from("scrum_sprints").insert({ ...dados, time_id: time.id, numero: sugestao.numero });
    setSalvando(false);
    if (error) return notifyError(error);
    invalidar("scrum_sprints");
    notify(sprint ? "Sprint salva." : `Sprint ${sugestao.numero} planejada. Mande itens do backlog para ela.`);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={sprint ? `Sprint ${sprint.numero}` : `Planejar a sprint ${sugestao.numero} · ${time.nome}`}>
      <form onSubmit={salvar} className="space-y-4">
        <Field label="Objetivo da sprint (uma frase: o que a equipe entrega)">
          <input className="input" autoFocus value={objetivo} maxLength={200} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ex.: técnicos registram a OS inteira pelo celular" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Início"><input type="date" className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} required /></Field>
          <Field label="Fim"><input type="date" className="input" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} required /></Field>
        </div>
        <p className="text-xs text-slate-500">{diasDaSprint(inicio, fim < inicio ? inicio : fim).length} dias úteis. A equipe usa sprints de {time.sprint_dias === 7 ? "1 semana" : "2 semanas"}.</p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Encerrar: revisão (o que foi entregue, já preenchida com os itens feitos) e retrospectiva (bom, melhorar, ações). */
function EncerrarModal({ sprint, itens, onClose }: { sprint: Sprint; itens: ItemScrum[]; onClose: () => void }) {
  const invalidar = useInvalidate();
  const feitos = itens.filter((i) => i.status === "feito");
  const voltam = itens.length - feitos.length;
  const [revisao, setRevisao] = useState(sprint.revisao ?? feitos.map((i) => `• ${i.titulo}`).join("\n"));
  const [bom, setBom] = useState(sprint.retro_bom ?? "");
  const [melhorar, setMelhorar] = useState(sprint.retro_melhorar ?? "");
  const [acoes, setAcoes] = useState(sprint.retro_acoes ?? "");
  const [salvando, setSalvando] = useState(false);

  async function encerrar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const { data, error } = await supabase.rpc("scrum_encerrar_sprint", { p_sprint: sprint.id, p_revisao: revisao, p_bom: bom, p_melhorar: melhorar, p_acoes: acoes });
    setSalvando(false);
    if (error) return notifyError(error);
    invalidar("scrum_sprints", "scrum_itens");
    const n = Number(data ?? 0);
    notify(`Sprint ${sprint.numero} encerrada.${n ? ` ${n} ${pl(n, "item voltou", "itens voltaram")} para o backlog.` : ""}`);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Encerrar a sprint ${sprint.numero}`} wide>
      <form onSubmit={encerrar} className="space-y-4">
        <p className="text-sm text-slate-600">
          Feito: <b className="num">{somaPontos(feitos)}</b> de <b className="num">{sprint.pontos_planejados ?? somaPontos(itens)}</b> pontos planejados.
          {voltam > 0 && <> <b className="num">{voltam}</b> {pl(voltam, "item não terminou e volta", "itens não terminaram e voltam")} para o alto do backlog.</>}
        </p>
        <Field label="Revisão da sprint: o que foi entregue e mostrado">
          <textarea className="input min-h-[96px]" value={revisao} onChange={(e) => setRevisao(e.target.value)} />
        </Field>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Retro · o que foi bom"><textarea className="input min-h-[96px]" value={bom} onChange={(e) => setBom(e.target.value)} /></Field>
          <Field label="Retro · o que melhorar"><textarea className="input min-h-[96px]" value={melhorar} onChange={(e) => setMelhorar(e.target.value)} /></Field>
          <Field label="Retro · ações para a próxima (quem faz)"><textarea className="input min-h-[96px]" value={acoes} onChange={(e) => setAcoes(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Encerrando…" : "Encerrar sprint"}</Button>
        </div>
      </form>
    </Modal>
  );
}
