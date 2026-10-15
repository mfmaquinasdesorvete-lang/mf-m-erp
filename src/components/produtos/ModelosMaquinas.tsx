// Vitrine dos modelos de máquina no cadastro de Máquinas: foto, preço, estoque e quantas estão com clientes.
// Tocar no cartão abre a ficha do produto (fotos, manuais, clientes, assistência, custos).
import { useQuery } from "@tanstack/react-query";
import { FileText, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { brl, hoje, pl } from "@/lib/format";
import { urlFotoProduto } from "@/lib/catalogo";
import type { Produto } from "@/lib/types";

type Base = { produto_id: string | null; garantia_ate: string | null };

export function ModelosMaquinas({ produtos, aoAbrir }: { produtos: Produto[]; aoAbrir: (p: Produto) => void }) {
  const { data: base = [] } = useQuery({
    queryKey: ["equipamentos", "por_modelo"],
    queryFn: async () => {
      const linhas: Base[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("equipamentos").select("produto_id, garantia_ate").not("produto_id", "is", null).range(de, de + 999);
        if (error) throw error;
        linhas.push(...((data ?? []) as Base[]));
        if (!data || data.length < 1000) break;
      }
      return linhas;
    },
  });
  const dia = hoje();
  const modelos = produtos.filter((p) => p.tipo === "maquina" && p.ativo !== false && !p.unificado_em);
  if (!modelos.length) return null;
  return (
    <section aria-label="Modelos de máquina" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {modelos.map((p) => {
        const doModelo = base.filter((e) => e.produto_id === p.id);
        const garantia = doModelo.filter((e) => e.garantia_ate && e.garantia_ate >= dia).length;
        const espec = (p.especificacoes ?? []).length, etapas = (p.etapas_producao ?? []).length;
        return (
          <button key={p.id} type="button" onClick={() => aoAbrir(p)} aria-label={`Ficha de ${p.descricao}`}
            className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface text-left shadow-sm transition hover:border-brand hover:shadow-pop">
            <span className="grid aspect-[4/3] w-full place-items-center bg-white">
              {p.foto_caminho ? <img src={urlFotoProduto(p.foto_caminho)} alt="" loading="lazy" className="h-full w-full object-contain p-2" />
                : <span className="text-xs text-slate-400">sem foto</span>}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
              <span className="line-clamp-2 text-sm font-bold leading-snug text-fg">{p.modelo?.trim() || p.descricao}</span>
              <span className="num text-sm font-semibold text-brand">{Number(p.preco_venda) > 0 ? brl(Number(p.preco_venda)) : "sem preço"}</span>
              <span className="flex flex-wrap gap-1 text-[11px]">
                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${Number(p.estoque_atual) > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {Number(p.estoque_atual) > 0 ? `${Number(p.estoque_atual)} em estoque` : "sem estoque"}
                </span>
                {doModelo.length > 0 && <span className="rounded-full bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">{doModelo.length} {pl(doModelo.length, "cliente", "clientes")}</span>}
                {garantia > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800"><ShieldCheck size={10} aria-hidden /> {garantia} em garantia</span>}
              </span>
              {(!espec || !etapas) && (
                <span className="mt-auto inline-flex items-center gap-1 text-[11px] text-amber-700"><FileText size={11} aria-hidden /> falta {[!espec && "especificações", !etapas && "etapas"].filter(Boolean).join(" e ")}</span>
              )}
            </span>
          </button>
        );
      })}
    </section>
  );
}
