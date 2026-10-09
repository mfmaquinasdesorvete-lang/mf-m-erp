// NF-e de devolução a partir da nota original: escolhe itens e quantidades, confere o CFOP e o motivo, emite.
// Devolução de venda = nota de entrada da MF para o cliente; devolução de compra = nota de saída para o fornecedor.
import { useEffect, useState } from "react";
import { AlertTriangle, Undo2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { callFunction } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { brl, docFormat } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useInvalidate } from "@/lib/data";

type ItemPrevia = {
  numero: number; codigo: string; descricao: string; unidade: string; quantidade: number; devolvida: number; disponivel: number;
  valor_unitario: number; cfop_original: string; cfop: string; produto_id: string | null; produto_nome: string | null; kit: boolean;
};
type Previa = {
  tipo: "venda" | "compra"; original: { numero: string; serie: string; chave: string; data: string | null };
  destinatario: { nome: string; doc: string; uf: string; municipio: string };
  faltas: string[]; avisos: string[]; interestadual: boolean; cfops: { cfop: string; descricao: string }[]; itens: ItemPrevia[];
};

export function DevolucaoModal({ origem, onClose }: { origem: { tipo: "emitida" | "recebida"; id: string }; onClose: () => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [qtd, setQtd] = useState<Record<number, string>>({});
  const [cfop, setCfop] = useState<Record<number, string>>({});
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();

  useEffect(() => {
    callFunction<Previa>("nfe-emitir", { devolucao: origem, previa: true })
      .then((p) => {
        setPrevia(p);
        setCfop(Object.fromEntries(p.itens.map((i) => [i.numero, i.cfop])));
      })
      .catch((e) => setErro((e as Error).message));
  }, [origem.tipo, origem.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const escolhidos = (previa?.itens ?? []).filter((i) => Number(String(qtd[i.numero] ?? "").replace(",", ".")) > 0);
  const total = escolhidos.reduce((s, i) => s + Number(String(qtd[i.numero]).replace(",", ".")) * i.valor_unitario, 0);
  const invalido = escolhidos.some((i) => Number(String(qtd[i.numero]).replace(",", ".")) > i.disponivel + 1e-9);

  async function emitir() {
    if (!previa || !(await confirmarSeTeste())) return;
    setOcupado(true);
    try {
      const r = await callFunction("nfe-emitir", {
        devolucao: origem, motivo,
        itens: escolhidos.map((i) => ({ numero: i.numero, quantidade: Number(String(qtd[i.numero]).replace(",", ".")), cfop: cfop[i.numero] })),
      });
      notify(r.nota?.status === "autorizada" ? `NF de devolução ${r.nota.numero} autorizada` : "NF de devolução enviada para a SEFAZ");
      invalidate("notas_fiscais", "nfe_recebidas", "produtos");
      onClose();
    } catch (e) {
      notifyError(e);
      invalidate("notas_fiscais");
    } finally {
      setOcupado(false);
    }
  }

  const titulo = previa ? (previa.tipo === "venda" ? "NF de devolução de venda (entrada)" : "NF de devolução de compra (saída)") : "NF de devolução";
  return (
    <Modal open onClose={onClose} title={titulo} wide>
      {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {!previa && !erro && <p className="text-sm text-slate-500">Lendo a nota original…</p>}
      {previa && (
        <div className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">Nota original</div>
              <div className="font-semibold text-fg">NF {previa.original.numero}{previa.original.serie && `/${previa.original.serie}`}{previa.original.data && ` · ${previa.original.data.slice(0, 10).split("-").reverse().join("/")}`}</div>
              <div className="break-all text-xs text-slate-500">{previa.original.chave}</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">{previa.tipo === "venda" ? "Cliente (destinatário)" : "Fornecedor (destinatário)"}</div>
              <div className="font-semibold text-fg">{previa.destinatario.nome}</div>
              <div className="text-xs text-slate-500">{docFormat(previa.destinatario.doc)} · {previa.destinatario.municipio}/{previa.destinatario.uf}{previa.interestadual && " · interestadual"}</div>
            </div>
          </div>

          {(previa.avisos.length > 0 || previa.faltas.length > 0) && (
            <ul className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {previa.faltas.length > 0 && <li className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> Faltam dados do destinatário na nota original: {previa.faltas.join(", ")}.</li>}
              {previa.avisos.map((a) => <li key={a} className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {a}</li>)}
            </ul>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Na nota</th><th className="px-3 py-2 text-right">Devolver</th><th className="px-3 py-2">CFOP</th><th className="px-3 py-2">Estoque</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previa.itens.map((i) => {
                  const q = Number(String(qtd[i.numero] ?? "").replace(",", "."));
                  return (
                    <tr key={i.numero}>
                      <td className="px-3 py-2"><div className="font-medium text-fg">{i.descricao}</div><div className="text-xs text-slate-500">{i.codigo} · {brl(i.valor_unitario)}/{i.unidade} · CFOP original {i.cfop_original}</div></td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600">{i.quantidade} {i.unidade}{i.devolvida > 0 && <div className="text-amber-700">já devolvido {i.devolvida}</div>}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input className={`input w-20 py-1 text-right ${q > i.disponivel + 1e-9 ? "border-red-400" : ""}`} inputMode="decimal" disabled={!i.disponivel}
                            value={qtd[i.numero] ?? ""} placeholder="0" onChange={(e) => setQtd({ ...qtd, [i.numero]: e.target.value })} aria-label={`Quantidade a devolver de ${i.descricao}`} />
                          <button type="button" className="text-xs font-semibold text-brand disabled:opacity-40" disabled={!i.disponivel} onClick={() => setQtd({ ...qtd, [i.numero]: String(i.disponivel) })}>tudo</button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {previa.tipo === "compra" ? (
                          <select className="input w-auto py-1 text-xs" value={cfop[i.numero] ?? i.cfop} onChange={(e) => setCfop({ ...cfop, [i.numero]: e.target.value })}>
                            {[...new Set([i.cfop, ...previa.cfops.map((c) => c.cfop)])].map((c) => <option key={c} value={c}>{c} {previa.cfops.find((x) => x.cfop === c)?.descricao ?? ""}</option>)}
                          </select>
                        ) : (
                          <input className="input w-20 py-1 text-xs" inputMode="numeric" maxLength={4} value={cfop[i.numero] ?? i.cfop} onChange={(e) => setCfop({ ...cfop, [i.numero]: e.target.value.replace(/\D/g, "") })} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{i.kit ? <span className="text-amber-700">kit: ajuste manual</span> : i.produto_nome ? <span className="text-slate-600">{previa.tipo === "venda" ? "entra" : "sai"}: {i.produto_nome}</span> : <span className="text-slate-500">sem produto ligado</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Field label="Motivo da devolução (vai nas informações da nota)">
            <textarea className="input min-h-[4rem]" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={previa.tipo === "venda" ? "Ex.: cliente devolveu 1 motor com defeito de fabricação" : "Ex.: peças enviadas diferentes do pedido de compra"} />
          </Field>
          <p className="text-xs text-slate-500">
            Os impostos acompanham a nota original na proporção devolvida (ICMS/ST pela base da original, IPI como "IPI devolvido", PIS/COFINS em outras operações).
            Ao autorizar, o estoque {previa.tipo === "venda" ? "entra" : "sai"} sozinho; se a devolução for cancelada, volta. A devolução do dinheiro ou o crédito é lançado no financeiro.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-3">
            <span className="text-sm text-slate-600">{escolhidos.length} item(ns) · produtos {brl(total)}</span>
            <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
            <Button type="button" onClick={emitir} disabled={ocupado || !escolhidos.length || invalido || motivo.trim().length < 15 || previa.faltas.length > 0}>
              <Undo2 size={16} /> {ocupado ? "Enviando…" : "Emitir NF de devolução"}
            </Button>
          </div>
          {motivo.trim().length > 0 && motivo.trim().length < 15 && <p className="text-right text-xs text-amber-700">Escreva o motivo com pelo menos 15 letras.</p>}
        </div>
      )}
    </Modal>
  );
}
