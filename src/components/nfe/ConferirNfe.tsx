// Conferir a NF-e antes de emitir: a nota não vai sozinha para a SEFAZ. Mostra os itens do pedido e deixa mudar a
// descrição, a quantidade e o valor de cada um, o desconto, o frete e o texto da nota; só ao apertar "Emitir" ela é
// enviada. Os ajustes valem só para a nota (o pedido e o financeiro não mudam: se o total ficar diferente, avisa).
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";

type Item = { id: string; descricao: string; quantidade: number; valor_unitario: number; numero_serie?: string | null };
type PedidoNfe = {
  id: string; numero: number; valor_total: number; desconto: number; frete: number; observacoes: string | null;
  cliente?: { nome: string } | null; unidade?: { informacoes_complementares?: string | null } | null; itens: Item[];
};

const num = (v: string) => Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function ConferirNfe({ pedidoId, onClose, onEmitida }: { pedidoId: string; onClose: () => void; onEmitida?: () => void }) {
  const [p, setP] = useState<PedidoNfe | null>(null);
  const [itens, setItens] = useState<{ id: string; descricao: string; quantidade: string; valor: string }[]>([]);
  const [desconto, setDesconto] = useState("0");
  const [frete, setFrete] = useState("0");
  const [info, setInfo] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase.from("pedidos").select("id, numero, valor_total, desconto, frete, observacoes, cliente:clientes(nome), unidade:unidades(informacoes_complementares), " +
      "itens:pedido_itens(id, descricao, quantidade, valor_unitario, numero_serie)").eq("id", pedidoId).single()
      .then(({ data, error }) => {
        if (error) return notifyError(error);
        const d = data as unknown as PedidoNfe;
        setP(d);
        setItens(d.itens.map((i) => ({ id: i.id, descricao: i.descricao, quantidade: String(i.quantidade), valor: String(i.valor_unitario).replace(".", ",") })));
        setDesconto(String(d.desconto ?? 0).replace(".", ","));
        setFrete(String(d.frete ?? 0).replace(".", ","));
        setInfo([`Pedido #${d.numero}`, d.observacoes, d.unidade?.informacoes_complementares].filter(Boolean).join(" - "));
      });
  }, [pedidoId]);

  const total = useMemo(() => r2(itens.reduce((s, i) => s + num(i.quantidade) * num(i.valor), 0) - num(desconto) + num(frete)), [itens, desconto, frete]);
  const mudou = !!p && Math.abs(total - Number(p.valor_total)) > 0.009;
  const set = (k: number, campo: "descricao" | "quantidade" | "valor", v: string) => setItens((l) => l.map((x, j) => (j === k ? { ...x, [campo]: v } : x)));

  async function emitir() {
    if (!p) return;
    if (itens.some((i) => !(num(i.quantidade) > 0) || num(i.valor) < 0 || !i.descricao.trim())) return notify("Confira os itens: descrição, quantidade maior que zero e valor", "erro");
    setEnviando(true);
    try {
      if (!(await confirmarSeTeste())) return;
      const ajustes = {
        itens: itens.map((i) => ({ id: i.id, descricao: i.descricao.trim(), quantidade: num(i.quantidade), valor_unitario: num(i.valor) })),
        desconto: num(desconto), frete: num(frete), informacoes: info,
      };
      await callFunction("nfe-emitir", { pedido_id: p.id, ajustes });
      notify("NF-e enviada para a SEFAZ. Acompanhe em Notas fiscais.");
      onEmitida?.();
      onClose();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }

  return (
    <Modal open onClose={onClose} title={p ? `Conferir a NF-e do pedido #${p.numero}` : "Conferir a NF-e"} wide>
      {!p ? <p className="py-6 text-center text-slate-500">Carregando…</p> : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">A nota só vai para a SEFAZ quando você apertar <b>Emitir NF-e</b>. Confira e ajuste o que precisar
            {p.cliente?.nome ? <> · cliente <b>{p.cliente.nome}</b></> : null}.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="p-2">Descrição na nota</th><th className="w-24 p-2">Qtd.</th><th className="w-32 p-2">Valor unit.</th><th className="w-28 p-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {itens.map((i, k) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="p-2"><input className="input" value={i.descricao} onChange={(e) => set(k, "descricao", e.target.value)} aria-label={`Descrição do item ${k + 1}`} /></td>
                    <td className="p-2"><input className="input text-right" inputMode="decimal" value={i.quantidade} onChange={(e) => set(k, "quantidade", e.target.value)} aria-label={`Quantidade do item ${k + 1}`} /></td>
                    <td className="p-2"><input className="input text-right" inputMode="decimal" value={i.valor} onChange={(e) => set(k, "valor", e.target.value)} aria-label={`Valor do item ${k + 1}`} /></td>
                    <td className="p-2 text-right font-semibold">{brl(num(i.quantidade) * num(i.valor))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Desconto (R$)"><input className="input text-right" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} /></Field>
            <Field label="Frete (R$)"><input className="input text-right" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} /></Field>
            <div className="rounded-xl bg-slate-50 p-3 text-right">
              <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">Total da nota</span>
              <span className="text-xl font-extrabold text-fg">{brl(total)}</span>
            </div>
          </div>
          <Field label="Informações complementares (vão impressas na nota)">
            <textarea className="input min-h-[70px]" value={info} onChange={(e) => setInfo(e.target.value)} />
          </Field>
          {mudou && (
            <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>O total da nota ({brl(total)}) ficou diferente do pedido ({brl(Number(p.valor_total))}). O pedido e as parcelas do financeiro não mudam sozinhos.
                A nota precisa mostrar o valor real da venda: se o preço mudou, ajuste também o pedido.</span>
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={emitir} disabled={enviando}><FileText size={16} /> {enviando ? "Enviando…" : "Emitir NF-e"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
