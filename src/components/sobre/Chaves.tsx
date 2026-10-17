// Sobre → Monitor → Chaves e certificados: o que vence e para o ERP se ninguém renovar — certificado digital das
// unidades (NF-e), a chave do Supabase que o GitHub usa (backup e funções), domínio e chaves de bancos. Guarda só o
// nome, onde está e a data, nunca a chave. O vigia avisa no prazo escolhido; aqui se cadastra e se marca a renovação.
// O certificado do Banco Inter entra sozinho (vem da conexão) e se renova na tela do banco.
import { useState, type FormEvent } from "react";
import { CalendarClock, KeyRound, Pencil, Plus, RefreshCw } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { SUGESTOES_CHAVES, TIPOS_CHAVE, situacaoVencimento, type TipoChave, type Vencimento } from "@/lib/monitor";

type Form = { id?: string; nome: string; tipo: TipoChave; onde: string; vence_em: string; avisar_dias: string; como_renovar: string };
const VAZIO: Form = { nome: "", tipo: "chave", onde: "", vence_em: "", avisar_dias: "15", como_renovar: "" };

const COR = {
  vencido: { ponto: "bg-red-500", selo: "bg-red-100 text-red-900 ring-red-300" },
  urgente: { ponto: "bg-red-500", selo: "bg-red-100 text-red-900 ring-red-300" },
  perto: { ponto: "bg-amber-500", selo: "bg-amber-100 text-amber-900 ring-amber-300" },
  ok: { ponto: "bg-emerald-500", selo: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
};
const quando = (dias: number) => dias < 0 ? `venceu há ${-dias} ${pl(-dias, "dia", "dias")}` : dias === 0 ? "vence hoje" : `vence em ${dias} ${pl(dias, "dia", "dias")}`;

export function Chaves({ lista }: { lista: Vencimento[] }) {
  const [form, setForm] = useState<Form | null>(null);
  const [renovar, setRenovar] = useState<Vencimento | null>(null);
  const cadastrados = new Set(lista.map((v) => v.nome));
  const faltam = SUGESTOES_CHAVES.filter((s) => !cadastrados.has(s.nome));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
        <KeyRound size={18} className="text-sky-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-fg">Chaves e certificados</h2>
          <p className="text-xs text-slate-600">O que vence e para o ERP se ninguém renovar. Guarda só o nome, onde está e a data, nunca a chave. O vigia avisa no prazo de cada um.</p>
        </div>
        <Button variant="secondary" onClick={() => setForm(VAZIO)}><Plus size={16} /> Cadastrar</Button>
      </div>
      {lista.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {lista.map((v) => {
            const sit = situacaoVencimento(v);
            return (
              <li key={v.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR[sit].ponto}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-fg">{v.nome}</div>
                  <div className="text-xs text-slate-600">{TIPOS_CHAVE[v.tipo] ?? v.tipo}{v.onde ? ` · ${v.onde}` : ""} · {dataBR(v.vence_em)} · avisa {v.avisar_dias} {pl(v.avisar_dias, "dia", "dias")} antes</div>
                  {v.como_renovar && sit !== "ok" && <div className="mt-0.5 text-xs text-slate-700">Como renovar: {v.como_renovar}</div>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${COR[sit].selo}`}>{quando(v.dias)}</span>
                {v.origem === "cadastro" && (
                  <div className="flex gap-1.5">
                    <Button variant="secondary" onClick={() => setRenovar(v)}><RefreshCw size={14} /> Renovei</Button>
                    <Button variant="ghost" aria-label={`Editar ${v.nome}`} onClick={() => setForm({ id: v.id, nome: v.nome, tipo: v.tipo, onde: v.onde ?? "", vence_em: v.vence_em, avisar_dias: String(v.avisar_dias), como_renovar: v.como_renovar ?? "" })}>
                      <Pencil size={14} />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {faltam.length > 0 && (
        <div className="border-t border-slate-100 p-4">
          <p className="mb-2 text-xs font-semibold text-slate-700">{lista.length ? "Ainda falta cadastrar:" : "Comece por estes (você só preenche a data de vencimento):"}</p>
          <div className="flex flex-wrap gap-1.5">
            {faltam.map((s) => (
              <button key={s.nome} type="button" onClick={() => setForm({ ...VAZIO, ...s, avisar_dias: String(s.avisar_dias) })}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100">
                <Plus size={12} aria-hidden /> {s.nome}
              </button>
            ))}
          </div>
        </div>
      )}
      {form && <ChaveModal inicial={form} onClose={() => setForm(null)} />}
      {renovar && <RenovarModal item={renovar} onClose={() => setRenovar(null)} />}
    </Card>
  );
}

function ChaveModal({ inicial, onClose }: { inicial: Form; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [f, setF] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const linha = { nome: f.nome.trim(), tipo: f.tipo, onde: f.onde.trim() || null, vence_em: f.vence_em, avisar_dias: Number(f.avisar_dias) || 15, como_renovar: f.como_renovar.trim() || null };
      const { error } = f.id ? await supabase.from("vencimentos_chaves").update(linha).eq("id", f.id) : await supabase.from("vencimentos_chaves").insert(linha);
      if (error) throw error;
      invalidar("saude_sistema");
      notify(f.id ? "Vencimento atualizado" : "Vencimento cadastrado: o vigia avisa antes");
      onClose();
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  };

  return (
    <Modal open onClose={onClose} title={f.id ? "Editar vencimento" : "Cadastrar vencimento"}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Não escreva a chave nem a senha aqui: só o nome, onde está e a data.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" className="sm:col-span-2"><input className="input" value={f.nome} onChange={(e) => set("nome", e.target.value)} required minLength={2} maxLength={120} placeholder="ex.: Certificado digital A1 · Matriz SC" /></Field>
          <Field label="Tipo">
            <select className="input" value={f.tipo} onChange={(e) => set("tipo", e.target.value as TipoChave)}>
              {Object.entries(TIPOS_CHAVE).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </Field>
          <Field label="Vence em"><input className="input" type="date" value={f.vence_em} onChange={(e) => set("vence_em", e.target.value)} required /></Field>
          <Field label="Onde está (onde trocar)" className="sm:col-span-2"><input className="input" value={f.onde} onChange={(e) => set("onde", e.target.value)} maxLength={200} placeholder="ex.: GitHub → Secrets → SUPABASE_ACCESS_TOKEN" /></Field>
          <Field label="Avisar quantos dias antes"><input className="input" type="number" min={1} max={120} value={f.avisar_dias} onChange={(e) => set("avisar_dias", e.target.value)} /></Field>
          <Field label="Como renovar" className="sm:col-span-2"><textarea className="input" rows={2} value={f.como_renovar} onChange={(e) => set("como_renovar", e.target.value)} maxLength={1000} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Renovou: a mesma linha ganha a data nova (o histórico da data antiga fica na auditoria). */
function RenovarModal({ item, onClose }: { item: Vencimento; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [data, setData] = useState("");
  const [salvando, setSalvando] = useState(false);
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (data <= item.vence_em) return notify("A data nova precisa ser depois da que está cadastrada.", "erro");
    setSalvando(true);
    try {
      const { error } = await supabase.from("vencimentos_chaves").update({ vence_em: data }).eq("id", item.id);
      if (error) throw error;
      invalidar("saude_sistema");
      notify("Renovação anotada");
      onClose();
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Renovei: ${item.nome}`}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-sm text-slate-600">Vencia em {dataBR(item.vence_em)}. Qual é a data de vencimento nova?</p>
        <Field label="Novo vencimento"><input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}><CalendarClock size={14} /> {salvando ? "Salvando…" : "Anotar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
