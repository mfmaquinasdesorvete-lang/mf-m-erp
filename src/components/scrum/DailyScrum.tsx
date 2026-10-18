// Daily da sprint em andamento: cada pessoa responde as três perguntas do dia (o que fiz, o que vou fazer, o que me
// impede). Mostra quem já respondeu, quem falta e os impedimentos ainda abertos.
import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, MessageSquareText } from "lucide-react";
import { Button, Card, Field } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { resumoDaily, type Daily, type Sprint, type TimeScrum } from "@/lib/scrum";
import { Avatar, nomeDe, type Pessoa } from "./comum";

export function DailyScrum({ time, sprint, dailies, pessoas, dia, onDia }: {
  time: TimeScrum; sprint: Sprint; dailies: Daily[]; pessoas: Pessoa[]; dia: string; onDia: (d: string) => void;
}) {
  const { user_id, nome, papel } = usePerfil();
  const invalidar = useInvalidate();
  const { doDia, faltam, impedimentos } = resumoDaily(dailies, time.membros, dia);
  const minha = doDia.find((d) => d.user_id === user_id);
  const [fiz, setFiz] = useState("");
  const [vou, setVou] = useState("");
  const [imp, setImp] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setFiz(minha?.fiz ?? ""); setVou(minha?.vou_fazer ?? ""); setImp(minha?.impedimentos ?? ""); }, [minha?.id, dia]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!fiz.trim() && !vou.trim() && !imp.trim()) return notify("Responda ao menos uma das perguntas.", "erro");
    setSalvando(true);
    const dados = { fiz: fiz.trim() || null, vou_fazer: vou.trim() || null, impedimentos: imp.trim() || null, impedimento_resolvido: false };
    const { error } = minha
      ? await supabase.from("scrum_daily").update(dados).eq("id", minha.id)
      : await supabase.from("scrum_daily").insert({ ...dados, sprint_id: sprint.id, user_id, nome, dia });
    setSalvando(false);
    if (error) return notifyError(error);
    invalidar("scrum_daily");
    notify("Daily registrada.");
  }

  async function resolver(d: Daily) {
    const { error } = await supabase.from("scrum_daily").update({ impedimento_resolvido: true }).eq("id", d.id);
    if (error) return notifyError(error);
    invalidar("scrum_daily");
  }

  const fora = dia < sprint.inicio || dia > sprint.fim;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="min-w-0 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold text-fg"><MessageSquareText size={16} className="text-modulo-texto" aria-hidden /> Minha daily</h3>
          <input type="date" className="input h-9 w-auto" aria-label="Dia" value={dia} min={sprint.inicio} max={sprint.fim} onChange={(e) => e.target.value && onDia(e.target.value)} />
        </div>
        {fora ? <p className="text-sm text-slate-500">Escolha um dia dentro da sprint ({dataBR(sprint.inicio)} a {dataBR(sprint.fim)}).</p> : (
          <form onSubmit={salvar} className="space-y-3">
            <Field label="O que fiz desde a última daily"><textarea className="input min-h-[64px]" value={fiz} onChange={(e) => setFiz(e.target.value)} /></Field>
            <Field label="O que vou fazer até a próxima"><textarea className="input min-h-[64px]" value={vou} onChange={(e) => setVou(e.target.value)} /></Field>
            <Field label="O que me impede (deixe vazio se nada)"><textarea className="input min-h-[52px]" value={imp} onChange={(e) => setImp(e.target.value)} /></Field>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{minha ? "Já respondida: salvar troca o texto." : "Leva 1 minuto: 15 minutos de reunião, em pé."}</span>
              <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : minha ? "Atualizar" : "Registrar"}</Button>
            </div>
          </form>
        )}
      </Card>

      <div className="min-w-0 space-y-4">
        {impedimentos.length > 0 && (
          <Card className="border-red-200 p-4">
            <h3 className="mb-2 flex items-center gap-2 font-bold text-red-800"><AlertTriangle size={16} aria-hidden /> Impedimentos abertos ({impedimentos.length})</h3>
            <ul className="space-y-2">
              {impedimentos.map((d) => (
                <li key={d.id} className="flex items-start gap-2 text-sm">
                  <Avatar nome={d.nome ?? nomeDe(pessoas, d.user_id)} cor={time.cor} />
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line text-fg">{d.impedimentos}</p>
                    <p className="text-xs text-slate-500">{d.nome ?? nomeDe(pessoas, d.user_id)} · {dataBR(d.dia)}</p>
                  </div>
                  {(d.user_id === user_id || papel === "admin") && (
                    <Button type="button" variant="secondary" className="shrink-0" onClick={() => resolver(d)}><CheckCircle2 size={14} aria-hidden /> Resolvido</Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold text-fg">Daily de {dataBR(dia)}</h3>
            <span className="text-xs text-slate-500">{doDia.length} {pl(doDia.length, "resposta", "respostas")}</span>
          </div>
          {faltam.length > 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Falta {pl(faltam.length, "responder", "responderem")}: {faltam.map((id) => nomeDe(pessoas, id).split(" ")[0]).join(", ")}
            </p>
          )}
          {!time.membros.length && <p className="mb-3 text-[13px] text-slate-500">A equipe ainda não tem membros: o administrador escolhe na aba Equipe.</p>}
          {!doDia.length ? <p className="text-sm text-slate-500">Ninguém respondeu neste dia.</p> : (
            <ul className="space-y-3">
              {doDia.map((d) => (
                <li key={d.id} className="flex gap-2.5">
                  <Avatar nome={d.nome ?? nomeDe(pessoas, d.user_id)} cor={time.cor} tamanho={30} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-fg">{d.nome ?? nomeDe(pessoas, d.user_id)}</p>
                    {d.fiz && <p className="whitespace-pre-line"><span className="font-semibold text-slate-500">Fiz: </span>{d.fiz}</p>}
                    {d.vou_fazer && <p className="whitespace-pre-line"><span className="font-semibold text-slate-500">Vou fazer: </span>{d.vou_fazer}</p>}
                    {d.impedimentos && <p className={`whitespace-pre-line ${d.impedimento_resolvido ? "text-slate-500 line-through" : "text-red-700"}`}><span className="font-semibold">Impedimento: </span>{d.impedimentos}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
