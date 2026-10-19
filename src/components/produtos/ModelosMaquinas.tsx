// Vitrine dos modelos de máquina no cadastro de Máquinas: foto, preço, estoque e quantas estão com clientes.
// Tocar no cartão abre a ficha do produto (fotos, manuais, clientes, assistência, custos).
import { useQuery } from "@tanstack/react-query";
import { FileText, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { brl, hoje, pl } from "@/lib/format";
import { urlFotoProduto } from "@/lib/catalogo";
import type { Produto } from "@/lib/types";

type Base = { produto_id: string | null; garantia_ate: string | null; descricao: string; origem: string | null };

export function ModelosMaquinas({ produtos, aoAbrir }: { produtos: Produto[]; aoAbrir: (p: Produto) => void }) {
  const { data: base = [] } = useQuery({
    queryKey: ["equipamentos", "por_modelo"],
    queryFn: async () => {
      const linhas: Base[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("equipamentos").select("produto_id, garantia_ate, descricao, origem").range(de, de + 999);
        if (error) throw error;
        linhas.push(...((data ?? []) as Base[]));
        if (!data || data.length < 1000) break;
      }
      return linhas;
    },
  });
  const dia = hoje();
  const modelos = produtos.filter((p) => p.tipo === "maquina" && p.ativo !== false && !p.unificado_em);
  // modelos que só existem nas máquinas importadas da My Frost (P 313, S 430…): sem cadastro de produto, mas com clientes
  const antigos = [...base.filter((e) => !e.produto_id).reduce((m, e) => m.set(e.descricao, (m.get(e.descricao) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  if (!modelos.length && !antigos.length) return null;
  // cartões baixos (foto pequena ao lado do nome): os modelos cabem em poucas linhas e a lista logo abaixo aparece
  return (
    <section aria-label="Modelos de máquina" className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {modelos.map((p) => {
        const doModelo = base.filter((e) => e.produto_id === p.id);
        const garantia = doModelo.filter((e) => e.garantia_ate && e.garantia_ate >= dia).length;
        const espec = (p.especificacoes ?? []).length, etapas = (p.etapas_producao ?? []).length;
        const falta = [!espec && "especificações", !etapas && "etapas"].filter(Boolean).join(" e ");
        return (
          <button key={p.id} type="button" onClick={() => aoAbrir(p)} aria-label={`Ficha de ${p.descricao}`}
            className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-surface p-2 text-left shadow-sm transition hover:border-brand hover:shadow-pop">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-white">
              {p.foto_caminho ? <img src={urlFotoProduto(p.foto_caminho)} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                : <span className="text-2xs text-slate-400">sem foto</span>}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-bold text-fg" title={p.descricao}>{p.modelo?.trim() || p.descricao}</span>
              <span className="num text-sm font-semibold text-brand">{Number(p.preco_venda) > 0 ? brl(Number(p.preco_venda)) : "sem preço"}</span>
              <span className="flex flex-wrap gap-1 text-2xs">
                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${Number(p.estoque_atual) > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {Number(p.estoque_atual) > 0 ? `${Number(p.estoque_atual)} em estoque` : "sem estoque"}
                </span>
                {doModelo.length > 0 && <span className="rounded-lg bg-solido-azul px-2 py-0.5 text-xs font-black text-white shadow-sm" title="Máquinas deste modelo com clientes">{doModelo.length} {pl(doModelo.length, "cliente", "clientes")}</span>}
                {garantia > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800"><ShieldCheck size={10} aria-hidden /> {garantia} em garantia</span>}
                {falta && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800" title={`Falta ${falta} na ficha da máquina`}><FileText size={10} aria-hidden /> ficha incompleta</span>}
              </span>
            </span>
          </button>
        );
      })}
      {antigos.length > 0 && (
        <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Modelos antigos (vieram da My Frost, sem cadastro de produto) · clientes com cada um</p>
          <div className="flex flex-wrap gap-2">
            {antigos.map(([d, n]) => (
              <span key={d} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 py-1.5 text-sm">
                <b className="text-fg">{d.replace(/^My Frost\s*/i, "") || d}</b>
                <span className="rounded-lg bg-solido-azul px-2 py-0.5 text-xs font-black text-white">{n} {pl(n, "cliente", "clientes")}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
