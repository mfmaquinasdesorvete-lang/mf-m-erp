// Categorias dos cadastros (tipo de contato): Fornecedor, Revenda, Técnico parceiro… e as que a MF criar.
// Ficam como etiquetas no cadastro do cliente. Renomear troca só o nome (quem já tem a etiqueta continua com ela);
// tirar da lista não apaga a etiqueta de ninguém. As usadas pelo ERP (Fornecedor, Técnico parceiro) só mudam de nome.
import { useState } from "react";
import { Lock, Pencil, Plus, Tags, Undo2, X } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";

export type TipoContato = { chave: string; nome: string; cor: string; ordem: number; ativo: boolean; sistema: boolean };

export const CORES_TIPO = {
  purple: { chip: "border-purple-200 bg-purple-100 text-purple-800", ponto: "bg-purple-500" },
  indigo: { chip: "border-indigo-200 bg-indigo-100 text-indigo-800", ponto: "bg-indigo-500" },
  sky: { chip: "border-sky-200 bg-sky-100 text-sky-800", ponto: "bg-sky-500" },
  emerald: { chip: "border-emerald-200 bg-emerald-100 text-emerald-800", ponto: "bg-emerald-500" },
  amber: { chip: "border-amber-200 bg-amber-100 text-amber-800", ponto: "bg-amber-500" },
  orange: { chip: "border-orange-200 bg-orange-100 text-orange-800", ponto: "bg-orange-500" },
  red: { chip: "border-red-200 bg-red-100 text-red-800", ponto: "bg-red-500" },
  slate: { chip: "border-slate-200 bg-slate-100 text-slate-700", ponto: "bg-slate-500" },
} as const;
type Cor = keyof typeof CORES_TIPO;
export const corTipo = (cor?: string | null) => CORES_TIPO[(cor ?? "") as Cor] ?? CORES_TIPO.purple;

// enquanto a lista não chega (ou antes da migração), as três de sempre
const PADRAO: TipoContato[] = [
  { chave: "fornecedor", nome: "Fornecedor", cor: "purple", ordem: 1, ativo: true, sistema: true },
  { chave: "revenda", nome: "Revenda", cor: "indigo", ordem: 2, ativo: true, sistema: false },
  { chave: "parceiro", nome: "Técnico parceiro", cor: "orange", ordem: 3, ativo: true, sistema: true },
];
const RESERVADAS = ["cliente", "endereco_receita", "cnpj_irregular", "ie_baixada"];

export function useTiposContato() {
  const { data } = useRows<TipoContato>("tipos_contato", { order: "ordem", ascending: true });
  return data?.length ? data : PADRAO;
}

const chaveDe = (nome: string) => {
  const c = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "categoria";
  return RESERVADAS.includes(c) ? `${c}_1` : c;
};

