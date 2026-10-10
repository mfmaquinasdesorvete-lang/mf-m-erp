// Pessoas de contato do cliente (compras, financeiro, técnico…), como no Tiny: nome, setor, e-mail, telefone e ramal.
// A lista é editada aqui e gravada junto com o cadastro (botão Salvar do formulário).
import { useState } from "react";
import { Check, Mail, Pencil, Phone, Plus, Trash2, UserRound, X } from "lucide-react";
import { Button } from "../ui";
import { erroCampo, formatarTelefone, gravar, mostrar } from "@/lib/mascaras";
import { iniciais } from "@/lib/fichaCadastral";
import type { PessoaContato } from "@/lib/types";

export type PessoaEditada = PessoaContato & { chave: string; removida?: boolean; alterada?: boolean };

const VAZIA = { nome: "", setor: "", email: "", telefone: "", ramal: "" };
const SETORES = ["Compras", "Financeiro", "Técnico", "Proprietário", "Gerente", "Recebimento"];

export function PessoasContato({ pessoas, onChange, disabled }: { pessoas: PessoaEditada[]; onChange: (p: PessoaEditada[]) => void; disabled?: boolean }) {
  const [editando, setEditando] = useState<string | null>(null); // chave da pessoa ou "nova"
  const [form, setForm] = useState<typeof VAZIA>(VAZIA);
  const [erro, setErro] = useState<string | null>(null);
  const visiveis = pessoas.filter((p) => !p.removida);

  function abrir(p?: PessoaEditada) {
    setErro(null);
    setForm(p ? { nome: p.nome, setor: p.setor ?? "", email: p.email ?? "", telefone: p.telefone ?? "", ramal: p.ramal ?? "" } : VAZIA);
    setEditando(p ? p.chave : "nova");
  }

  function confirmar() {
    if (!form.nome.trim()) return setErro("Informe o nome");
    const e = erroCampo("email", form.email) ?? erroCampo("telefone", form.telefone);
    if (e) return setErro(e);
    const dados = { nome: form.nome.trim(), setor: form.setor.trim() || null, email: form.email.trim().toLowerCase() || null, telefone: form.telefone || null, ramal: form.ramal.trim() || null };
    if (editando === "nova") onChange([...pessoas, { ...dados, chave: crypto.randomUUID(), alterada: true }]);
    else onChange(pessoas.map((p) => (p.chave === editando ? { ...p, ...dados, alterada: true } : p)));
    setEditando(null);
  }

  const remover = (p: PessoaEditada) =>
    onChange(p.id ? pessoas.map((x) => (x.chave === p.chave ? { ...x, removida: true } : x)) : pessoas.filter((x) => x.chave !== p.chave));

  const formulario = (
    <div className="rounded-xl border border-brand/40 bg-brand-light/40 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <input className="input sm:col-span-4" placeholder="Nome *" value={form.nome} autoFocus onChange={(e) => setForm({ ...form, nome: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } }} />
        <input className="input sm:col-span-3" placeholder="Setor" list="setores-contato" value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} />
        <input className="input sm:col-span-5" placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input sm:col-span-5" placeholder="Telefone / WhatsApp" inputMode="numeric" value={mostrar("telefone", form.telefone)}
          onChange={(e) => setForm({ ...form, telefone: gravar("telefone", e.target.value) })} />
        <input className="input sm:col-span-2" placeholder="Ramal" value={form.ramal} onChange={(e) => setForm({ ...form, ramal: e.target.value })} />
        <div className="flex gap-2 sm:col-span-5 sm:justify-end">
          <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => setEditando(null)}><X size={15} /> Cancelar</Button>
          <Button type="button" className="flex-1 sm:flex-none" onClick={confirmar}><Check size={15} /> {editando === "nova" ? "Adicionar" : "Confirmar"}</Button>
        </div>
      </div>
      {erro && <p className="mt-2 text-xs font-semibold text-red-600">{erro}</p>}
      <datalist id="setores-contato">{SETORES.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );

  return (
    <div className="space-y-2">
      {visiveis.length === 0 && editando !== "nova" && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
          Nenhuma pessoa de contato. Cadastre quem compra, quem paga e quem recebe a máquina.
        </p>
      )}
      <ul className="space-y-2">
        {visiveis.map((p) => editando === p.chave ? <li key={p.chave}>{formulario}</li> : (
          <li key={p.chave} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-surface px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600" aria-hidden>{iniciais(p.nome)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-fg">
                {p.nome}
                {p.setor && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{p.setor}</span>}
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail size={12} /> {p.email}</a>}
                {p.telefone && <a href={`tel:+55${p.telefone}`} className="inline-flex items-center gap-1 hover:underline"><Phone size={12} /> {formatarTelefone(p.telefone)}{p.ramal ? ` ramal ${p.ramal}` : ""}</a>}
                {!p.email && !p.telefone && <span className="inline-flex items-center gap-1"><UserRound size={12} /> sem contato</span>}
              </div>
            </div>
            {!disabled && (
              <div className="flex shrink-0 gap-1">
                <button type="button" title="Editar" aria-label={`Editar ${p.nome}`} onClick={() => abrir(p)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                <button type="button" title="Excluir" aria-label={`Excluir ${p.nome}`} onClick={() => remover(p)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editando === "nova" ? formulario : !disabled && (
        <Button type="button" variant="secondary" onClick={() => abrir()}><Plus size={15} /> Adicionar pessoa de contato</Button>
      )}
    </div>
  );
}
