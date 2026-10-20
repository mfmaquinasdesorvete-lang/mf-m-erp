// Emitir NF-e em lote: das vendas marcadas, separa as prontas (sem exceção) das que precisam de alguém olhar e,
// com um toque, manda as prontas para a SEFAZ uma por uma, mostrando o resultado e o que fazer em cada recusa.
// As com exceção ficam de fora: abra a venda e use "Conferir a NF-e".
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { notifyError } from "@/lib/notify";
import { brl } from "@/lib/format";
import { guiaRejeicao, pendenciasFaturar, type PedidoFat } from "@/lib/faturamento";

type PedidoLote = PedidoFat & { valor_total: number; cliente?: (PedidoFat["cliente"] & { nome_fantasia?: string | null }) | null };
type Resultado = { ok: boolean; texto: string };

export function EmitirLote({ pedidos, onClose }: { pedidos: PedidoLote[]; onClose: (emitiu: boolean) => void }) {
  const [ncm, setNcm] = useState<Map<string, string | null> | null>(null);
  const [res, setRes] = useState<Map<string, Resultado>>(new Map());
  const [rodando, setRodando] = useState(false);
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    const ids = [...new Set(pedidos.flatMap((p) => (p.itens ?? []).map((i) => i.produto_id)).filter(Boolean))];
    if (!ids.length) { setNcm(new Map()); return; }
    supabase.from("produtos").select("id, ncm").in("id", ids)
      .then(({ data, error }) => { if (error) notifyError(error); setNcm(new Map((data ?? []).map((p: any) => [p.id, p.ncm]))); });
  }, [pedidos]);

  const analise = useMemo(() => !ncm ? null : pedidos.map((p) => ({ p, falta: pendenciasFaturar(p, (id) => ncm.get(id)) })), [pedidos, ncm]);
  const prontos = analise?.filter((a) => !a.falta.length).map((a) => a.p) ?? [];
  const excecoes = analise?.filter((a) => a.falta.length) ?? [];
  const nome = (p: PedidoLote) => p.cliente?.nome_fantasia || p.cliente?.nome || "";

  async function emitir() {
    if (!(await confirmarSeTeste())) return;
    setRodando(true);
    for (const p of prontos) {
      try {
        const r = await callFunction<{ nota?: { status: string; numero?: string | null; mensagem?: string | null } }>("nfe-emitir", { pedido_id: p.id });
        const st = r.nota?.status;
        const linha: Resultado = st === "erro"
          ? { ok: false, texto: guiaRejeicao(r.nota?.mensagem)?.titulo ?? r.nota?.mensagem ?? "recusada" }
          : { ok: true, texto: st === "autorizada" ? `NF-e ${r.nota?.numero ?? ""} autorizada` : "enviada, aguardando a SEFAZ" };
        setRes((m) => new Map(m).set(p.id, linha));
      } catch (e) {
        setRes((m) => new Map(m).set(p.id, { ok: false, texto: (e as Error).message }));
      }
    }
    setRodando(false); setFeito(true);
  }

  const certas = [...res.values()].filter((r) => r.ok).length;
  return (
    <Modal open onClose={() => !rodando && onClose(feito)} title="Emitir NF-e em lote" wide>
      {!analise ? <p className="py-6 text-center text-slate-500">Conferindo as vendas…</p> : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Só vão as vendas <b>sem exceção</b>: aprovadas, sem nota, com o cadastro do cliente completo e NCM em todos os produtos.
            Cada nota sai com os valores do pedido. Para ajustar valores, abra a venda e use <b>Conferir a NF-e</b>.</p>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} /> Prontas para emitir ({prontos.length})</h3>
            {prontos.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {prontos.map((p) => {
                  const r = res.get(p.id);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                      <span className="min-w-0"><b>#{p.numero}</b> · {nome(p)} · {brl(p.valor_total)}</span>
                      {r ? <span className={`text-xs font-semibold ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.ok ? "✓" : "✗"} {r.texto}</span>
                        : rodando ? <Loader2 size={15} className="animate-spin text-slate-400" aria-label="Enviando" /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-slate-500">Nenhuma venda marcada está pronta.</p>}
          </section>

          {excecoes.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-700"><XCircle size={16} /> Ficam de fora ({excecoes.length})</h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-amber-200 bg-amber-50/50">
                {excecoes.map(({ p, falta }) => (
                  <li key={p.id} className="p-2 text-sm"><b>#{p.numero}</b> · {nome(p)} — <span className="text-amber-800">{falta.join("; ")}</span></li>
                ))}
              </ul>
            </section>
          )}

          {feito && <p className="rounded-lg bg-slate-50 p-3 text-sm"><b>{certas}</b> de {prontos.length} {prontos.length === 1 ? "nota foi" : "notas foram"} para a SEFAZ.
            {certas < prontos.length && " As recusadas estão em Notas fiscais, com o passo a passo para corrigir."}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={rodando} onClick={() => onClose(feito)}>{feito ? "Fechar" : "Cancelar"}</Button>
            {!feito && <Button disabled={rodando || !prontos.length} onClick={emitir}>
              <FileText size={16} /> {rodando ? "Emitindo…" : `Emitir ${prontos.length} ${prontos.length === 1 ? "nota" : "notas"}`}
            </Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
