// Registro das execuções (Sobre → Monitor): cada comando do ECL — rodado na tela, pelo Claude ou pelo vigia de hora em
// hora — fica anotado em 6 etapas, sempre na mesma ordem: entrada → diagnóstico → decisão → entrega → validação →
// próxima ação. Só o administrador vê e anota. Nada é apagado: o que não foi adiante fica "bloqueada".
import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, ClipboardList, Pencil, Plus } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { ECL } from "@/lib/sistemas";
import { ETAPAS, ORIGENS_EXECUCAO, SITUACOES_EXECUCAO, etapasPreenchidas, type Etapa, type Execucao, type SituacaoExecucao } from "@/lib/monitor";

export type InicialExecucao = Partial<Pick<Execucao, "id" | "comando" | "alvo" | "situacao" | Etapa>>;

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Anotar (ou completar) uma execução: as 6 etapas na ordem, com a dica de cada uma. */
export function ExecucaoModal({ inicial, onClose }: { inicial: InicialExecucao; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [f, setF] = useState<InicialExecucao>({ comando: "AUDIT", situacao: "concluida", ...inicial });
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof InicialExecucao>(k: K, v: InicialExecucao[K]) => setF((x) => ({ ...x, [k]: v }));
  const feitas = etapasPreenchidas(f);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!(f.entrada ?? "").trim()) return notify("Escreva a entrada: o que foi pedido.", "erro");
    if (f.situacao === "concluida" && feitas < ETAPAS.length) return notify("Para marcar como concluída, preencha as 6 etapas (ou deixe em andamento).", "erro");
    setSalvando(true);
    try {
      const linha = {
        comando: f.comando, alvo: f.alvo || null, situacao: f.situacao,
        ...Object.fromEntries(ETAPAS.map((x) => [x.id, (f[x.id] ?? "").trim() || null])),
      };
      const { error } = f.id
        ? await supabase.from("ecl_execucoes").update(linha).eq("id", f.id)
        : await supabase.from("ecl_execucoes").insert({ ...linha, origem: "erp" });
      if (error) throw error;
      invalidar("ecl_execucoes");
      notify(f.id ? "Execução atualizada" : "Execução registrada");
      onClose();
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  };

  return (
    <Modal open onClose={onClose} title={f.id ? "Completar a execução" : "Registrar execução"} wide>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Comando">
            <select className="input" value={f.comando} onChange={(e) => set("comando", e.target.value)}>
              {ECL.map((c) => <option key={c.verbo} value={c.verbo}>{c.verbo} · {c.nome}</option>)}
            </select>
          </Field>
          <Field label="Alvo"><input className="input" value={f.alvo ?? ""} onChange={(e) => set("alvo", e.target.value)} maxLength={60} placeholder="ex.: financeiro" /></Field>
          <Field label="Situação">
            <select className="input" value={f.situacao} onChange={(e) => set("situacao", e.target.value as SituacaoExecucao)}>
              {Object.entries(SITUACOES_EXECUCAO).map(([id, s]) => <option key={id} value={id}>{s.nome}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-xs text-slate-600">Entrega esperada de {f.comando}: {ECL.find((c) => c.verbo === f.comando)?.entrega}</p>
        <ol className="space-y-3">
          {ETAPAS.map((x, i) => (
            <li key={x.id}>
              <Field label={`${i + 1}. ${x.nome} — ${x.dica}`}>
                <textarea className="input min-h-[64px]" rows={x.id === "diagnostico" ? 5 : 2} value={f[x.id] ?? ""} onChange={(e) => set(x.id, e.target.value)}
                  maxLength={x.id === "diagnostico" ? 8000 : x.id === "entrada" ? 2000 : 4000} />
              </Field>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-600">{feitas} de {ETAPAS.length} etapas preenchidas</span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** A lista das execuções, da mais nova para a mais velha, com filtro por comando e a cadeia das 6 etapas. */
export function RegistroExecucoes({ onNova }: { onNova: (i: InicialExecucao) => void }) {
  const { data = [], isLoading } = useRows<Execucao>("ecl_execucoes", { order: "criado_em" });
  const [comando, setComando] = useState("");
  const lista = useMemo(() => data.filter((e) => !comando || e.comando === comando), [data, comando]);
  const comandos = [...new Set(data.map((e) => e.comando))];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <ClipboardList size={18} className="text-sky-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-fg">Registro das execuções</h2>
          <p className="text-xs text-slate-600">Cada comando em 6 etapas: {ETAPAS.map((x) => x.nome.toLowerCase()).join(" → ")}.</p>
        </div>
        <Button variant="secondary" onClick={() => onNova({})}><Plus size={16} /> Registrar</Button>
      </div>
      {comandos.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3" role="group" aria-label="Comando">
          {["", ...comandos].map((c) => (
            <button key={c || "todos"} type="button" aria-pressed={comando === c} onClick={() => setComando(c)}
              className={`rounded-full px-3 py-1 font-mono text-xs font-semibold ring-1 ${comando === c ? "bg-brand text-white ring-brand" : "bg-surface text-slate-700 ring-slate-200 hover:ring-slate-300"}`}>
              {c || "Todos"} <span className="opacity-70">{c ? data.filter((e) => e.comando === c).length : data.length}</span>
            </button>
          ))}
        </div>
      )}
      {isLoading ? <p className="p-4 text-sm text-slate-500">Carregando…</p> : !lista.length ? (
        <p className="p-4 text-sm text-slate-600">Nenhuma execução registrada ainda. Rode um comando em Sobre → Sistemas e toque em "Registrar execução".</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lista.map((e) => {
            const sit = SITUACOES_EXECUCAO[e.situacao] ?? SITUACOES_EXECUCAO.concluida;
            const feitas = etapasPreenchidas(e);
            return (
              <li key={e.id} className="p-4">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                    <span className="rounded-md bg-violet-100 px-2 py-0.5 font-mono text-xs font-bold text-violet-800">{e.comando}{e.alvo ? ` ${e.alvo}` : ""}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${sit.cor}`}>{sit.nome}</span>
                    <span className="text-xs text-slate-600">{ORIGENS_EXECUCAO[e.origem] ?? e.origem} · {quando(e.criado_em)} · {feitas}/{ETAPAS.length} {pl(feitas, "etapa", "etapas")}</span>
                    <span className="w-full min-w-0 text-sm text-fg">{e.entrada}</span>
                    {e.proxima_acao && <span className="flex w-full min-w-0 items-start gap-1 text-sm font-semibold text-sky-800"><ArrowRight size={14} className="mt-0.5 shrink-0" aria-hidden />
                      <span className="line-clamp-2 whitespace-pre-line">{e.proxima_acao}</span></span>}
                  </summary>
                  <ol className="mt-3 space-y-2 border-l-2 border-sky-200 pl-4">
                    {ETAPAS.map((x, i) => (
                      <li key={x.id} className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wide text-sky-800">{i + 1}. {x.nome}</div>
                        <p className={`whitespace-pre-line break-words text-sm ${e[x.id] ? "text-fg" : "italic text-slate-500"}`}>{e[x.id] || "falta preencher"}</p>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3">
                    <Button variant="secondary" onClick={() => onNova({ id: e.id, comando: e.comando, alvo: e.alvo, situacao: e.situacao, ...Object.fromEntries(ETAPAS.map((x) => [x.id, e[x.id]])) })}>
                      <Pencil size={14} /> Completar ou mudar
                    </Button>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
