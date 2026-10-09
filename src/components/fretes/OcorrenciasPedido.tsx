// Ocorrências dos envios do pedido, na janela do pedido: atraso, avaria, reentrega, recusa ou divergência de
// cobrança ficam registrados no ERP (e não só no WhatsApp). "Registrar ocorrência" abre o envio já no formulário.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { EnvioForm } from "@/components/fretes/EnvioForm";
import { useInvalidate } from "@/lib/data";
import { dataBR } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { TIPOS_OCORRENCIA, type Envio, type OcorrenciaEnvio } from "@/lib/fretes";

export function OcorrenciasPedido({ pedidoId, statusPedido }: { pedidoId: string; statusPedido: string }) {
  const { pode } = usePerfil();
  const podeEditar = pode("cotar_frete") || pode("editar_financeiro");
  const invalidar = useInvalidate();
  const [aberto, setAberto] = useState<{ id: string; nova: boolean } | null>(null);
  const { data: envios = [], refetch } = useQuery({
    queryKey: ["envios", "pedido", pedidoId],
    queryFn: async () => ((await supabase.from("envios").select("*").eq("pedido_id", pedidoId).order("created_at", { ascending: true })).data ?? []) as Envio[],
  });
  const ids = envios.map((e) => e.id);
  const { data: ocorrencias = [], refetch: recarregar } = useQuery({
    queryKey: ["envio_ocorrencias", "pedido", pedidoId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => ((await supabase.from("envio_ocorrencias").select("*").in("envio_id", ids).order("created_at", { ascending: false })).data ?? []) as OcorrenciaEnvio[],
  });
  const ativo = envios.find((e) => e.status !== "cancelado") ?? envios[envios.length - 1];
  const abertas = ocorrencias.filter((o) => o.status === "aberta").length;
  const numero = (id: string) => envios.find((e) => e.id === id)?.numero;
  const vendido = ["aprovado", "faturado", "entregue"].includes(statusPedido);
  if (!envios.length && !vendido) return null;

  async function registrar() {
    let id = ativo?.id;
    if (!id) {
      // pedido ainda sem envio: cria com os dados do pedido para a ocorrência ter onde ficar
      const { data, error } = await supabase.rpc("criar_envio_pedido", { p_pedido: pedidoId });
      if (error) return notifyError(error);
      id = data as string;
      refetch();
    }
    setAberto({ id, nova: true });
  }

  return (
    <section className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AlertTriangle size={16} className="text-amber-700" />
        <h3 className="font-bold text-fg">Ocorrências do transporte</h3>
        {abertas > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{abertas} aberta(s)</span>}
        {podeEditar && <Button type="button" variant="secondary" className="ml-auto" onClick={registrar}><Plus size={15} /> Registrar ocorrência</Button>}
      </div>
      {ocorrencias.length ? (
        <ul className="space-y-1.5">
          {ocorrencias.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => setAberto({ id: o.envio_id, nova: false })}
                className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left hover:shadow-pop ${o.status === "aberta" ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <b className="text-fg">{TIPOS_OCORRENCIA.find(([k]) => k === o.tipo)?.[1] ?? o.tipo}</b>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.status === "aberta" ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{o.status}</span>
                    <span className="text-xs text-slate-500">envio #{numero(o.envio_id)} · {dataBR(o.created_at)} · {o.responsavel ? `responsável: ${o.responsavel}` : "sem responsável"}</span>
                  </span>
                  <span className="block text-slate-700">{o.descricao}</span>
                  {o.status === "resolvida" && o.resolucao && <span className="block text-xs text-emerald-800">Resolução: {o.resolucao}</span>}
                  {o.status === "aberta" && o.andamento && <span className="block text-xs text-slate-600">Andamento: {o.andamento}</span>}
                </span>
                <ChevronRight size={16} className="mt-1 shrink-0 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500">{envios.length ? "Nenhuma ocorrência nos envios deste pedido." : "O pedido ainda não tem envio: ao registrar a ocorrência, o envio é criado com os dados do pedido."}</p>
      )}
      {aberto && (
        <EnvioForm envioId={aberto.id} novaOcorrencia={aberto.nova}
          onClose={() => { setAberto(null); refetch(); recarregar(); invalidar("envio_ocorrencias", "envios"); }} />
      )}
    </section>
  );
}
