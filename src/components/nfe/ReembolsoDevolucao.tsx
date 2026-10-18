// Devolução de venda → reembolso ao cliente (origem DV nas contas a pagar): a NF-e de entrada de devolução emitida
// pela MF ou a NF-e de devolução que o cliente emitiu viram a conta a pagar "Devolução de venda – NF nº – cliente",
// que passa pela aprovação. Se o cliente ainda não pagou a venda, o caminho é abater a conta a receber, não devolver.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Receipt, Undo2 } from "lucide-react";
import { Button, Field } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useInvalidate } from "@/lib/data";

type Props = {
  tipo: "emitida" | "recebida"; id: string; numero: string | null; valor: number; contaId: string | null;
  cliente?: string | null; podeFin: boolean;
};

const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

export function ReembolsoDevolucao({ tipo, id, numero, valor, contaId, cliente, podeFin }: Props) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [aberto, setAberto] = useState(false);
  const [valorTxt, setValorTxt] = useState(String(valor ?? ""));
  const [venc, setVenc] = useState(hoje());
  const [pix, setPix] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const { data: conta } = useQuery({
    queryKey: ["contas_pagar", "devolucao", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_pagar").select("id, status, valor, vencimento, revisao").eq("id", contaId!).maybeSingle();
      if (error) throw error;
      return data as { id: string; status: string; valor: number; vencimento: string; revisao: string } | null;
    },
  });
  const ativa = conta && conta.status !== "cancelado";

  async function lancar() {
    const v = Number(valorTxt.replace(/\./g, "").replace(",", "."));
    if (!(v > 0) || v > Number(valor)) return notifyError(new Error(`Valor entre R$ 0,01 e ${brl(valor)} (o total da nota de devolução).`));
    if (!(await confirmar(`Lançar a conta a pagar de ${brl(v)} para devolver o dinheiro${cliente ? ` a ${cliente}` : " ao cliente"}? Ela passa pela aprovação antes de pagar.`, { ok: "Lançar reembolso" }))) return;
    setOcupado(true);
    const { error } = await supabase.rpc("lancar_conta_devolucao", {
      p_nota: tipo === "emitida" ? id : null, p_recebida: tipo === "recebida" ? id : null, p_valor: v, p_vencimento: venc, p_chave_pix: pix.trim() || null,
    });
    setOcupado(false);
    if (error) return notifyError(error);
    notify("Reembolso lançado em Contas a pagar (falta aprovar)");
    setAberto(false);
    invalidate("contas_pagar", "contas_pagar_origem", "notas_fiscais", "nfe_recebidas");
  }

  return (
    <section className="rounded-lg border border-purple-200 bg-purple-50/60 p-3 text-sm" aria-label="Reembolso da devolução">
      <div className="flex flex-wrap items-center gap-2">
        <Undo2 size={16} className="text-purple-700" aria-hidden />
        <b className="text-fg">Devolução de venda: dinheiro do cliente</b>
        {ativa && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-2xs font-semibold text-purple-800">
          {conta.status === "pago" ? "reembolso pago" : conta.revisao === "aprovado" ? "reembolso aprovado" : "reembolso falta aprovar"} · {brl(conta.valor)} · vence {dataBR(conta.vencimento)}
        </span>}
      </div>
      {ativa ? (
        <div className="mt-2">
          <Button type="button" variant="ghost" onClick={() => navigate("/financeiro?aba=pagar", { state: { aba: "pagar", destaque: { ids: [conta.id], titulo: `Reembolso da devolução NF ${numero ?? ""}`, origem: "Nota fiscal" } } })}>
            <Receipt size={14} /> Ver a conta a pagar
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-600">
            Se o cliente já pagou a venda, lance o reembolso (conta a pagar com origem DV). Se ainda não pagou, não devolva: cancele ou abata a conta a receber da venda em Financeiro → Contas a receber.
          </p>
          {podeFin && !aberto && <div className="mt-2"><Button type="button" variant="secondary" onClick={() => setAberto(true)}>Lançar reembolso ao cliente</Button></div>}
          {podeFin && aberto && (
            <form className="mt-2 grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); lancar(); }}>
              <Field label={`Valor (até ${brl(valor)})`}><input className="input" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} /></Field>
              <Field label="Pagar até"><input className="input" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></Field>
              <Field label="Chave Pix do cliente (opcional)"><input className="input" value={pix} onChange={(e) => setPix(e.target.value)} placeholder="CPF, CNPJ, e-mail, celular…" /></Field>
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                <Button type="submit" disabled={ocupado}>{ocupado ? "Lançando…" : "Lançar reembolso"}</Button>
                <Button type="button" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
