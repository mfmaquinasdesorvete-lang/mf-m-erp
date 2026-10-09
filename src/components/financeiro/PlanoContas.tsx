// Financeiro → Plano de contas: as categorias de receita e despesa (e em que linha do DRE cada uma entra) e os
// centros de custo (fábrica, loja, assistência…) usados para dividir os lançamentos.
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Card, Field } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { GRUPOS, useCategorias, useCentros, type Categoria } from "./CategoriaRateio";

export function PlanoContas() {
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { data: cats = [] } = useCategorias();
  const { data: centros = [] } = useCentros();
  const invalidate = useInvalidate();
  const [nova, setNova] = useState<{ nome: string; tipo: "receita" | "despesa"; grupo: string }>({ nome: "", tipo: "despesa", grupo: "despesa_operacional" });
  const [centro, setCentro] = useState({ nome: "", descricao: "" });

  async function salvarCategoria(c: Partial<Categoria> & { id?: string }) {
    const { id, ...row } = c;
    const { error } = id ? await supabase.from("categorias_financeiras").update(row).eq("id", id) : await supabase.from("categorias_financeiras").insert(row);
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("já existe uma categoria com esse nome") : error);
    invalidate("categorias_financeiras");
    return true;
  }
  async function criarCategoria(e: FormEvent) {
    e.preventDefault();
    if (await salvarCategoria({ nome: nova.nome.trim(), tipo: nova.tipo, grupo: nova.grupo as Categoria["grupo"], ordem: 100 })) {
      notify("Categoria criada"); setNova({ ...nova, nome: "" });
    }
  }
  async function criarCentro(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("centros_custo").insert({ nome: centro.nome.trim(), descricao: centro.descricao.trim() || null });
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("já existe um centro de custo com esse nome") : error);
    notify("Centro de custo criado"); setCentro({ nome: "", descricao: "" }); invalidate("centros_custo");
  }
  async function ativarCentro(id: string, ativo: boolean) {
    const { error } = await supabase.from("centros_custo").update({ ativo }).eq("id", id);
    if (error) return notifyError(error);
    invalidate("centros_custo");
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2">
        <h2 className="mb-1 font-bold">Categorias (plano de contas)</h2>
        <p className="mb-3 text-sm text-slate-600">A linha do DRE diz onde cada categoria entra no resultado. Para não perder o histórico, categoria não muda de nome: desative a antiga e crie outra.</p>
        {(["receita", "despesa"] as const).map((tipo) => (
          <div key={tipo} className="mb-4">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{tipo === "receita" ? "Receitas" : "Despesas"}</div>
            <ul className="divide-y divide-slate-100">
              {cats.filter((c) => c.tipo === tipo).map((c) => (
                <li key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm ${c.ativo ? "" : "opacity-60"}`}>
                  <span className="min-w-[8rem] flex-1 font-medium">{c.nome}</span>
                  <select className="input w-full py-1 sm:w-[17rem]" value={c.grupo} disabled={!podeEditar} aria-label={`Linha do DRE de ${c.nome}`}
                    onChange={(e) => salvarCategoria({ id: c.id, grupo: e.target.value as Categoria["grupo"] }).then((ok) => ok && notify("Linha do DRE alterada"))}>
                    {GRUPOS.filter((g) => g.tipo === tipo || g.tipo === "ambos").map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                  {podeEditar && (
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" checked={c.ativo} onChange={(e) => salvarCategoria({ id: c.id, ativo: e.target.checked })} /> ativa
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {podeEditar && (
          <form onSubmit={criarCategoria} className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(10rem,1fr)_8rem_15rem_auto] sm:items-end">
            <Field label="Nova categoria"><input className="input" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} required minLength={2} maxLength={60} placeholder="Ex.: combustível" /></Field>
            <Field label="Tipo">
              <select className="input" value={nova.tipo} onChange={(e) => { const t = e.target.value as "receita" | "despesa"; setNova({ ...nova, tipo: t, grupo: t === "receita" ? "receita" : "despesa_operacional" }); }}>
                <option value="despesa">Despesa</option><option value="receita">Receita</option>
              </select>
            </Field>
            <Field label="Linha do DRE">
              <select className="input" value={nova.grupo} onChange={(e) => setNova({ ...nova, grupo: e.target.value })}>
                {GRUPOS.filter((g) => g.tipo === nova.tipo || g.tipo === "ambos").map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </Field>
            <Button><Plus size={16} /> Criar</Button>
          </form>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-bold">Centros de custo</h2>
        <p className="mb-3 text-sm text-slate-600">Separe receitas e despesas por área (fábrica, loja, assistência, filial). Um lançamento pode ser dividido entre vários centros.</p>
        {!centros.length ? <p className="text-sm text-slate-500">Nenhum centro de custo ainda.</p> : (
          <ul className="mb-3 divide-y divide-slate-100">
            {centros.map((c) => (
              <li key={c.id} className={`flex items-center justify-between gap-2 py-1.5 text-sm ${c.ativo ? "" : "opacity-60"}`}>
                <span><b>{c.nome}</b>{c.descricao && <span className="block text-xs text-slate-500">{c.descricao}</span>}</span>
                {podeEditar && <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={c.ativo} onChange={(e) => ativarCentro(c.id, e.target.checked)} /> ativo</label>}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <form onSubmit={criarCentro} className="space-y-2 border-t border-slate-100 pt-3">
            <Field label="Novo centro de custo"><input className="input" value={centro.nome} onChange={(e) => setCentro({ ...centro, nome: e.target.value })} required minLength={2} maxLength={60} placeholder="Ex.: Fábrica" /></Field>
            <Field label="Descrição (opcional)"><input className="input" value={centro.descricao} onChange={(e) => setCentro({ ...centro, descricao: e.target.value })} /></Field>
            <Button><Plus size={16} /> Criar centro</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
