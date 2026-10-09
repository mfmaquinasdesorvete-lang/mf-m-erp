// Marcadores coloridos com ícone nas notas fiscais: mostrar, aplicar (em uma ou várias notas) e cadastrar.
import { useState, type FormEvent } from "react";
import { Check, Minus, Pencil, Plus, Settings2, Tags } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { CORES, corDe, ICONES, iconeDe, type Marcador } from "@/lib/marcadores";

export type TabelaNota = "notas_fiscais" | "nfe_recebidas";

export function useMarcadores() {
  return useRows<Marcador>("marcadores", { order: "ordem", ascending: true });
}

export function ChipMarcador({ m, pequeno }: { m: Marcador; pequeno?: boolean }) {
  const Icone = iconeDe(m.icone);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full ring-1 ring-inset ${corDe(m.cor).chip} ${pequeno ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-xs"} font-semibold`}>
      <Icone size={pequeno ? 11 : 12} aria-hidden /> {m.nome}
    </span>
  );
}

export function ChipsMarcadores({ ids, todos, pequeno }: { ids?: string[] | null; todos: Marcador[]; pequeno?: boolean }) {
  const lista = (ids ?? []).map((id) => todos.find((m) => m.id === id)).filter((m): m is Marcador => !!m && m.ativo);
  if (!lista.length) return null;
  return <span className="inline-flex flex-wrap gap-1">{lista.map((m) => <ChipMarcador key={m.id} m={m} pequeno={pequeno} />)}</span>;
}

/** Aplica/tira marcadores de uma ou várias notas. Em várias, mostra quem já tem (todas, algumas, nenhuma). */
export function AplicarMarcadores({ tabela, notas, onClose }: {
  tabela: TabelaNota; notas: { id: string; marcadores?: string[] | null }[]; onClose: () => void;
}) {
  const { data: todos = [] } = useMarcadores();
  const [gerenciar, setGerenciar] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const [atual, setAtual] = useState(() => notas.map((n) => ({ id: n.id, marcadores: [...(n.marcadores ?? [])] })));
  const quantos = (id: string) => atual.filter((n) => n.marcadores.includes(id)).length;

  async function alternar(m: Marcador) {
    const tem = quantos(m.id) === atual.length;
    setOcupado(m.id);
    const { error } = await supabase.rpc("marcar_notas", {
      p_tabela: tabela, p_ids: atual.map((n) => n.id), p_adicionar: tem ? [] : [m.id], p_remover: tem ? [m.id] : [],
    });
    setOcupado(null);
    if (error) return notifyError(error);
    setAtual((a) => a.map((n) => ({ ...n, marcadores: tem ? n.marcadores.filter((x) => x !== m.id) : [...new Set([...n.marcadores, m.id])] })));
    invalidate(tabela);
  }

  return (
    <Modal open onClose={onClose} title={notas.length > 1 ? `Marcadores de ${notas.length} notas` : "Marcadores da nota"}>
      <p className="mb-3 text-sm text-slate-600">Toque para colocar ou tirar. {notas.length > 1 && "O traço indica que só algumas das notas têm o marcador."}</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {todos.filter((m) => m.ativo).map((m) => {
          const q = quantos(m.id);
          const estado = q === 0 ? "nenhuma" : q === atual.length ? "todas" : "algumas";
          return (
            <li key={m.id}>
              <button type="button" disabled={ocupado === m.id} onClick={() => alternar(m)} aria-pressed={estado === "todas"}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-60">
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${estado === "nenhuma" ? "border-slate-300" : "border-brand bg-brand text-brand-fg"}`}>
                  {estado === "todas" ? <Check size={14} /> : estado === "algumas" ? <Minus size={14} /> : null}
                </span>
                <ChipMarcador m={m} />
              </button>
            </li>
          );
        })}
      </ul>
      {!todos.some((m) => m.ativo) && <p className="text-sm text-slate-500">Nenhum marcador cadastrado.</p>}
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" onClick={() => setGerenciar(true)}><Settings2 size={16} /> Criar ou editar marcadores</Button>
        <Button type="button" onClick={() => { notify("Marcadores atualizados"); onClose(); }}>Pronto</Button>
      </div>
      {gerenciar && <GerenciarMarcadores onClose={() => setGerenciar(false)} />}
    </Modal>
  );
}

export function GerenciarMarcadores({ onClose }: { onClose: () => void }) {
  const { data: todos = [] } = useMarcadores();
  const [editando, setEditando] = useState<Partial<Marcador> | null>(null);
  const invalidate = useInvalidate();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!editando?.nome?.trim()) return;
    const linha = { nome: editando.nome.trim(), cor: editando.cor ?? "slate", icone: editando.icone ?? "tag", ativo: editando.ativo ?? true,
      ordem: editando.ordem ?? (Math.max(0, ...todos.map((m) => m.ordem)) + 1) };
    const { error } = editando.id
      ? await supabase.from("marcadores").update(linha).eq("id", editando.id)
      : await supabase.from("marcadores").insert(linha);
    if (error) return notifyError(/marcadores_nome_unico|duplicate/.test(error.message) ? new Error("Já existe um marcador com esse nome") : error);
    invalidate("marcadores");
    setEditando(null);
  }

  return (
    <Modal open onClose={onClose} title="Marcadores">
      {!editando ? (
        <>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {todos.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                <span className={m.ativo ? "" : "opacity-50"}><ChipMarcador m={m} /></span>
                {!m.ativo && <span className="text-xs text-slate-500">desativado</span>}
                <Button type="button" variant="ghost" className="ml-auto" onClick={() => setEditando(m)}><Pencil size={15} /> Editar</Button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between">
            <Button type="button" variant="secondary" onClick={() => setEditando({ cor: "slate", icone: "tag", ativo: true })}><Plus size={16} /> Novo marcador</Button>
            <Button type="button" onClick={onClose}>Fechar</Button>
          </div>
        </>
      ) : (
        <form onSubmit={salvar} className="space-y-3">
          <Field label="Nome"><input className="input" autoFocus maxLength={40} value={editando.nome ?? ""} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} placeholder="Ex.: pago cartão Infinity" /></Field>
          <Field label="Cor">
            <div className="flex flex-wrap gap-2">
              {CORES.map((c) => (
                <button key={c.valor} type="button" onClick={() => setEditando({ ...editando, cor: c.valor })} aria-pressed={editando.cor === c.valor}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${editando.cor === c.valor ? "border-brand ring-2 ring-brand/40" : "border-slate-200"}`}>
                  <span className={`h-3 w-3 rounded-full ${c.ponto}`} /> {c.rotulo}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Ícone">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ICONES).map(([nome, Icone]) => (
                <button key={nome} type="button" title={nome} onClick={() => setEditando({ ...editando, icone: nome })} aria-pressed={editando.icone === nome}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border ${editando.icone === nome ? "border-brand bg-brand/10 text-brand" : "border-slate-200 text-slate-600"}`}>
                  <Icone size={16} />
                </button>
              ))}
            </div>
          </Field>
          <div className="flex items-center gap-2 text-sm"><span className="text-slate-600">Prévia:</span> <ChipMarcador m={{ id: "", nome: editando.nome || "Marcador", cor: editando.cor ?? "slate", icone: editando.icone ?? "tag", ativo: true, ordem: 0 }} /></div>
          {editando.id && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editando.ativo !== false} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> Ativo (desativado some das notas e da lista)</label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditando(null)}>Voltar</Button>
            <Button disabled={!editando.nome?.trim()}><Tags size={16} /> Salvar marcador</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
