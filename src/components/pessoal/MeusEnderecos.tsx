// Meus endereços (aba do painel pessoal): onde a pessoa já morou, com as lembranças de cada lugar. Só o dono vê
// (public.pessoal_enderecos). O atual fica no alto.
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Home, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";

export type EnderecoPessoal = { id: string; endereco: string; lembranca: string | null; periodo: string | null; atual: boolean; ordem: number };

const mapa = (e: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}`;

export function MeusEnderecos() {
  const invalidar = useInvalidate();
  const { data: lista = [], isLoading } = useRows<EnderecoPessoal>("pessoal_enderecos", { order: "ordem", ascending: true });
  const [edit, setEdit] = useState<Partial<EnderecoPessoal> | null>(null);
  // o atual primeiro; os outros na ordem que a pessoa escolheu
  const ordem = [...lista].sort((a, b) => Number(b.atual) - Number(a.atual) || a.ordem - b.ordem);

  async function gravar(e: Partial<EnderecoPessoal>) {
    const { id, ...resto } = e;
    // só um endereço atual
    if (resto.atual) {
      const outros = lista.filter((x) => x.atual && x.id !== id).map((x) => x.id);
      if (outros.length) await supabase.from("pessoal_enderecos").update({ atual: false }).in("id", outros);
    }
    const { error } = id ? await supabase.from("pessoal_enderecos").update(resto).eq("id", id)
      : await supabase.from("pessoal_enderecos").insert({ ...resto, ordem: Math.max(0, ...lista.map((x) => x.ordem)) + 1 });
    if (error) return notifyError(error);
    notify(id ? "Endereço alterado" : "Endereço guardado");
    invalidar("pessoal_enderecos");
    setEdit(null);
  }
  async function tirar(e: EnderecoPessoal) {
    if (!(await confirmar(`Tirar o endereço "${e.endereco}" da lista?`, { perigo: true }))) return;
    const { error } = await supabase.from("pessoal_enderecos").delete().eq("id", e.id);
    if (error) return notifyError(error);
    invalidar("pessoal_enderecos");
  }
  async function mover(e: EnderecoPessoal, passo: -1 | 1) {
    const semAtual = ordem.filter((x) => !x.atual);
    const i = semAtual.findIndex((x) => x.id === e.id), j = i + passo;
    if (j < 0 || j >= semAtual.length) return;
    const o = semAtual[j];
    await supabase.from("pessoal_enderecos").update({ ordem: o.ordem }).eq("id", e.id);
    await supabase.from("pessoal_enderecos").update({ ordem: e.ordem === o.ordem ? e.ordem + passo : e.ordem }).eq("id", o.id);
    invalidar("pessoal_enderecos");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto min-w-0 text-sm text-slate-600">Os lugares onde você já morou e o que aconteceu em cada um. Só você vê.</p>
        <Button onClick={() => setEdit({ atual: false })}><Plus size={15} /> Novo endereço</Button>
      </div>
      {isLoading ? null : !ordem.length ? <Card className="p-6 text-center text-sm text-slate-500">Nenhum endereço ainda.</Card> : (
        <ol className="relative space-y-3 border-l-2 border-violet-200 pl-4 sm:pl-6">
          {ordem.map((e) => {
            const semAtual = ordem.filter((x) => !x.atual);
            const i = semAtual.findIndex((x) => x.id === e.id);
            return (
              <li key={e.id} className="relative">
                <span className={`absolute -left-[23px] top-4 h-3 w-3 rounded-full ring-4 ring-surface sm:-left-[31px] ${e.atual ? "bg-emerald-600" : "bg-violet-500"}`} aria-hidden />
                <Card className={`p-3 sm:p-4 ${e.atual ? "border-emerald-300" : ""}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white ${e.atual ? "bg-emerald-700" : "bg-violet-600"}`}>{e.atual ? <Home size={17} aria-hidden /> : <MapPin size={17} aria-hidden />}</span>
                    <div className="min-w-0 flex-1 basis-56">
                      {(e.atual || e.periodo) && <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{e.atual ? "Onde você mora hoje" : ""}{e.atual && e.periodo ? " · " : ""}{e.periodo}</div>}
                      <div className="font-semibold text-fg">{e.endereco}</div>
                      {e.lembranca && <p className="mt-1 text-sm italic text-violet-900">{e.lembranca}</p>}
                      <a href={mapa(e.endereco)} target="_blank" rel="noreferrer" className="link-acao mt-1 inline-flex items-center gap-1 text-xs"><MapPin size={12} aria-hidden /> Ver no mapa</a>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      {!e.atual && <>
                        <button type="button" className="botao-icone h-8 w-8" disabled={i === 0} onClick={() => mover(e, -1)} aria-label="Subir"><ArrowUp size={15} /></button>
                        <button type="button" className="botao-icone h-8 w-8" disabled={i === semAtual.length - 1} onClick={() => mover(e, 1)} aria-label="Descer"><ArrowDown size={15} /></button>
                      </>}
                      <button type="button" className="botao-icone h-8 w-8" onClick={() => setEdit(e)} aria-label={`Editar ${e.endereco}`}><Pencil size={15} /></button>
                      <button type="button" className="botao-icone-perigo h-8 w-8 text-red-600" onClick={() => tirar(e)} aria-label={`Tirar ${e.endereco}`}><Trash2 size={15} /></button>
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
      {edit && <EditarEndereco e={edit} onClose={() => setEdit(null)} onGravar={gravar} />}
    </div>
  );
}

function EditarEndereco({ e, onClose, onGravar }: { e: Partial<EnderecoPessoal>; onClose: () => void; onGravar: (e: Partial<EnderecoPessoal>) => void }) {
  const [f, setF] = useState({ endereco: e.endereco ?? "", lembranca: e.lembranca ?? "", periodo: e.periodo ?? "", atual: !!e.atual });
  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    onGravar({ id: e.id, endereco: f.endereco.trim(), lembranca: f.lembranca.trim() || null, periodo: f.periodo.trim() || null, atual: f.atual });
  };
  return (
    <Modal open onClose={onClose} title={e.id ? "Editar endereço" : "Novo endereço"}>
      <form onSubmit={enviar} className="space-y-3">
        <Field label="Endereço"><input className="input" value={f.endereco} onChange={(x) => setF({ ...f, endereco: x.target.value })} required minLength={5} maxLength={300} autoFocus placeholder="Rua, número, bairro, cidade, CEP" /></Field>
        <Field label="Quando (opcional)"><input className="input" value={f.periodo} onChange={(x) => setF({ ...f, periodo: x.target.value })} maxLength={40} placeholder="Ex.: 2012 a 2016" /></Field>
        <Field label="Lembrança (opcional)"><textarea className="input min-h-24" value={f.lembranca} onChange={(x) => setF({ ...f, lembranca: x.target.value })} maxLength={1000} placeholder="O que aconteceu neste lugar" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.atual} onChange={(x) => setF({ ...f, atual: x.target.checked })} /> É onde moro hoje</label>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}
