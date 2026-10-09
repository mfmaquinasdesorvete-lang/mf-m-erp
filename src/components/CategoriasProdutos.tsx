// Produtos → Categorias: a lista de categorias (como no Tiny), com subcategorias no formato "Categoria > Sub".
// Mostra quantos produtos há em cada uma; renomear troca nos produtos; tirar da lista só quando não tem produto.
import { useMemo, useState } from "react";
import { FolderTree, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import type { Produto } from "@/lib/types";

export type Categoria = { id: string; nome: string; ativo: boolean };

export function useCategoriasProduto() {
  return useRows<Categoria>("categorias_produto", { order: "nome", ascending: true });
}

/** Opções para o campo Categoria do produto: as da lista e as que já estão em produtos. */
export function opcoesCategoria(categorias: Categoria[], produtos: Pick<Produto, "categoria">[]) {
  const nomes = new Set(categorias.filter((c) => c.ativo).map((c) => c.nome));
  for (const p of produtos) if (p.categoria?.trim()) nomes.add(p.categoria.trim());
  return [{ value: "", label: "— sem categoria —" }, ...[...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).map((n) => ({ value: n, label: n.replace(/ > /g, " › ") }))];
}

export function CategoriasProdutos({ produtos, podeEditar }: { produtos: Produto[]; podeEditar: boolean }) {
  const { data: categorias = [] } = useCategoriasProduto();
  const invalidar = useInvalidate();
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState("");
  const [editando, setEditando] = useState<{ de: string; para: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of produtos) { const c = p.categoria?.trim(); if (c) m.set(c, (m.get(c) ?? 0) + 1); }
    return m;
  }, [produtos]);
  const semCategoria = produtos.filter((p) => !p.categoria?.trim()).length;
  const termo = busca.trim().toLowerCase();
  const lista = categorias.filter((c) => c.ativo && (!termo || c.nome.toLowerCase().includes(termo)));

  async function executar(f: () => Promise<string>) {
    setOcupado(true);
    try { notify(await f()); invalidar("categorias_produto", "produtos"); } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><FolderTree size={18} className="text-brand" /> Categorias dos produtos</h2>
          <p className="text-sm text-slate-600">{lista.length} categoria(s) · {semCategoria} produto(s) sem categoria. Subcategoria: escreva "Categoria &gt; Subcategoria".</p>
        </div>
        {podeEditar && (
          <form className="flex gap-2" onSubmit={(e) => {
            e.preventDefault();
            const nome = nova.trim();
            if (!nome) return;
            executar(async () => {
              const { error } = await supabase.from("categorias_produto").upsert({ nome, ativo: true }, { onConflict: "nome" });
              if (error) throw error;
              setNova("");
              return `Categoria "${nome}" criada`;
            });
          }}>
            <input className="input w-64" placeholder="Nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} />
            <Button disabled={ocupado || !nova.trim()}><Plus size={16} /> Criar</Button>
          </form>
        )}
      </div>
      <label className="relative mb-3 block max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Pesquise por descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface">
        {lista.map((c) => {
          const nivel = c.nome.split(" > ").length - 1;
          const n = contagem.get(c.nome) ?? 0;
          const emEdicao = editando?.de === c.nome;
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" style={{ paddingLeft: 12 + nivel * 22 }}>
              {emEdicao ? (
                <form className="flex flex-1 flex-wrap gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  const para = editando!.para.trim();
                  if (!para || para === c.nome) { setEditando(null); return; }
                  executar(async () => {
                    const { data, error } = await supabase.rpc("renomear_categoria_produto", { p_de: c.nome, p_para: para });
                    if (error) throw error;
                    setEditando(null);
                    return `Categoria renomeada (${data} produto(s) atualizados)`;
                  });
                }}>
                  <input className="input min-w-0 flex-1" autoFocus value={editando!.para} onChange={(e) => setEditando({ de: c.nome, para: e.target.value })} />
                  <Button disabled={ocupado}>Salvar</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 font-medium text-fg">{nivel ? c.nome.split(" > ").pop() : c.nome}</span>
                  <span className={`whitespace-nowrap text-xs ${n ? "text-slate-600" : "text-slate-400"}`}>{n} produto(s)</span>
                  {podeEditar && <Button type="button" variant="ghost" title="Renomear (troca também nos produtos)" onClick={() => setEditando({ de: c.nome, para: c.nome })}><Pencil size={14} /></Button>}
                  {podeEditar && !n && (
                    <Button type="button" variant="ghost" className="!text-red-600" title="Tirar da lista (só sem produtos)" disabled={ocupado}
                      onClick={() => executar(async () => {
                        const { error } = await supabase.from("categorias_produto").update({ ativo: false }).eq("id", c.id);
                        if (error) throw error;
                        return `"${c.nome}" saiu da lista`;
                      })}><X size={14} /></Button>
                  )}
                </>
              )}
            </li>
          );
        })}
        {!lista.length && <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma categoria{termo ? ` com "${busca}"` : ""}.</li>}
      </ul>
    </div>
  );
}
