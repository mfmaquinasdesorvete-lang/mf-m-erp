// Ícones de evolução ao lado de cada NF (e-mail, contas, estoque, etiqueta, despacho, entrega; nas de
// fornecedor: ciência, XML, fornecedor, estoque, conta a pagar), a legenda e a linha do tempo dentro da nota.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, CircleDollarSign, Eye, FileCode2, FilePen, History, Info, Mail, Package, PackageCheck, Receipt, Tag, Truck, Undo2,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { EstadoEtapa, Etapa, EtapaId, Evolucao, EvolucaoEmitida, EvolucaoRecebida } from "@/lib/evolucaoNota";

export const ICONE_ETAPA: Record<EtapaId, LucideIcon> = {
  email: Mail, contas: CircleDollarSign, estoque: Package, etiqueta: Tag, expedicao: Truck, entrega: PackageCheck,
  manifestacao: Eye, xml: FileCode2, fornecedor: Building2, produtos: Package, pagar: Receipt,
};
const ICONE_EXTRA = { cce: FilePen, devolucao: Undo2 };

const COR: Record<EstadoEtapa, string> = {
  ok: "bg-emerald-100 text-emerald-700 border-emerald-200",
  andamento: "bg-sky-100 text-sky-700 border-sky-200",
  pendente: "border-dashed border-slate-300 text-slate-400",
  problema: "bg-red-100 text-red-700 border-red-200",
};
export const NOME_ESTADO: Record<EstadoEtapa, string> = { ok: "feito", andamento: "em andamento", pendente: "falta", problema: "atenção" };

async function rpc<T>(nome: string) {
  const { data, error } = await supabase.rpc(nome);
  if (error) throw error;
  return new Map(((data ?? []) as (T & { nota_id: string })[]).map((r) => [r.nota_id, r]));
}

/** O que aconteceu com cada NF emitida (uma consulta para a lista toda). */
export function useEvolucaoEmitidas() {
  return useQuery({ queryKey: ["notas_fiscais", "evolucao"], queryFn: () => rpc<EvolucaoEmitida>("evolucao_notas"), staleTime: 30_000 });
}
export function useEvolucaoRecebidas() {
  return useQuery({ queryKey: ["nfe_recebidas", "evolucao"], queryFn: () => rpc<EvolucaoRecebida>("evolucao_recebidas"), staleTime: 30_000 });
}

/** Trilha de ícones da lista. */
export function TrilhaEvolucao({ e }: { e: Evolucao }) {
  if (e.historico) {
    return <span className="inline-flex items-center gap-1 text-xs text-slate-400" title="Nota do sistema anterior: as etapas ficaram lá"><History size={14} /> histórico</span>;
  }
  if (!e.etapas.length) return null;
  const feitas = e.etapas.filter((x) => x.estado === "ok").length;
  return (
    <div className="flex min-w-max items-center gap-[3px]" aria-label={`Evolução: ${feitas} de ${e.etapas.length} etapas feitas`}>
      {e.etapas.map((x) => {
        const I = ICONE_ETAPA[x.id];
        return (
          <span key={x.id} title={`${x.rotulo}: ${x.detalhe}`} aria-label={`${x.rotulo}: ${x.detalhe}`}
            className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border ${COR[x.estado]}`}>
            <I size={12} aria-hidden />
          </span>
        );
      })}
      {e.extras.map((x) => {
        const I = ICONE_EXTRA[x.id];
        return <span key={x.id} title={x.rotulo} aria-label={x.rotulo} className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-purple-100 text-purple-700"><I size={12} aria-hidden /></span>;
      })}
    </div>
  );
}

/** Legenda dos ícones (abre e fecha). */
export function LegendaEvolucao({ tipo }: { tipo: "emitidas" | "recebidas" }) {
  const [aberta, setAberta] = useState(false);
  const itens: [EtapaId, string][] = tipo === "emitidas"
    ? [["email", "DANFE por e-mail ao cliente"], ["contas", "Contas a receber"], ["estoque", "Estoque baixado"], ["etiqueta", "Etiqueta impressa"], ["expedicao", "Despacho"], ["entrega", "Entrega"]]
    : [["manifestacao", "Ciência na SEFAZ"], ["xml", "XML completo"], ["fornecedor", "Fornecedor cadastrado"], ["produtos", "Entrada no estoque"], ["pagar", "Contas a pagar"]];
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setAberta(!aberta)} className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-fg">
        <Info size={14} /> O que os ícones querem dizer
      </button>
      {aberta && (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-slate-200 p-2.5">
          {itens.map(([id, t]) => { const I = ICONE_ETAPA[id]; return <span key={id} className="inline-flex items-center gap-1.5"><I size={14} /> {t}</span>; })}
          {tipo === "emitidas" && <span className="inline-flex items-center gap-1.5"><FilePen size={14} /> carta de correção</span>}
          {tipo === "emitidas" && <span className="inline-flex items-center gap-1.5"><Undo2 size={14} /> tem devolução</span>}
          <span className="basis-full" />
          {(["ok", "andamento", "pendente", "problema"] as EstadoEtapa[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={`h-4 w-4 rounded-full border ${COR[s]}`} /> {NOME_ESTADO[s]}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Linha do tempo dentro da nota. */
export function LinhaDoTempo({ e }: { e: Evolucao }) {
  if (e.historico) return <p className="text-sm text-slate-500"><History size={14} className="mr-1 inline" />Nota do sistema anterior: as etapas (contas, estoque, envio) ficaram registradas lá.</p>;
  if (!e.etapas.length) return null;
  return (
    <ol className="space-y-0">
      {e.etapas.map((x: Etapa, i) => {
        const I = ICONE_ETAPA[x.id];
        return (
          <li key={x.id} className="relative flex gap-3 pb-3 last:pb-0">
            {i < e.etapas.length - 1 && <span className="absolute left-3 top-6 h-[calc(100%-1.5rem)] w-px bg-slate-200" aria-hidden />}
            <span className={`relative z-[1] grid h-6 w-6 shrink-0 place-items-center rounded-full border ${COR[x.estado]}`}><I size={13} aria-hidden /></span>
            <div className="min-w-0 text-sm">
              <span className="font-semibold text-fg">{x.rotulo}</span>
              <span className={`ml-2 text-xs font-semibold ${x.estado === "ok" ? "text-emerald-700" : x.estado === "problema" ? "text-red-700" : x.estado === "andamento" ? "text-sky-700" : "text-slate-500"}`}>{NOME_ESTADO[x.estado]}</span>
              <div className="text-xs text-slate-500">{x.detalhe}</div>
            </div>
          </li>
        );
      })}
      {e.extras.map((x) => { const I = ICONE_EXTRA[x.id]; return <li key={x.id} className="flex items-center gap-3 pt-1 text-xs text-purple-700"><I size={14} /> {x.rotulo}</li>; })}
    </ol>
  );
}
