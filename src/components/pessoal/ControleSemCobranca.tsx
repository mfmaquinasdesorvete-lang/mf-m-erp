// Cartão "Controle (não vou cobrar)" da aba Dinheiro: valores que a dona só acompanha (ex.: empréstimo a alguém da
// família), somados por pessoa. Não entram nas entradas, saídas nem saldos. Encerrar guarda o item no histórico.
import { useState, type FormEvent } from "react";
import { Check, HandHeart, Pencil, Plus, Undo2 } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { lerValor } from "@/lib/auditoriaBusca";
import { controlePorPessoa, type ItemControle } from "@/lib/controlePessoal";

export function ControleSemCobranca() {
  const invalidar = useInvalidate();
  const { data: itens = [] } = useRows<ItemControle>("pessoal_controle", { order: "data", ascending: false });
  const [editar, setEditar] = useState<Partial<ItemControle> | null>(null);
  const [verEncerrados, setVerEncerrados] = useState(false);
  const grupos = controlePorPessoa(itens);
  if (!itens.length && !editar) return null;

  async function encerrar(i: ItemControle) {
    const { error } = await supabase.from("pessoal_controle").update({ encerrado: !i.encerrado }).eq("id", i.id);
    if (error) return notifyError(error);
    notify(i.encerrado ? "Voltou para o controle" : "Encerrado");
    invalidar("pessoal_controle");
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="mr-auto min-w-0 flex-1 basis-60">
          <h2 className="flex items-center gap-2 font-bold text-fg"><HandHeart size={18} className="text-pink-700" aria-hidden /> Controle (não vou cobrar)</h2>
          <p className="text-xs text-slate-500">Só para acompanhar: não entra nas entradas, saídas nem no saldo das contas.</p>
        </div>
        <Button variant="secondary" onClick={() => setEditar({ pessoa: grupos[0]?.pessoa ?? "" })}><Plus size={15} /> Novo</Button>
      </div>
      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.pessoa} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-bold text-fg">{g.pessoa}</span>
              <span className="num font-bold text-fg">{brl(g.total)} <span className="text-xs font-normal text-slate-500">· {g.itens.length} {pl(g.itens.length, "item", "itens")}</span></span>
            </div>
            <ul className="divide-y divide-slate-100">
              {[...g.itens, ...(verEncerrados ? g.encerrados : [])].map((i) => (
                <li key={i.id} className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm ${i.encerrado ? "opacity-60" : ""}`}>
                  <span className="min-w-0 flex-1 basis-48">
                    <span className={`block text-fg ${i.encerrado ? "line-through" : ""}`}>{i.descricao}</span>
                    <span className="text-xs text-slate-500">{[i.data && dataBR(i.data), i.origem].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="num shrink-0 font-semibold text-fg">{brl(i.valor)}</span>
                  <button type="button" className="botao-icone h-7 w-7" onClick={() => setEditar(i)} aria-label={`Editar ${i.descricao}`}><Pencil size={13} /></button>
                  <button type="button" className="botao-icone h-7 w-7" onClick={() => encerrar(i)} aria-label={i.encerrado ? `Voltar ${i.descricao}` : `Encerrar ${i.descricao}`} title={i.encerrado ? "Voltar para o controle" : "Encerrar (quitado ou perdoado)"}>
                    {i.encerrado ? <Undo2 size={13} /> : <Check size={13} />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {grupos.some((g) => g.encerrados.length) && (
        <button type="button" className="link-discreto mt-2 text-xs" aria-expanded={verEncerrados} onClick={() => setVerEncerrados(!verEncerrados)}>{verEncerrados ? "Esconder os encerrados" : "Ver os encerrados"}</button>
      )}
      {editar && <ItemModal item={editar} onClose={() => setEditar(null)} onFeito={() => { setEditar(null); invalidar("pessoal_controle"); }} />}
    </Card>
  );
}

function ItemModal({ item, onClose, onFeito }: { item: Partial<ItemControle>; onClose: () => void; onFeito: () => void }) {
  const [f, setF] = useState({ pessoa: item.pessoa ?? "", descricao: item.descricao ?? "", valor: item.valor ? Number(item.valor).toFixed(2).replace(".", ",") : "", data: item.data ?? "", origem: item.origem ?? "" });
  const [gravando, setGravando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    const valor = lerValor(f.valor);
    if (!valor || valor <= 0) return notify("Informe o valor", "erro");
    const linha = { pessoa: f.pessoa.trim(), descricao: f.descricao.trim(), valor, data: f.data || null, origem: f.origem.trim() || null };
    if (linha.pessoa.length < 2 || linha.descricao.length < 2) return notify("Preencha a pessoa e o que foi", "erro");
    setGravando(true);
    const { error } = item.id ? await supabase.from("pessoal_controle").update(linha).eq("id", item.id) : await supabase.from("pessoal_controle").insert(linha);
    setGravando(false);
    if (error) return notifyError(error);
    notify(item.id ? "Alterado" : "Anotado no controle");
    onFeito();
  }
  return (
    <Modal open onClose={onClose} title={item.id ? "Editar item do controle" : "Novo item do controle"}>
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pessoa"><input className="input" value={f.pessoa} onChange={(e) => setF({ ...f, pessoa: e.target.value })} maxLength={120} required autoFocus /></Field>
          <Field label="Valor"><input className="input" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" required /></Field>
        </div>
        <Field label="O que foi"><input className="input" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} maxLength={300} required /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data"><input className="input" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
          <Field label="De onde saiu"><input className="input" value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} maxLength={200} placeholder="ex.: dinheiro da MF, minha conta" /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={gravando}>Salvar</Button></div>
      </form>
    </Modal>
  );
}
