// Ordem de compra → contas a pagar: depois de combinar com o fornecedor (forma e parcelas) e mandar a OC, o financeiro
// ou o Compras lança as contas daqui, sem esperar a mercadoria. As contas ficam ligadas à OC; o recebimento e a nota do
// fornecedor usam essas contas em vez de lançar de novo. Se a OC mudar depois, avisa (não mexe nas contas sozinho).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Receipt } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { divergenciaContasOc, podeLancarOc, type ContaOc } from "@/lib/contasOc";
import type { PedidoCompra } from "@/lib/types";

/** As contas (não canceladas) lançadas pela OC; as antigas, do recebimento, entram pelo documento "PC <nº>". */
export function useContasDaOc(pedidoId: string | null | undefined) {
  return useQuery({
    queryKey: ["contas_pagar", "oc", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contas_da_oc", { p_pedido: pedidoId });
      if (error) throw error;
      return ((data ?? []) as (ContaOc & { descricao: string })[]).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    },
  });
}

/** Contas que a nota ligada à OC lançou por conta própria (sem passar pela OC): ficariam em dobro com as da OC. */
function useContasDaNota(pedidoId: string | null | undefined, ativo: boolean) {
  return useQuery({
    queryKey: ["contas_pagar", "oc-nota", pedidoId],
    enabled: !!pedidoId && ativo,
    queryFn: async () => {
      const { data: ligadas, error } = await supabase.from("nfe_oc_vinculos").select("nfe_id").eq("pedido_compra_id", pedidoId!).eq("ativo", true);
      if (error) throw error;
      const notas = (ligadas ?? []).map((l) => l.nfe_id);
      if (!notas.length) return 0;
      const { data, error: e2 } = await supabase.from("contas_pagar").select("id").in("nfe_recebida_id", notas).is("pedido_compra_id", null).neq("status", "cancelado");
      if (e2) throw e2;
      return (data ?? []).length;
    },
  });
}

/** Lança as contas de uma OC (a mesma função do botão e da ação em lote). */
export async function lancarContasOc(pedidoId: string) {
  const { data, error } = await supabase.rpc("lancar_oc_contas_pagar", { p_pedido: pedidoId });
  if (error) throw error;
  return Number(data ?? 0);
}

export function ContasDaOc({ p }: { p: Partial<PedidoCompra> }) {
  const { tem } = usePerfil();
  const invalidate = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  const { data: contas = [], error } = useContasDaOc(p.id);
  const { data: daNota = 0 } = useContasDaNota(p.id, contas.length > 0);
  const podeLancar = tem("financeiro", "compras") && podeLancarOc(p, contas.length > 0);
  const aviso = divergenciaContasOc(contas.filter((c) => c.status !== "pago"), p.parcelas, Number(p.valor_total || 0) - contas.filter((c) => c.status === "pago").reduce((s, c) => s + Number(c.valor || 0), 0));

  async function lancar() {
    const n = p.parcelas?.length || 1;
    if (!(await confirmar(`Vai criar ${n} ${pl(n, "conta", "contas")} de ${brl(p.valor_total)} no total${p.parcelas?.length ? `, uma por parcela (${p.parcelas.map((x) => dataBR(x.vencimento)).join(", ")})` : ", com vencimento em 30 dias"}, ligadas a esta OC. Quando a mercadoria ou a nota chegar, o ERP usa estas contas e não lança de novo.`,
      { titulo: `Lançar a OC #${p.numero} no contas a pagar?`, ok: "Lançar" }))) return;
    setOcupado(true);
    try {
      const qtd = await lancarContasOc(p.id!);
      notify(`${qtd} ${pl(qtd, "conta lançada", "contas lançadas")} no contas a pagar`);
      invalidate("contas_pagar", "contas_pagar_origem", "pedidos_compra");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  if (!p.id || (!contas.length && !podeLancar)) return null;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg"><Receipt size={16} className="text-sky-600" aria-hidden /> Contas a pagar desta OC</div>
        {podeLancar && <Button type="button" disabled={ocupado} onClick={lancar}><Receipt size={16} /> Lançar no contas a pagar</Button>}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">Não deu para ler as contas: {(error as Error).message}</p>}
      {!contas.length && podeLancar && (
        <p className="mt-1 text-sm text-slate-500">Combinou a forma e as parcelas com o fornecedor? Lance agora: cada parcela vira uma conta, ligada a esta OC.</p>
      )}
      {contas.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {contas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <span className="min-w-0 flex-1 truncate">{c.descricao}</span>
              <span className="num text-slate-600">vence {dataBR(c.vencimento)}</span>
              <span className="num font-semibold">{brl(c.valor)}</span>
              <Badge value={c.status} />
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {aviso}</p>}
      {daNota > 0 && (
        <p className="mt-2 flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          A nota do fornecedor ligada a esta OC também lançou {daNota} {pl(daNota, "conta", "contas")}: estão em dobro com as da OC. Cancele as que sobrarem no contas a pagar.</p>
      )}
    </div>
  );
}
