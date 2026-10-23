// Mercado Livre → Produtos: os mesmos produtos da loja (/loja), cada um com o anúncio do Mercado Livre ligado a ele
// (direto ou por kit, "4 Un") e o que o ERP leu de lá, ou "sem anúncio". Lê ml_produtos_loja.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ImageOff, Search } from "lucide-react";
import { Card, Table, chip } from "@/components/ui";
import { brl, pl } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { DISPONIBILIDADE, urlFotoProduto } from "@/lib/catalogo";
import { linkAnuncio } from "@/lib/mlAnuncios";

type AnuncioProduto = {
  anuncio_id: string; ml_item_id: string; variation_id: string | null; titulo: string | null; quantidade: number;
  status_ml: string | null; preco_ml: number | null; estoque_ml: number | null; erro: string | null;
};
type ProdutoML = {
  id: string; sku: string | null; nome: string; tipo: string; preco: number; foto: string | null; disponibilidade: string;
  anuncios: AnuncioProduto[];
};
type Filtro = "todos" | "com" | "sem";

const TIPO: Record<string, string> = { maquina: "Máquina", acessorio: "Acessório", peca: "Peça", insumo: "Insumo" };
const STATUS: Record<string, { texto: string; cor: string }> = {
  active: { texto: "Ativo", cor: "bg-emerald-100 text-emerald-800" },
  paused: { texto: "Pausado", cor: "bg-amber-100 text-amber-800" },
  closed: { texto: "Finalizado", cor: "bg-slate-100 text-slate-600" },
  under_review: { texto: "Em revisão", cor: "bg-sky-100 text-sky-800" },
};
const sem = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ProdutosLojaML() {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const q = useQuery({
    queryKey: ["ml_anuncios", "produtos_loja"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ml_produtos_loja");
      if (error) throw error;
      return (data ?? []) as ProdutoML[];
    },
  });
  const produtos = q.data ?? [];
  const com = produtos.filter((p) => p.anuncios.length).length;
  const lista = useMemo(() => {
    const termo = sem(busca.trim());
    return produtos.filter((p) => (filtro === "todos" || (filtro === "com") === p.anuncios.length > 0)
      && (!termo || [p.nome, p.sku, ...p.anuncios.flatMap((a) => [a.titulo, a.ml_item_id])].some((x) => sem(x).includes(termo))));
  }, [produtos, busca, filtro]);

  if (q.error) return <Card className="p-4 text-sm text-red-700">Não deu para ler os produtos: {(q.error as Error).message}</Card>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Os mesmos produtos da loja (ativos, no catálogo, com foto e preço). Ao lado, o anúncio do Mercado Livre de cada um.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar: nome, SKU ou MLB" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar produtos">
          {([["todos", `Todos ${produtos.length}`], ["com", `Anunciados ${com}`], ["sem", `Sem anúncio ${produtos.length - com}`]] as const).map(([v, t]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)} aria-pressed={filtro === v} className={chip(filtro === v, "border-brand bg-brand-light text-brand")}>{t}</button>
          ))}
        </div>
      </div>

      <Table empty={!q.isLoading && !lista.length} head={<>
        <th className="th">Produto na loja</th><th className="th text-right">Preço na loja</th><th className="th">No Mercado Livre</th>
      </>}>
        {lista.map((p) => {
          const d = DISPONIBILIDADE[p.disponibilidade] ?? DISPONIBILIDADE["out of stock"];
          return (
            <tr key={p.id}>
              <td className="td">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                    {p.foto ? <img src={urlFotoProduto(p.foto)} alt="" loading="lazy" className="h-full w-full object-contain" /> : <ImageOff size={18} className="text-slate-300" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[24rem] font-semibold text-fg">{p.nome}</span>
                    <span className="block text-xs text-slate-500">
                      {TIPO[p.tipo] ?? p.tipo}{p.sku ? ` · SKU ${p.sku}` : ""} · <span className={`rounded-full px-1.5 py-0.5 font-semibold ${d.tom}`}>{d.rotulo}</span>
                    </span>
                  </span>
                </div>
              </td>
              <td className="td num text-right">{brl(p.preco)}</td>
              <td className="td">
                {!p.anuncios.length ? <span className="text-sm text-slate-500">Sem anúncio</span> : (
                  <ul className="space-y-1.5">
                    {p.anuncios.map((a) => {
                      const s = a.status_ml ? STATUS[a.status_ml] ?? { texto: a.status_ml, cor: "bg-slate-100 text-slate-600" } : null;
                      return (
                        <li key={a.anuncio_id} className="text-sm">
                          <a href={linkAnuncio(a.ml_item_id)} target="_blank" rel="noreferrer" className="font-semibold text-fg hover:text-brand hover:underline">
                            {a.titulo || a.ml_item_id} <ExternalLink size={12} className="inline" aria-label="abre no Mercado Livre" />
                          </a>
                          <span className="block text-xs text-slate-500">
                            {a.ml_item_id}{a.quantidade > 1 ? ` · kit com ${a.quantidade}` : ""}
                            {a.preco_ml != null ? ` · ${brl(a.preco_ml)}` : ""}
                            {a.estoque_ml != null ? ` · ${a.estoque_ml} ${pl(a.estoque_ml, "disponível", "disponíveis")}` : ""}
                            {s && <> · <span className={`rounded-full px-1.5 py-0.5 font-semibold ${s.cor}`}>{s.texto}</span></>}
                          </span>
                          {a.erro && <span className="block text-xs text-red-700">{a.erro}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
