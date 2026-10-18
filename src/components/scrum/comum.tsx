// Peças comuns do Scrum (Gestão → Scrum): leitura das tabelas, nomes das pessoas, etiquetas e a janela do item.
import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { usePerfil } from "@/lib/auth";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import {
  FIBONACCI, ROTULO_STATUS, ROTULO_TIPO, iniciais, prioridadeNoFim,
  type ItemScrum, type Sprint, type StatusItem, type TimeScrum, type TipoItem,
} from "@/lib/scrum";

export type Pessoa = { user_id: string; nome: string; papel?: string; ativo?: boolean };

export function useScrum() {
  const times = useRows<TimeScrum>("scrum_times", { order: "ordem", ascending: true });
  const sprints = useRows<Sprint>("scrum_sprints", { order: "numero", ascending: false });
  const itens = useRows<ItemScrum>("scrum_itens", { order: "prioridade", ascending: true });
  const pessoas = useRows<Pessoa>("usuarios_erp", { select: "user_id, nome, papel, ativo", order: "nome", ascending: true, key: ["scrum"] });
  return {
    times: (times.data ?? []).filter((t) => t.ativo),
    sprints: sprints.data ?? [],
    itens: itens.data ?? [],
    /** todos (para mostrar o nome) */
    pessoas: pessoas.data ?? [],
    /** quem pode entrar numa equipe: ativo e da empresa (sem contador e representante) */
    escolhas: (pessoas.data ?? []).filter((p) => p.ativo !== false && p.papel !== "contador" && p.papel !== "representante"),
    carregando: times.isLoading || sprints.isLoading || itens.isLoading,
    erro: times.error || sprints.error || itens.error,
  };
}

export const nomeDe = (pessoas: Pessoa[], id: string | null | undefined) => (id ? pessoas.find((p) => p.user_id === id)?.nome ?? "—" : "Sem responsável");
/** Primeiro nome (cartões do quadro) */
export const primeiroNome = (pessoas: Pessoa[], id: string | null | undefined) => (id ? nomeDe(pessoas, id).split(" ")[0] : "");

const COR_TIPO: Record<TipoItem, string> = {
  historia: "bg-sky-100 text-sky-800 ring-sky-200",
  tarefa: "bg-slate-100 text-slate-700 ring-slate-200",
  bug: "bg-red-100 text-red-800 ring-red-200",
  melhoria: "bg-violet-100 text-violet-800 ring-violet-200",
};
export function ChipTipo({ tipo }: { tipo: TipoItem }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${COR_TIPO[tipo]}`}>{ROTULO_TIPO[tipo]}</span>;
}

/** Pontos do item (vazio = ainda sem estimativa) */
export function Pontos({ pontos }: { pontos: number | null }) {
  return pontos == null
    ? <span className="rounded-full border border-dashed border-amber-400 px-1.5 text-[11px] font-bold text-amber-700" title="Sem estimativa de pontos">? pts</span>
    : <span className="num rounded-full bg-[#334155] px-2 py-0.5 text-[11px] font-bold text-white ring-1 ring-inset ring-white/20" title={`${pontos} pontos de esforço`}>{pontos} pts</span>;
}

export function Avatar({ nome, cor, tamanho = 24 }: { nome: string | null | undefined; cor?: string; tamanho?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-white" title={nome ?? ""}
      style={{ width: tamanho, height: tamanho, background: cor ?? "#64748b" }} aria-hidden>{iniciais(nome)}</span>
  );
}

/** Barra fina de progresso (0 a 1) */
export function Barra({ valor, cor, rotulo }: { valor: number; cor: string; rotulo: string }) {
  const p = Math.max(0, Math.min(1, valor));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${p * 100}%`, background: cor }} />
    </div>
  );
}

