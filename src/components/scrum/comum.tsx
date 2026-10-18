// Peças comuns do Scrum (Gestão → Scrum): leitura das tabelas, nomes das pessoas e etiquetas. A janela do item fica em ItemModal.
import { ListChecks } from "lucide-react";
import { useRows } from "@/lib/data";
import { FIBONACCI, ROTULO_TIPO, iniciais, progressoTarefas, type ItemScrum, type Sprint, type TimeScrum, type TipoItem } from "@/lib/scrum";

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
  return <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ring-1 ring-inset ${COR_TIPO[tipo]}`}>{ROTULO_TIPO[tipo]}</span>;
}

/** Pontos do item (vazio = ainda sem estimativa) */
export function Pontos({ pontos }: { pontos: number | null }) {
  return pontos == null
    ? <span className="rounded-full border border-dashed border-amber-400 px-1.5 text-2xs font-bold text-amber-700" title="Sem estimativa de pontos">? pts</span>
    : <span className="num rounded-full bg-[#334155] px-2 py-0.5 text-2xs font-bold text-white ring-1 ring-inset ring-white/20" title={`${pontos} pontos de esforço`}>{pontos} pts</span>;
}

/** Tarefas feitas / total do item (nada sem lista); verde quando todas estão feitas */
export function ChipTarefas({ item }: { item: Pick<ItemScrum, "tarefas"> }) {
  const p = progressoTarefas(item);
  if (!p) return null;
  return (
    <span className={`num flex items-center gap-0.5 text-2xs font-semibold ${p.feitas === p.total ? "text-emerald-700" : "text-slate-500"}`} title={`${p.feitas} de ${p.total} tarefas feitas`}>
      <ListChecks size={12} aria-hidden />{p.feitas}/{p.total}
    </span>
  );
}

export function Avatar({ nome, cor, tamanho = 24 }: { nome: string | null | undefined; cor?: string; tamanho?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-2xs font-bold text-white" title={nome ?? ""}
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
