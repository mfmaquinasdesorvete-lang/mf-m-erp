// "Devolver produtos" do pedido: com NF-e autorizada abre a NF de devolução (estoque volta ao autorizar);
// sem NF do ERP escolhe itens e quantidades (parcial), o estoque volta na hora e fica registrado no pedido.
import { useState } from "react";
import { AlertTriangle, Undo2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { DevolucaoModal } from "@/components/nfe/DevolucaoModal";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import type { Item } from "@/lib/types";
import { caminhoDevolucao, qtdDigitada, saldoDevolucao, type DevolucaoPedido, type NotaDoPedido } from "@/lib/devolucaoPedido";

type PedidoDev = { id: string; numero: number; itens: Item[]; notas?: NotaDoPedido[] | null };

export function DevolverProdutos({ pedido, onClose }: { pedido: PedidoDev; onClose: () => void }) {
  const caminho = caminhoDevolucao(pedido.notas ?? []);
  if (caminho.tipo === "nf") return <DevolucaoModal origem={{ tipo: "emitida", id: caminho.nota.id }} onClose={onClose} />;
  return <DevolucaoSemNf pedido={pedido} aguardar={caminho.tipo === "aguardar"} onClose={onClose} />;
}

function DevolucaoSemNf({ pedido, aguardar, onClose }: { pedido: PedidoDev; aguardar: boolean; onClose: () => void }) {
  const { data: anteriores = [] } = useRows<DevolucaoPedido>("pedido_devolucoes", {
    key: [pedido.id], filtro: (q) => q.eq("pedido_id", pedido.id),
  });
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();
  const saldo = saldoDevolucao(pedido.itens, anteriores);
  const itens = pedido.itens.filter((i) => i.id);
  const escolhidos = itens.filter((i) => qtdDigitada(qtd[i.id!]) > 0);
  const invalido = escolhidos.some((i) => qtdDigitada(qtd[i.id!]) > (saldo.get(i.id!)?.disponivel ?? 0) + 1e-9);
  const total = escolhidos.reduce((s, i) => s + qtdDigitada(qtd[i.id!]) * i.valor_unitario, 0);

  async function devolver() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("devolver_itens_pedido", {
        p_pedido: pedido.id, p_motivo: motivo,
        p_itens: escolhidos.map((i) => ({ item_id: i.id, quantidade: qtdDigitada(qtd[i.id!]) })),
      });
      if (error) throw error;
      notify(`Devolução registrada no pedido #${pedido.numero}: estoque de volta`);
      invalidate("pedido_devolucoes", "pedido_ocorrencias", "produtos", "estoque_movimentos", "pedidos");
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Devolver produtos · pedido #${pedido.numero}`} wide>
      {aguardar ? (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> A NF-e deste pedido ainda está na SEFAZ. Quando for autorizada, a devolução sai pela NF de devolução.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            Este pedido não tem NF-e do ERP: escolha o que voltou. O estoque volta na hora e a devolução fica nas ocorrências do pedido.
            Se precisar de nota, emita uma NF de entrada em Notas fiscais.
          </p>

          {anteriores.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Já devolvido</div>
              <ul className="space-y-1">
                {anteriores.map((d) => (
                  <li key={d.id} className="text-slate-700">{dataBR(d.created_at)} · {brl(d.valor)} · {d.motivo}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Vendido</th><th className="px-3 py-2 text-right">Devolver</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((i) => {
                  const s = saldo.get(i.id!)!;
                  const q = qtdDigitada(qtd[i.id!]);
                  return (
                    <tr key={i.id}>
                      <td className="px-3 py-2"><div className="font-medium text-fg">{i.descricao}</div><div className="text-xs text-slate-500">{brl(i.valor_unitario)} cada</div></td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600">{s.vendido}{s.devolvido > 0 && <div className="text-amber-700">já voltou {s.devolvido}</div>}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input className={`input w-20 py-1 text-right ${q > s.disponivel + 1e-9 ? "border-red-400" : ""}`} inputMode="decimal" disabled={!s.disponivel}
                            value={qtd[i.id!] ?? ""} placeholder="0" onChange={(e) => setQtd({ ...qtd, [i.id!]: e.target.value })} aria-label={`Quantidade a devolver de ${i.descricao}`} />
                          <button type="button" className="link-acao text-xs disabled:opacity-40" disabled={!s.disponivel} onClick={() => setQtd({ ...qtd, [i.id!]: String(s.disponivel) })}>tudo</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Field label="Motivo da devolução">
            <textarea className="input min-h-16" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente devolveu 1 copo, veio trincado" />
          </Field>
          <p className="text-xs text-slate-500">Devolver o dinheiro ou dar crédito ao cliente: lance em Contas a pagar (ou ajuste a parcela em Contas a receber).</p>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-3">
            <span className="text-sm text-slate-600">{escolhidos.length} {pl(escolhidos.length, "item", "itens")} · {brl(total)}</span>
            <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
            <Button type="button" tom="desfazer" onClick={devolver} disabled={ocupado || !escolhidos.length || invalido || motivo.trim().length < 5}>
              <Undo2 size={16} /> {ocupado ? "Gravando…" : "Devolver ao estoque"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
