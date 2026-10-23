// Produtos → Categorias: a lista de categorias (como no Tiny), com subcategorias no formato "Categoria > Sub".
// Mostra quantos produtos há em cada uma; renomear troca nos produtos; tirar da lista só quando não tem produto.
import { useMemo, useState } from "react";
import { FolderTree, Pencil, Plus, Search, X } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import type { Produto } from "@/lib/types";
import { pl } from "@/lib/format";

export type Categoria = { id: string; nome: string; ativo: boolean; margem_desejada?: number | null };

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
  const [vendo, setVendo] = useState<string | null>(null);
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
          <p className="text-sm text-slate-600">{lista.length} {pl(lista.length, "categoria", "categorias")} · {semCategoria} {pl(semCategoria, "produto", "produtos")} sem categoria. Subcategoria: escreva "Categoria &gt; Subcategoria".</p>
        </div>
        {podeEditar && (
          <form className="flex w-full gap-2 sm:w-auto" onSubmit={(e) => {
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
            <input className="input min-w-0 flex-1 sm:w-64 sm:flex-none" placeholder="Nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} />
            <Button disabled={ocupado || !nova.trim()}><Plus size={16} /> Criar</Button>
          </form>
        )}
      </div>
      <label className="relative mb-3 block max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Pesquise por descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      <ul className="cartao divide-y divide-slate-100">
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
                    return `Categoria renomeada (${data} ${pl(data, "produto", "produtos")} atualizados)`;
                  });
                }}>
                  <input className="input min-w-0 flex-1" autoFocus value={editando!.para} onChange={(e) => setEditando({ de: c.nome, para: e.target.value })} />
                  <Button disabled={ocupado}>Salvar</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                </form>
              ) : (
                <>
                  {/* tocar no nome mostra os produtos da categoria */}
                  <button type="button" disabled={!n} onClick={() => setVendo(vendo === c.nome ? null : c.nome)} aria-expanded={vendo === c.nome}
                    className="min-w-0 flex-1 text-left font-medium text-fg hover:text-modulo-texto disabled:hover:text-fg">{nivel ? c.nome.split(" > ").pop() : c.nome}</button>
                  <button type="button" disabled={!n} onClick={() => setVendo(vendo === c.nome ? null : c.nome)}
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${n ? "bg-slate-100 font-semibold text-slate-700 hover:bg-slate-200" : "text-slate-400"}`}>{n} {pl(n, "produto", "produtos")}{n ? (vendo === c.nome ? " ▴" : " ▾") : ""}</button>
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
              {vendo === c.nome && (
                <ul className="mt-1 w-full space-y-0.5 rounded-lg bg-slate-50 p-2 text-xs">
                  {produtos.filter((p) => p.categoria === c.nome).sort((x, y) => x.descricao.localeCompare(y.descricao, "pt-BR")).map((p) => (
                    <li key={p.id} className="flex justify-between gap-2"><span className={`truncate ${p.ativo === false ? "text-slate-400 line-through" : "text-slate-700"}`}>{p.descricao}</span><span className="shrink-0 font-mono text-slate-500">{p.sku ?? ""}</span></li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {!lista.length && <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma categoria{termo ? ` com "${busca}"` : ""}.</li>}
      </ul>
    </div>
  );
}

/** Campo Categoria do cadastro do produto: a lista e o botão para criar ou renomear categorias sem sair do cadastro. */
export function CampoCategoriaProduto({ valor, onChange, opcoes, produtos, podeEditar }: {
  valor: string | null | undefined; onChange: (v: string) => void; opcoes: { value: string; label: string }[]; produtos: Produto[]; podeEditar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <select className="input" aria-label="Categoria" value={valor ?? ""} onChange={(e) => onChange(e.target.value)}>
        {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button type="button" className="link-acao mt-1 inline-flex items-center gap-1 text-xs" onClick={() => setAberto(true)}>
        <FolderTree size={13} aria-hidden /> {podeEditar ? "Criar ou editar categorias" : "Ver categorias"}
      </button>
      {aberto && (
        <Modal open onClose={() => setAberto(false)} title="Categorias dos produtos" wide>
          <CategoriasProdutos produtos={produtos} podeEditar={podeEditar} />
          <div className="mt-4 flex justify-end"><Button type="button" onClick={() => setAberto(false)}>Pronto</Button></div>
        </Modal>
      )}
    </div>
  );
}
