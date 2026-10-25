// Vitrine dos modelos de máquina no cadastro de Máquinas: foto, preço, estoque e quantas estão com clientes.
// Tocar no cartão abre a ficha do produto (fotos, manuais, clientes, assistência, custos); tocar em "N clientes" abre
// a lista de quem tem o modelo (ClientesDoModelo).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { brl, hoje, pl } from "@/lib/format";
import { urlFotoProduto } from "@/lib/catalogo";
import type { Produto } from "@/lib/types";
import { ClientesDoModelo } from "./ClientesDoModelo";

/** "My Frost P 765 - Máquina de Sorvete…" vira "P 765" no gráfico. */
const nomeCurto = (d: string) => d.replace(/^My Frost\s*/i, "").split(/\s[-–]\s/)[0].trim() || d;

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
  const [verClientes, setVerClientes] = useState<{ titulo: string; produtoId?: string; descricao?: string } | null>(null);
  const modelos = produtos.filter((p) => p.tipo === "maquina" && p.ativo !== false && !p.unificado_em);
  // modelos que só existem nas máquinas importadas da My Frost (P 313, S 430…): sem cadastro de produto, mas com clientes
  const antigos = [...base.filter((e) => !e.produto_id).reduce((m, e) => m.set(e.descricao, (m.get(e.descricao) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  if (!modelos.length && !antigos.length) return null;
  // gráfico: todas as máquinas com clientes, por modelo (atuais e antigos da My Frost juntos)
  const barras = [
    ...modelos.map((p) => ({ nome: nomeCurto(p.modelo?.trim() || p.descricao), n: base.filter((e) => e.produto_id === p.id).length, antigo: false })),
    ...antigos.map(([d, n]) => ({ nome: nomeCurto(d), n, antigo: true })),
  ].filter((b) => b.n > 0).sort((a, b) => b.n - a.n);
  // cartões baixos (foto pequena ao lado do nome): os modelos cabem em poucas linhas e a lista logo abaixo aparece
  return (
    <>
    {barras.length > 0 && <GraficoModelos barras={barras} />}
    <section aria-label="Modelos de máquina" className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {modelos.map((p) => {
        const doModelo = base.filter((e) => e.produto_id === p.id);
        const garantia = doModelo.filter((e) => e.garantia_ate && e.garantia_ate >= dia).length;
        const espec = (p.especificacoes ?? []).length, etapas = (p.etapas_producao ?? []).length;
        const falta = [!espec && "especificações", !etapas && "etapas"].filter(Boolean).join(" e ");
        return (
          // o cartão abre a ficha; o selo "N clientes" é outro botão (botão dentro de botão não pode)
          <div key={p.id} role="button" tabIndex={0} onClick={() => aoAbrir(p)} aria-label={`Ficha de ${p.descricao}`}
            onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); aoAbrir(p); } }}
            className="cartao group flex min-w-0 cursor-pointer items-center gap-3 p-2 text-left shadow-sm transition hover:border-brand hover:shadow-pop">
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
                {doModelo.length > 0 && (
                  <button type="button" className="rounded-lg bg-solido-azul px-2 py-0.5 text-xs font-black text-white shadow-sm hover:opacity-90" title="Ver os clientes com este modelo"
                    onClick={(ev) => { ev.stopPropagation(); setVerClientes({ titulo: p.modelo?.trim() || p.descricao, produtoId: p.id }); }}>
                    {doModelo.length} {pl(doModelo.length, "cliente", "clientes")}
                  </button>
                )}
                {garantia > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800"><ShieldCheck size={10} aria-hidden /> {garantia} em garantia</span>}
                {falta && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800" title={`Falta ${falta} na ficha da máquina`}><FileText size={10} aria-hidden /> ficha incompleta</span>}
              </span>
            </span>
          </div>
        );
      })}
      {antigos.length > 0 && (
        <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Modelos antigos (vieram da My Frost, sem cadastro de produto) · clientes com cada um</p>
          <div className="flex flex-wrap gap-2">
            {antigos.map(([d, n]) => (
              <span key={d} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 py-1.5 text-sm">
                <b className="text-fg">{d.replace(/^My Frost\s*/i, "") || d}</b>
                <button type="button" className="rounded-lg bg-solido-azul px-2 py-0.5 text-xs font-black text-white hover:opacity-90" title="Ver os clientes com este modelo"
                  onClick={() => setVerClientes({ titulo: d.replace(/^My Frost\s*/i, "") || d, descricao: d })}>{n} {pl(n, "cliente", "clientes")}</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
    {verClientes && <ClientesDoModelo modelo={verClientes} onClose={() => setVerClientes(null)} />}
    </>
  );
}

/** Barras horizontais: quantas máquinas com clientes de cada modelo, do maior para o menor. */
function GraficoModelos({ barras }: { barras: { nome: string; n: number; antigo: boolean }[] }) {
  const total = barras.reduce((s, b) => s + b.n, 0);
  const maior = barras[0]?.n || 1;
  return (
    <section aria-label="Máquinas com clientes por modelo" className="cartao mb-4 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-fg">Máquinas com clientes por modelo</h2>
        <p className="text-xs text-slate-500">
          <b className="num text-base text-fg">{total.toLocaleString("pt-BR")}</b> máquinas · {barras.length} modelos
          <span className="ml-2 inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-brand" aria-hidden /> atuais</span>
          <span className="ml-2 inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-slate-400" aria-hidden /> antigos</span>
        </p>
      </div>
      <ul className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
        {barras.map((b) => (
          <li key={`${b.antigo}-${b.nome}`} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-2 text-xs" title={`${b.nome}: ${b.n} (${Math.round((b.n / total) * 100)}%)`}>
            <span className="truncate font-semibold text-fg">{b.nome}</span>
            <span className="h-3 overflow-hidden rounded-full bg-slate-100">
              <span className={`block h-full rounded-full ${b.antigo ? "bg-slate-400" : "bg-brand"}`} style={{ width: `${Math.max(2, (b.n / maior) * 100)}%` }} />
            </span>
            <span className="num w-16 text-right text-slate-600"><b className="text-fg">{b.n}</b> · {Math.round((b.n / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
