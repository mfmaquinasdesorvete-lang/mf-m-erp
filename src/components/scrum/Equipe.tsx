// Equipe do Scrum: membros, dono do produto (prioriza o backlog), scrum master (cuida do ritmo e dos impedimentos),
// tamanho da sprint e cor. Só o administrador muda; os outros só veem.
import { useEffect, useState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import type { TimeScrum } from "@/lib/scrum";
import { Avatar, nomeDe, type Pessoa } from "./comum";

export function Equipe({ time, pessoas }: { time: TimeScrum; pessoas: Pessoa[] }) {
  const { papel } = usePerfil();
  const admin = papel === "admin";
  const invalidar = useInvalidate();
  const [r, setR] = useState(time);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setR(time), [time]);
  const alterado = JSON.stringify(r) !== JSON.stringify(time);
  const marcar = (id: string) => setR({ ...r, membros: r.membros.includes(id) ? r.membros.filter((m) => m !== id) : [...r.membros, id] });

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.from("scrum_times").update({
      membros: r.membros, dono_produto: r.dono_produto || null, scrum_master: r.scrum_master || null,
      sprint_dias: r.sprint_dias, cor: r.cor, descricao: r.descricao?.trim() || null,
    }).eq("id", time.id);
    setSalvando(false);
    if (error) return notifyError(error);
    invalidar("scrum_times");
    notify("Equipe salva.");
  }

  if (!admin) {
    return (
      <Card className="p-4">
        {time.descricao && <p className="mb-3 text-sm text-slate-600">{time.descricao}</p>}
        <dl className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs font-bold uppercase text-slate-500">Dono do produto</dt><dd>{time.dono_produto ? nomeDe(pessoas, time.dono_produto) : "—"}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-slate-500">Scrum master</dt><dd>{time.scrum_master ? nomeDe(pessoas, time.scrum_master) : "—"}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-slate-500">Sprint</dt><dd>{time.sprint_dias === 7 ? "1 semana" : "2 semanas"}</dd></div>
        </dl>
        <h3 className="mb-2 text-sm font-bold text-fg">Membros ({time.membros.length})</h3>
        {!time.membros.length ? <p className="text-sm text-slate-500">O administrador ainda não escolheu os membros.</p> : (
          <ul className="flex flex-wrap gap-2">{time.membros.map((id) => (
            <li key={id} className="flex items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-1 pr-3 text-sm"><Avatar nome={nomeDe(pessoas, id)} cor={time.cor} />{nomeDe(pessoas, id)}</li>
          ))}</ul>
        )}
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <Field label="Para que serve a equipe"><input className="input" value={r.descricao ?? ""} maxLength={200} onChange={(e) => setR({ ...r, descricao: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Dono do produto (prioriza o backlog)">
          <select className="input" value={r.dono_produto ?? ""} onChange={(e) => setR({ ...r, dono_produto: e.target.value || null })}>
            <option value="">—</option>{pessoas.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}
          </select>
        </Field>
        <Field label="Scrum master (ritmo e impedimentos)">
          <select className="input" value={r.scrum_master ?? ""} onChange={(e) => setR({ ...r, scrum_master: e.target.value || null })}>
            <option value="">—</option>{pessoas.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}
          </select>
        </Field>
        <Field label="Tamanho da sprint">
          <select className="input" value={r.sprint_dias} onChange={(e) => setR({ ...r, sprint_dias: Number(e.target.value) })}>
            <option value={7}>1 semana</option><option value={14}>2 semanas</option>
          </select>
        </Field>
        <Field label="Cor"><input type="color" className="input h-10 p-1" value={r.cor} onChange={(e) => setR({ ...r, cor: e.target.value })} /></Field>
      </div>
      <div>
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Membros ({r.membros.length}) — quem responde a daily e aparece primeiro como responsável</span>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {pessoas.map((p) => (
            <label key={p.user_id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${r.membros.includes(p.user_id) ? "border-modulo bg-modulo/10" : "border-slate-200"}`}>
              <input type="checkbox" checked={r.membros.includes(p.user_id)} onChange={() => marcar(p.user_id)} />
              <Avatar nome={p.nome} cor={r.membros.includes(p.user_id) ? r.cor : undefined} />
              <span className="min-w-0 truncate">{p.nome}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="secondary" disabled={!alterado} onClick={() => setR(time)}>Desfazer</Button>
        <Button type="button" disabled={!alterado || salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar equipe"}</Button>
      </div>
    </Card>
  );
}
