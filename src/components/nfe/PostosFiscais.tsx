// Postos fiscais e eventos da NF-e depois da autorização: ícone de caminhão na lista (quantos postos e por quais estados)
// e a linha do tempo dentro da nota (passagens, MDF-e/CT-e da carga, ciência/confirmação do destinatário).
// Os eventos vêm da Focus (botão "Buscar na SEFAZ") ou de um XML de evento importado.
import { useState } from "react";
import { CheckCircle2, FileUp, MapPin, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { infoEvento, lerEventosXml, resumoPostos, type EventoNfe } from "../../../supabase/functions/_shared/nfe-eventos";

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "sem data");

/** Mapa chave → eventos, para os ícones das listas. */
export function useEventosNfe() {
  const { data = [] } = useRows<EventoNfe>("nfe_eventos", { select: "chave,tp_evento,n_seq,descricao,dh_evento,orgao,detalhe,protocolo", order: "dh_evento", ascending: true });
  const mapa = new Map<string, EventoNfe[]>();
  for (const e of data) mapa.set(e.chave, [...(mapa.get(e.chave) ?? []), e]);
  return mapa;
}

/** Caminhãozinho da lista: some sem eventos; azul com o número de postos; verde quando o destinatário confirmou. */
export function IconePostos({ eventos }: { eventos?: EventoNfe[] }) {
  if (!eventos?.length) return null;
  const r = resumoPostos(eventos);
  if (!r.passagens.length && !r.transporte && !r.confirmada) return null;
  const titulo = [
    r.passagens.length ? `Passou por ${r.passagens.length} ${r.passagens.length === 1 ? "posto fiscal" : "postos fiscais"}${r.ufs.length ? ` (${r.ufs.join(", ")})` : ""}` : "Carga com MDF-e/CT-e, ainda sem passagem por posto",
    r.ultima && `último: ${r.ultima.orgao ?? ""} ${quando(r.ultima.dh_evento)}`,
    r.confirmada && "destinatário confirmou o recebimento",
  ].filter(Boolean).join(" · ");
  const cor = r.confirmada ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : r.passagens.length ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span title={titulo} aria-label={titulo} className={`mt-0.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-semibold ${cor}`}>
      <Truck size={11} />
      {r.passagens.length > 0 && <span>{r.passagens.length}</span>}
      {r.ufs.length > 0 && <span className="font-normal">{r.ufs.slice(-2).join("→")}</span>}
      {r.confirmada && <CheckCircle2 size={11} />}
    </span>
  );
}

/** Linha do tempo dentro da nota, com os botões de buscar e importar. */
export function EventosNota({ chave, notaId, eventos, podeBuscar }: { chave: string; notaId?: string; eventos: EventoNfe[]; podeBuscar: boolean }) {
  const invalidate = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  const r = resumoPostos(eventos);

  async function buscar() {
    setOcupado(true);
    try {
      const res = await callFunction("nfe-consultar", notaId ? { acao: "eventos", nota_id: notaId } : { acao: "eventos", chave }) as { eventos: number };
      invalidate("nfe_eventos");
      notify(res.eventos ? `${res.eventos} ${res.eventos === 1 ? "evento encontrado" : "eventos encontrados"} na SEFAZ` : "A SEFAZ não devolveu eventos para esta nota (ainda)");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  async function importar(files: FileList | null) {
    if (!files?.length) return;
    setOcupado(true);
    try {
      const lidos = (await Promise.all(Array.from(files).map((f) => f.text()))).flatMap(lerEventosXml);
      const desta = lidos.filter((e) => e.chave === chave);
      if (!desta.length) throw new Error(lidos.length ? "Os eventos do arquivo são de outra nota." : "Não achei eventos de NF-e no arquivo.");
      const { error } = await supabase.from("nfe_eventos").upsert(desta.map((e) => ({ ...e, origem: "xml" })), { onConflict: "chave,tp_evento,n_seq" });
      if (error) throw error;
      invalidate("nfe_eventos");
      notify(`${desta.length} ${desta.length === 1 ? "evento importado" : "eventos importados"}`);
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <section className="rounded-2xl border border-slate-200 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-50 text-sky-700"><Truck size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Postos fiscais e eventos</p>
          <p className="text-2xs text-slate-500">
            {r.passagens.length ? `${r.passagens.length} ${r.passagens.length === 1 ? "passagem" : "passagens"}${r.ufs.length ? ` · ${r.ufs.join(" → ")}` : ""}` : "nenhuma passagem registrada"}
            {r.confirmada ? " · destinatário confirmou" : ""}
          </p>
        </div>
        {podeBuscar && <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1 text-xs" disabled={ocupado} onClick={buscar}><RefreshCw size={13} className={ocupado ? "animate-spin" : ""} /> Buscar na SEFAZ</Button>}
        {podeBuscar && (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-light" title="XML de evento (procEventoNFe) baixado da SEFAZ ou do transportador">
            <FileUp size={13} /> XML de evento
            <input type="file" accept=".xml,text/xml" multiple className="sr-only" onChange={(e) => { importar(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </header>
      {eventos.length ? (
        <ol className="relative ml-3 space-y-2 border-l border-slate-200 pl-4">
          {eventos.map((e, i) => {
            const g = infoEvento(e.tp_evento).grupo;
            const cor = g === "passagem" ? "bg-sky-500" : g === "destinatario" ? "bg-emerald-500" : g === "transporte" ? "bg-violet-500" : "bg-slate-400";
            return (
              <li key={i} className="relative text-sm">
                <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${cor}`} />
                <p className="font-semibold">{infoEvento(e.tp_evento).rotulo}
                  {e.orgao && e.orgao !== "AN" && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 text-2xs font-semibold text-slate-600"><MapPin size={10} />{e.orgao}</span>}
                </p>
                <p className="text-xs text-slate-500">{quando(e.dh_evento)}{e.detalhe ? ` · ${e.detalhe}` : ""}{e.protocolo ? ` · protocolo ${e.protocolo}` : ""}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-slate-500">Quando a carga passar por um posto fiscal, a SEFAZ registra na nota e aparece aqui (e um caminhãozinho na lista).</p>
      )}
    </section>
  );
}
