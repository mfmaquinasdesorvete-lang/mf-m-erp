// Notas fiscais → Emitir NF-e: lista os pedidos aprovados que ainda não têm nota,
// confere o cadastro (mesma conferência do pedido) e manda para a SEFAZ.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Send } from "lucide-react";
import { Button, Modal, Table } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade } from "@/lib/unidade";
import { brl, dataBR, rotuloCliente } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction } from "@/lib/supabase";
import { AVISO_TESTE, confirmarSeTeste } from "@/lib/ambienteNfe";
import { conferirPedido, type Pendencia } from "@/lib/compliance";
import type { Pedido, Produto } from "@/lib/types";

const COM_NOTA = ["autorizada", "processando", "contingencia"];

export function EmitirNfeModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { filtrar, unidades } = useUnidade();
  const invalidar = useInvalidate();
  const { data: pedidosTodos = [], isLoading } = useRows<Pedido>("pedidos", {
    select: "*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id, status, ambiente)", order: "numero", ascending: false,
  });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: ufsIcms = [] } = useRows<{ uf: string }>("icms_uf", { order: "uf", ascending: true });
  const [conferindo, setConferindo] = useState<{ pedido: Pedido; pendencias: Pendencia[] } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const { data: ambiente } = useQuery({
    queryKey: ["nfe-ambiente"], staleTime: 60_000,
    queryFn: async () => (await callFunction<{ ambiente: string }>("nfe-consultar", { acao: "ambiente" })).ambiente,
  });

  const pendentes = filtrar(pedidosTodos).filter((p) => p.status === "aprovado" && !(p.notas ?? []).some((n) => n.ambiente !== "homologacao" && COM_NOTA.includes(n.status)));

  async function emitir(p: Pedido, conferido = false) {
    if (!conferido) {
      const lista = conferirPedido({
        cliente: p.cliente, unidade: unidades.find((u) => u.id === p.unidade_id), produtos,
        itens: (p.itens ?? []) as any, aliquotasUf: ufsIcms.map((u) => u.uf),
      });
      if (lista.length) return setConferindo({ pedido: p, pendencias: lista });
    }
    setConferindo(null);
    if (!(await confirmarSeTeste())) return;
    setOcupado(p.id);
    try {
      const r = await callFunction<{ nota?: { status: string; numero?: string | null } }>("nfe-emitir", { pedido_id: p.id });
      notify(r.nota?.status === "autorizada" ? `NF-e ${r.nota.numero ?? ""} autorizada` : "NF-e enviada para a SEFAZ. Acompanhe na lista.");
      invalidar("notas_fiscais", "pedidos");
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(null);
    }
  }

  if (conferindo) {
    const { pedido, pendencias } = conferindo;
    const erros = pendencias.some((x) => x.nivel === "erro");
    return (
      <Modal open onClose={() => setConferindo(null)} title={`Conferência fiscal · pedido #${pedido.numero}`}>
        <ul className="space-y-1.5 text-sm">
          {pendencias.map((x, i) => (
            <li key={i} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.nivel === "erro" ? "bg-red-500" : "bg-amber-500"}`} />{x.texto}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          {erros ? "Corrija os itens em vermelho (no cadastro do cliente, do produto ou da unidade) e tente de novo: a SEFAZ rejeitaria a nota." : "São só alertas. Confira e, se estiver certo, emita assim mesmo."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setConferindo(null)}>Voltar</Button>
          {!erros && <Button type="button" onClick={() => emitir(pedido, true)}>Emitir mesmo assim</Button>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Emitir NF-e" wide>
      {ambiente && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm font-semibold ${ambiente === "producao" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {ambiente === "producao" ? "Ambiente de PRODUÇÃO: a nota é real, tem valor fiscal e vai para o cliente." : AVISO_TESTE}
        </p>
      )}
      <p className="mb-3 text-sm text-slate-600">
        A NF-e de venda sai de um pedido aprovado (ele já tem cliente, itens, frete e pagamento). Estes são os pedidos aprovados que ainda não têm nota:
      </p>
      {!isLoading && !pendentes.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
          Nenhum pedido aprovado esperando nota.
          <div className="mt-3"><Button onClick={() => { onClose(); navigate("/pedidos"); }}>Criar pedido em Vendas e orçamentos</Button></div>
        </div>
      ) : (
        <Table head={<><th className="th">Pedido</th><th className="th">Data</th><th className="th">Cliente</th><th className="th text-right">Valor</th><th className="th" /></>}>
          {pendentes.map((p) => (
            <tr key={p.id}>
              <td className="td font-semibold">#{p.numero} <EtiquetaUnidade id={p.unidade_id} /></td>
              <td className="td">{dataBR(p.created_at)}</td>
              <td className="td">{p.cliente ? rotuloCliente(p.cliente) : "—"}</td>
              <td className="td num text-right">{brl(p.valor_total)}</td>
              <td className="td text-right">
                <Button onClick={() => emitir(p)} disabled={!!ocupado}><Send size={15} /> {ocupado === p.id ? "Enviando…" : "Emitir"}</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">Nota de transferência entre a matriz e a filial sai em Transferências SC ↔ SP.</p>
    </Modal>
  );
}
