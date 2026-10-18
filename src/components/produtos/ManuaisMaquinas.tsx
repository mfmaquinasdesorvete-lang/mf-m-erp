// Máquinas → Manuais: os documentos de todas as máquinas num lugar só (manual da máquina, manual elétrico /
// esquema, dicas de manutenção), com o que falta em cada uma. Anexar, tirar e arrastar para ordenar ficam aqui;
// o cliente recebe estes documentos pelo link da máquina dele.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, ListTree, Search } from "lucide-react";
import { Card } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { pl } from "@/lib/format";
import { urlFotoProduto } from "@/lib/catalogo";
import { NOME_MIDIA, type TipoMidia } from "@/lib/midia";
import type { Produto } from "@/lib/types";
import { DocumentosMaquina, TIPOS_DOC } from "./GaleriaProduto";

/** Os três documentos que toda máquina deveria ter. */
const ESSENCIAIS: TipoMidia[] = ["manual", "eletrico", "dicas"];

export function ManuaisMaquinas({ produtos, podeEditar, aoFicha }: { produtos: Produto[]; podeEditar: boolean; aoFicha: (id: string) => void }) {
  const maquinas = useMemo(() => produtos.filter((p) => p.tipo === "maquina" && p.ativo !== false && !p.unificado_em), [produtos]);
  const { data: docs = [] } = useQuery({
    queryKey: ["produtos_midia", "maquinas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos_midia").select("produto_id, tipo").eq("ativo", true).in("tipo", TIPOS_DOC);
      if (error) throw error;
      return (data ?? []) as { produto_id: string; tipo: TipoMidia }[];
    },
  });
  const [busca, setBusca] = useState("");
  const [soFaltando, setSoFaltando] = useState(false);
  const tem = (id: string, t: TipoMidia) => docs.some((d) => d.produto_id === id && d.tipo === t);
  const faltam = (id: string) => ESSENCIAIS.filter((t) => !tem(id, t));
  const completas = maquinas.filter((m) => !faltam(m.id).length).length;
  const vistas = maquinas.filter((m) => (!soFaltando || faltam(m.id).length)
    && (!busca.trim() || `${m.descricao} ${m.modelo ?? ""} ${m.sku ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase())));

  if (!maquinas.length) return <p className="py-8 text-center text-slate-500">Nenhuma máquina ativa no cadastro.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto min-w-0 text-sm text-slate-600">
          <b className="text-fg">{completas} de {maquinas.length}</b> {pl(maquinas.length, "máquina tem", "máquinas têm")} os 3 documentos (manual, elétrico e dicas).
          {podeEditar && " Arraste pela alça para mudar a ordem: o cliente vê nesta ordem."}
        </p>
        <label className="relative min-w-0 basis-56">
          <span className="sr-only">Procurar máquina</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input py-1.5 pl-8 text-sm" placeholder="Procurar máquina…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={soFaltando} onChange={(e) => setSoFaltando(e.target.checked)} /> Só as que faltam documentos</label>
      </div>
      {!vistas.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Todas as máquinas desta busca já têm os 3 documentos.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {vistas.map((m) => {
          const falta = faltam(m.id);
          return (
            <Card key={m.id} className={`space-y-3 p-3 sm:p-4 ${falta.length ? "border-l-4 border-l-amber-400" : "border-l-4 border-l-emerald-500"}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                  {m.foto_caminho ? <img src={urlFotoProduto(m.foto_caminho)} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                    : <span className="text-2xs text-slate-400">sem foto</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 font-bold leading-snug text-fg" title={m.descricao}>{m.modelo?.trim() || m.descricao}</h3>
                  <ul className="mt-1 flex flex-wrap gap-1 text-2xs" aria-label="Documentos essenciais">
                    {ESSENCIAIS.map((t) => (
                      <li key={t} className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${tem(m.id, t) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {tem(m.id, t) ? <CheckCircle2 size={11} aria-hidden /> : <CircleDashed size={11} aria-hidden />}
                        {NOME_MIDIA[t]}<span className="sr-only">{tem(m.id, t) ? ": tem" : ": falta"}</span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => aoFicha(m.id)} className="-ml-2 mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-light">
                    <ListTree size={14} aria-hidden /> Ver a ficha técnica
                  </button>
                </div>
              </div>
              <DocumentosMaquina produtoId={m.id} podeEditar={podeEditar} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