export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Escolha de pontos em botões (Fibonacci) */
export function EscolhaPontos({ valor, onChange }: { valor: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Pontos">
      {FIBONACCI.map((p) => (
        <button key={p} type="button" aria-pressed={valor === p} onClick={() => onChange(valor === p ? null : p)}
          className={`num h-9 min-w-9 rounded-lg border px-2 text-sm font-bold transition ${valor === p ? "border-modulo-escuro bg-modulo-escuro text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}>{p}</button>
      ))}
    </div>
  );
}

type Rascunho = {
  titulo: string; tipo: TipoItem; pontos: number | null; responsavel_id: string; descricao: string; criterio_aceite: string;
  sprint_id: string; status: StatusItem;
};

/**
 * Janela do item (novo ou para editar): título, tipo, pontos, responsável, descrição, critério de aceite e onde fica
 * (backlog ou uma sprint que não terminou).
 */
export function ItemModal({ time, item, sprintInicial, sprints, itensDoTime, pessoas, onClose }: {
  time: TimeScrum; item: ItemScrum | null; sprintInicial?: string | null; sprints: Sprint[]; itensDoTime: ItemScrum[]; pessoas: Pessoa[]; onClose: () => void;
}) {
  const { user_id, papel } = usePerfil();
  const invalidar = useInvalidate();
  const [r, setR] = useState<Rascunho>(() => ({
    titulo: item?.titulo ?? "", tipo: item?.tipo ?? "historia", pontos: item?.pontos ?? null, responsavel_id: item?.responsavel_id ?? "",
    descricao: item?.descricao ?? "", criterio_aceite: item?.criterio_aceite ?? "", sprint_id: item?.sprint_id ?? sprintInicial ?? "", status: item?.status ?? "a_fazer",
  }));
  const [salvando, setSalvando] = useState(false);
  const abertas = sprints.filter((s) => s.time_id === time.id && (s.status !== "encerrada" || s.id === item?.sprint_id));
  const membros = pessoas.filter((p) => time.membros.includes(p.user_id));
  const outros = pessoas.filter((p) => !time.membros.includes(p.user_id));
  const podeExcluir = !!item && (papel === "admin" || item.created_by === user_id);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!r.titulo.trim()) return notify("Escreva o título do item.", "erro");
    setSalvando(true);
    const dados = {
      titulo: r.titulo.trim(), tipo: r.tipo, pontos: r.pontos, responsavel_id: r.responsavel_id || null,
      descricao: r.descricao.trim() || null, criterio_aceite: r.criterio_aceite.trim() || null,
      sprint_id: r.sprint_id || null, status: r.status,
    };
    const { error } = item
      ? await supabase.from("scrum_itens").update(dados).eq("id", item.id)
      : await supabase.from("scrum_itens").insert({ ...dados, time_id: time.id, prioridade: prioridadeNoFim(itensDoTime.filter((i) => !i.sprint_id)) });
    setSalvando(false);
    if (error) return notifyError(error);
    invalidar("scrum_itens");
    notify(item ? "Item salvo." : r.sprint_id ? "Item criado na sprint." : "Item criado no backlog.");
    onClose();
  }

  async function excluir() {
    if (!item || !(await confirmar(`Excluir o item "${item.titulo}"? Não dá para desfazer.`, { perigo: true, ok: "Excluir" }))) return;
    const { error } = await supabase.from("scrum_itens").delete().eq("id", item.id);
    if (error) return notifyError(error);
    invalidar("scrum_itens");
    notify("Item excluído.");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={item ? "Item do Scrum" : `Novo item · ${time.nome}`}>
      <form onSubmit={salvar} className="space-y-4">
        <Field label="Título (o que entrega, do ponto de vista de quem usa)">
          <input className="input" autoFocus value={r.titulo} maxLength={200} placeholder="Ex.: técnico anexa fotos na OS pelo celular"
            onChange={(e) => setR({ ...r, titulo: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <select className="input" value={r.tipo} onChange={(e) => setR({ ...r, tipo: e.target.value as TipoItem })}>
              {(Object.keys(ROTULO_TIPO) as TipoItem[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
            </select>
          </Field>
          <Field label="Responsável">
            <select className="input" value={r.responsavel_id} onChange={(e) => setR({ ...r, responsavel_id: e.target.value })}>
              <option value="">Sem responsável</option>
              {membros.length > 0 && <optgroup label="Da equipe">{membros.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}</optgroup>}
              <optgroup label={membros.length ? "Outras pessoas" : "Pessoas"}>{outros.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}</optgroup>
            </select>
          </Field>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Pontos de esforço (toque de novo para tirar)</span>
          <EscolhaPontos valor={r.pontos} onChange={(pontos) => setR({ ...r, pontos })} />
          <p className="mt-1 text-xs text-slate-500">Compare com itens já feitos: 1 = bem pequeno, 3 = um dia, 8 = vários dias, 13 ou 21 = grande demais — divida.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Onde fica">
            <select className="input" value={r.sprint_id} onChange={(e) => setR({ ...r, sprint_id: e.target.value })}>
              <option value="">Backlog (ainda sem sprint)</option>
              {abertas.map((s) => <option key={s.id} value={s.id}>Sprint {s.numero}{s.status === "ativa" ? " (em andamento)" : s.status === "planejada" ? " (planejada)" : ""}</option>)}
            </select>
          </Field>
          {r.sprint_id && (
            <Field label="Situação">
              <select className="input" value={r.status} onChange={(e) => setR({ ...r, status: e.target.value as StatusItem })}>
                {(Object.keys(ROTULO_STATUS) as StatusItem[]).map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Descrição (opcional)">
          <textarea className="input min-h-[80px]" value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} />
        </Field>
        <Field label="Critério de aceite: como saber que está pronto">
          <textarea className="input min-h-[64px]" value={r.criterio_aceite} placeholder="Ex.: a foto aparece na OS e no PDF; funciona no iPhone"
            onChange={(e) => setR({ ...r, criterio_aceite: e.target.value })} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          {podeExcluir ? <Button type="button" variant="ghost" className="text-red-700" onClick={excluir}><Trash2 size={15} aria-hidden /> Excluir</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
