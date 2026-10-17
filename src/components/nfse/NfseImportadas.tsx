// Notas fiscais → NFS-e: notas de serviço feitas fora do ERP. Emitidas pela MF (Tiny, portal da prefeitura, Emissor
// Nacional) e recebidas de fornecedores (tomadas). Entram pelo XML, pelo ZIP com XMLs ou pelo relatório do Tiny.
import { useMemo, useState } from "react";
import { CheckCircle2, FileUp, Info } from "lucide-react";
import { Button, Field, Modal, Table } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { useUnidade, EtiquetaUnidade } from "@/lib/unidade";
import { brl, dataBR, docFormat } from "@/lib/format";
import { lerArquivosNfse, retencoes, SITUACAO_IMPORTADA, valorNumero, type ItemNfse, type NfseImportada } from "@/lib/nfseImportada";

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export function ListaNfseImportadas({ tipo }: { tipo: "emitida" | "tomada" }) {
  const { filtrar } = useUnidade();
  const { data = [], isLoading } = useRows<NfseImportada>("nfse_importadas", {
    order: "data_emissao", ascending: false, key: [tipo], filtro: (q) => q.eq("tipo", tipo),
  });
  const lista = filtrar(data);
  const total = lista.filter((n) => n.situacao !== "cancelada").reduce((s, n) => s + Number(n.valor_servicos), 0);
  const retido = lista.filter((n) => n.situacao !== "cancelada").reduce((s, n) => s + retencoes(n), 0);
  const semNumero = lista.filter((n) => n.situacao === "sem_numero").length;
  const emitida = tipo === "emitida";

  if (!isLoading && !lista.length && emitida) return null;
  return (
    <section className="mt-5">
      {emitida && <h3 className="mb-1 font-bold">Feitas fora do ERP <span className="text-sm font-normal text-slate-500">· Tiny, prefeitura ou Emissor Nacional</span></h3>}
      <p className="mb-3 text-sm text-slate-600">
        {lista.length} {lista.length === 1 ? "nota" : "notas"} · serviços {brl(total)} · retenções {brl(retido)}
        {emitida ? " (descontadas pelo cliente: viram crédito na apuração)" : " (a MF desconta do fornecedor e recolhe)"}
        {semNumero > 0 && <span className="text-amber-700"> · {semNumero} sem número: confira na prefeitura e importe o XML</span>}
      </p>
      <Table empty={!isLoading && !lista.length} head={<>
        <th className="th">Data</th><th className="th">Número</th><th className="th">{emitida ? "Tomador (cliente)" : "Prestador (fornecedor)"}</th>
        <th className="th text-right">Valor</th><th className="th text-right">Retenções</th><th className="th">Situação</th>
      </>}>
        {lista.map((n) => {
          const s = SITUACAO_IMPORTADA[n.situacao];
          const nome = emitida ? n.tomador_nome : n.prestador_nome;
          const doc = emitida ? n.tomador_doc : n.prestador_doc;
          return (
            <tr key={n.id} className="tr">
              <td className="td whitespace-nowrap" data-label="Data">{dataBR(n.data_emissao)}<EtiquetaUnidade id={n.unidade_id} /></td>
              <td className="td" data-label="Número">
                <div className="font-medium">{n.numero ?? "—"}</div>
                {n.rps && <div className="text-xs text-slate-500">RPS {n.rps}</div>}
              </td>
              <td className="td" data-label={emitida ? "Tomador" : "Prestador"}>
                <div className="font-medium">{nome ?? "—"}</div>
                <div className="text-xs text-slate-500">{doc ? docFormat(doc) : ""}{n.discriminacao ? `${doc ? " · " : ""}${n.discriminacao.slice(0, 80)}` : ""}</div>
              </td>
              <td className="td text-right whitespace-nowrap" data-label="Valor">{brl(n.valor_servicos)}
                {n.valor_iss != null && Number(n.valor_iss) > 0 && <div className="text-xs text-slate-500">ISS {brl(n.valor_iss)}{n.iss_retido ? " retido" : ""}</div>}
              </td>
              <td className="td text-right whitespace-nowrap" data-label="Retenções">{retencoes(n) ? brl(retencoes(n)) : "—"}</td>
              <td className="td" data-label="Situação">
                <span title={s.ajuda} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cor}`}>{s.label}</span>
                <span className="ml-1 text-xs text-slate-400">{n.origem === "tiny" ? "Tiny" : "XML"}</span>
              </td>
            </tr>
          );
        })}
      </Table>
    </section>
  );
}

type Resultado = { novas: number; atualizadas: number; ignoradas: number; motivos: string[] };
const LOTE = 200;

export function ImportarNfse({ onClose }: { onClose: () => void }) {
  const { unidades } = useUnidade();
  const ativas = unidades.filter((u) => u.ativo);
  const [unidadeTiny, setUnidadeTiny] = useState(ativas[0]?.id ?? "");
  const [itens, setItens] = useState<ItemNfse[] | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const invalidar = useInvalidate();

  const cnpjs = useMemo(() => new Set(ativas.map((u) => dig((u as { cnpj?: string }).cnpj)).filter(Boolean)), [ativas]);
  const tipoDe = (i: ItemNfse) => (i.origem === "tiny" || cnpjs.has(i.prestador_doc) ? "emitida" : cnpjs.has(i.tomador_doc) ? "tomada" : "fora");

  async function abrir(lista: FileList | null) {
    if (!lista?.length) return;
    setOcupado("ler");
    try {
      const r = await lerArquivosNfse([...lista], unidadeTiny);
      setItens(r.itens);
      setErros(r.erros);
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  async function importar() {
    if (!itens?.length) return;
    setOcupado("importar");
    const total: Resultado = { novas: 0, atualizadas: 0, ignoradas: 0, motivos: [] };
    try {
      const envio = itens.map((i) => (i.origem === "tiny" ? { ...i, unidade_id: unidadeTiny } : i));
      for (let k = 0; k < envio.length; k += LOTE) {
        const { data, error } = await supabase.rpc("importar_nfse", { p_itens: envio.slice(k, k + LOTE) });
        if (error) throw error;
        const r = data as Resultado;
        total.novas += r.novas; total.atualizadas += r.atualizadas; total.ignoradas += r.ignoradas;
        total.motivos.push(...(r.motivos ?? []));
      }
      setResultado(total);
    } catch (e) {
      notifyError(e);
      if (total.novas + total.atualizadas) setResultado(total);
    } finally {
      setOcupado("");
      invalidar("nfse_importadas");
    }
  }

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Notas de serviço importadas">
        <div className="space-y-3 text-[15px]">
          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={22} /> Pronto.</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            <li>{resultado.novas} {resultado.novas === 1 ? "nota nova" : "notas novas"}</li>
            {resultado.atualizadas > 0 && <li>{resultado.atualizadas} que já {resultado.atualizadas === 1 ? "estava" : "estavam"} no ERP {resultado.atualizadas === 1 ? "foi atualizada" : "foram atualizadas"}</li>}
            {resultado.ignoradas > 0 && <li className="text-amber-700">{resultado.ignoradas} não entraram: {resultado.motivos.slice(0, 4).join("; ")}{resultado.motivos.length > 4 ? "…" : ""}</li>}
          </ul>
          <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
    );
  }

  const contagem = (t: string) => (itens ?? []).filter((i) => tipoDe(i) === t).length;
  return (
    <Modal open onClose={onClose} title="Importar notas de serviço (NFS-e)" wide>
      {!itens ? (
        <div className="space-y-4">
          <p className="text-[15px] text-slate-700">
            Traga as notas de serviço feitas fora do ERP: as que a MF emitiu (no Tiny, no portal da prefeitura ou no Emissor Nacional)
            e as que fornecedores emitiram para a MF (contador, advogado, manutenção…). Serve o <b>XML</b> da nota (prefeitura ou
            NFS-e Nacional), um <b>ZIP</b> com vários XMLs ou o relatório do Tiny (<b>Notas fiscais de serviço → Relatório → Excel</b>).
          </p>
          <Field label="O relatório do Tiny é de qual unidade?">
            <select className="input" value={unidadeTiny} onChange={(e) => setUnidadeTiny(e.target.value)}>
              {ativas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">O relatório do Tiny não traz o CNPJ; no XML o ERP descobre sozinho.</span>
          </Field>
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
            <FileUp size={36} className="text-brand" />
            <span className="font-semibold">{ocupado ? "Lendo…" : "Escolher arquivos (.xml, .zip, .xls, .xlsx ou .csv)"}</span>
            <input type="file" multiple accept=".xml,.zip,.xls,.xlsx,.csv" className="hidden" onChange={(e) => abrir(e.target.files)} />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Notas lidas", itens.length], ["Emitidas pela MF", contagem("emitida")], ["Recebidas (tomadas)", contagem("tomada")], ["Sem número (só RPS)", itens.filter((i) => !i.numero).length]].map(([r, v]) => (
              <div key={r} className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-fg">{v}</div><div className="text-xs text-slate-500">{r}</div></div>
            ))}
          </div>
          {contagem("fora") > 0 && (
            <p className="flex gap-2 text-sm text-amber-800"><Info size={16} className="mt-0.5 shrink-0" />
              {contagem("fora")} {contagem("fora") === 1 ? "nota não tem" : "notas não têm"} o CNPJ de uma unidade da MF como prestador nem como tomador: não entram.</p>
          )}
          {erros.length > 0 && <p className="text-sm text-slate-500">Não lidos: {erros.slice(0, 4).join("; ")}{erros.length > 4 ? "…" : ""}</p>}
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="p-2">Data</th><th className="p-2">Número</th><th className="p-2">Quem</th><th className="p-2 text-right">Valor</th><th className="p-2">Tipo</th></tr></thead>
              <tbody>
                {itens.slice(0, 100).map((i, k) => {
                  const t = tipoDe(i);
                  return (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="p-2 whitespace-nowrap">{i.data_emissao ? dataBR(i.data_emissao) : "—"}</td>
                      <td className="p-2">{i.numero || "—"}{i.rps ? <span className="text-xs text-slate-500"> · RPS {i.rps}</span> : null}</td>
                      <td className="p-2">{t === "tomada" ? i.prestador_nome : i.tomador_nome}</td>
                      <td className="p-2 text-right whitespace-nowrap">{brl(valorNumero(i.valor_servicos))}</td>
                      <td className="p-2 text-xs">{t === "emitida" ? "Emitida" : t === "tomada" ? "Recebida" : <span className="text-amber-700">Não é da MF</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => { setItens(null); setErros([]); }} disabled={!!ocupado}>Outros arquivos</Button>
            <Button onClick={importar} disabled={!!ocupado || !itens.length}>{ocupado ? "Importando…" : `Importar ${itens.length} ${itens.length === 1 ? "nota" : "notas"}`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