function Cores({ valor, onChange }: { valor: string; onChange: (c: Cor) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor">
      {(Object.keys(CORES_TIPO) as Cor[]).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={valor === c} aria-label={c} onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ${CORES_TIPO[c].ponto} ring-offset-2 ring-offset-surface transition ${valor === c ? "ring-2 ring-slate-500" : "opacity-70 hover:opacity-100"}`} />
      ))}
    </div>
  );
}

export function CategoriasContato({ open, onClose, podeEditar }: { open: boolean; onClose: () => void; podeEditar: boolean }) {
  const tipos = useTiposContato();
  const invalidar = useInvalidate();
  const [nova, setNova] = useState({ nome: "", cor: "sky" as Cor });
  const [editando, setEditando] = useState<{ chave: string; nome: string; cor: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ativas = tipos.filter((t) => t.ativo);
  const fora = tipos.filter((t) => !t.ativo);

  async function executar(f: () => Promise<string>) {
    setOcupado(true);
    try { notify(await f()); invalidar("tipos_contato"); return true; } catch (e) { notifyError(e); return false; } finally { setOcupado(false); }
  }
  const atualizar = (chave: string, campos: Partial<TipoContato>) => executar(async () => {
    const { error } = await supabase.from("tipos_contato").update(campos).eq("chave", chave);
    if (error) throw error;
    return campos.ativo === false ? "Saiu da lista (quem já tem a etiqueta continua com ela)" : campos.ativo ? "Voltou para a lista" : "Categoria salva";
  });

  return (
    <Modal open={open} onClose={onClose} title="Categorias dos cadastros">
      <p className="mb-4 text-sm text-slate-600">
        Aparecem no cadastro do cliente (<b>Tipo de contato</b>) e no filtro <b>Etiqueta</b> da lista. Trocar o nome não mexe em quem já está marcado.
      </p>

      {podeEditar && (
        <form className="mb-4 space-y-2 rounded-xl border border-slate-200 p-3" onSubmit={(e) => {
          e.preventDefault();
          const nome = nova.nome.trim();
          if (!nome) return;
          const chave = chaveDe(nome);
          const existe = tipos.find((t) => t.chave === chave);
          if (existe?.ativo) { notify(`Já existe a categoria "${existe.nome}"`, "erro"); return; }
          executar(async () => {
            const { error } = existe
              ? await supabase.from("tipos_contato").update({ nome, cor: nova.cor, ativo: true }).eq("chave", chave)
              : await supabase.from("tipos_contato").insert({ chave, nome, cor: nova.cor, ativo: true, ordem: Math.max(0, ...tipos.map((t) => t.ordem)) + 1 });
            if (error) throw error;
            setNova({ nome: "", cor: "sky" });
            return `Categoria "${nome}" criada`;
          });
        }}>
          <div className="flex flex-wrap gap-2">
            <input className="input min-w-0 flex-1" placeholder="Nova categoria (ex.: Distribuidor, Transportador, Assistência)" maxLength={40}
              value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
            <Button disabled={ocupado || !nova.nome.trim()}><Plus size={16} /> Criar</Button>
          </div>
          <Cores valor={nova.cor} onChange={(cor) => setNova({ ...nova, cor })} />
        </form>
      )}

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {ativas.map((t) => (
          <li key={t.chave} className="px-3 py-2.5 text-sm">
            {editando?.chave === t.chave ? (
              <form className="space-y-2" onSubmit={(e) => {
                e.preventDefault();
                const nome = editando.nome.trim();
                if (!nome) return;
                atualizar(t.chave, { nome, cor: editando.cor }).then((ok) => ok && setEditando(null));
              }}>
                <div className="flex flex-wrap gap-2">
                  <input className="input min-w-0 flex-1" autoFocus maxLength={40} value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
                  <Button disabled={ocupado || !editando.nome.trim()}>Salvar</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                </div>
                <Cores valor={editando.cor} onChange={(cor) => setEditando({ ...editando, cor })} />
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${corTipo(t.cor).chip}`}>
                  <Tags size={12} aria-hidden /> {t.nome}
                </span>
                <span className="min-w-0 flex-1" />
                {t.sistema && <span title="Usada pelo ERP: pode trocar o nome e a cor, mas não sai da lista" className="text-slate-400"><Lock size={14} /></span>}
                {podeEditar && (
                  <Button type="button" variant="ghost" title="Trocar nome e cor" onClick={() => setEditando({ chave: t.chave, nome: t.nome, cor: t.cor })}><Pencil size={14} /></Button>
                )}
                {podeEditar && !t.sistema && (
                  <Button type="button" variant="ghost" className="!text-red-600" title="Tirar da lista" disabled={ocupado} onClick={() => atualizar(t.chave, { ativo: false })}><X size={14} /></Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {fora.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Fora da lista</h3>
          <ul className="flex flex-wrap gap-2">
            {fora.map((t) => (
              <li key={t.chave} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 py-0.5 pl-2.5 pr-1 text-xs text-slate-500">
                {t.nome}
                {podeEditar && (
                  <button type="button" disabled={ocupado} title="Voltar para a lista" onClick={() => atualizar(t.chave, { ativo: true })}
                    className="rounded-full p-1 hover:bg-slate-100"><Undo2 size={12} /></button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
