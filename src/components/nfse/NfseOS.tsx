// Nota de serviço (NFS-e) da ordem de serviço: conferir antes de enviar, acompanhar a prefeitura,
// baixar/enviar ao cliente, cancelar com motivo e ver o histórico de todas as tentativas.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, Clock, ExternalLink, FileText, FlaskConical, History, MessageCircle, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { brl, dataBR, docFormat, whatsappLink } from "@/lib/format";
import { NFSE_EM_ANDAMENTO, ROTULO_EVENTO, SITUACAO_NFSE, type EventoNfse, type Nfse } from "@/lib/nfse";

type Previa = {
  pendencias: string[]; avisos: string[]; ambiente: "producao" | "homologacao"; padrao: "nacional" | "municipal";
  tomador: { nome: string; documento: string; email: string | null; endereco: string; municipio: string | null };
  valor_servicos: number; valor_pecas: number; incluir_pecas: boolean; aliquota_iss: number | null; valor_iss: number | null;
  iss_retido: boolean; discriminacao: string;
};
type OSResumo = { id?: string; numero?: number | null; status?: string; em_garantia?: boolean | null; valor_mao_obra?: number | null; cliente_id?: string | null };

export function useNfsesDaOS(osId: string | undefined) {
  return useQuery({
    queryKey: ["nfse", "os", osId],
    enabled: !!osId,
    queryFn: async () => {
      const { data, error } = await supabase.from("nfse").select("*").eq("os_id", osId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Nfse[];
    },
    refetchInterval: (q) => ((q.state.data as Nfse[] | undefined)?.some((n) => NFSE_EM_ANDAMENTO.includes(n.status)) ? 8000 : false),
  });
}

export function ChipNfse({ n }: { n: Pick<Nfse, "status" | "ambiente" | "numero"> }) {
  const s = SITUACAO_NFSE[n.status];
  return (
    <span title={s.ajuda} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cor}`}>
      NFS-e {n.numero ? `nº ${n.numero} · ` : ""}{s.label.toLowerCase()}
      {n.ambiente === "homologacao" && <FlaskConical size={11} aria-label="teste" />}
    </span>
  );
}

export function NfseOS({ os, telefone }: { os: OSResumo; telefone?: string | null }) {
  const { pode } = usePerfil();
  const invalidar = useInvalidate();
  const { data: notas = [], refetch } = useNfsesDaOS(os.id);
  const [previa, setPrevia] = useState<(Previa & { substitui_id?: string }) | null>(null);
  const [discriminacao, setDiscriminacao] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);

  const atual = notas[0];
  const viva = notas.find((n) => ["pendente", "processando", "autorizada", "incerto"].includes(n.status));
  const concluida = os.status === "concluida" || os.status === "entregue";
  const podeEmitir = pode("emitir_nfse");

  const { data: eventos = [] } = useQuery({
    queryKey: ["nfse_eventos", os.id, notas.map((n) => n.id + n.status).join()],
    enabled: verHistorico && notas.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("nfse_eventos").select("*").in("nfse_id", notas.map((n) => n.id)).order("id", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoNfse[];
    },
  });

  useEffect(() => { if (previa) setDiscriminacao(previa.discriminacao); }, [previa]);

  async function executar(nome: string, f: () => Promise<string | void>) {
    setOcupado(nome);
    try { const msg = await f(); if (msg) notify(msg); await refetch(); invalidar("ordens_servico", "contas_receber"); }
    catch (e) { notifyError(e); }
    finally { setOcupado(null); }
  }

  const abrirPrevia = (substitui_id?: string) => executar("previa", async () => {
    const p = await callFunction<Previa>("nfse", { acao: "previa", os_id: os.id });
    setPrevia({ ...p, substitui_id });
  });

  const enviar = () => executar("emitir", async () => {
    if (!previa) return;
    if (previa.ambiente === "homologacao" && !confirm("Ambiente de TESTE: a nota não tem valor fiscal e a OS não será faturada. Enviar mesmo assim?")) return;
    const r = await callFunction<{ nfse: Nfse; mensagem?: string }>("nfse", {
      acao: "emitir", os_id: os.id, discriminacao: discriminacao.trim(), substitui_id: previa.substitui_id ?? null,
    });
    setPrevia(null);
    return r.mensagem ?? "NFS-e enviada. Aguardando a prefeitura";
  });

  const consultar = (n: Nfse) => executar("consultar", async () => {
    const r = await callFunction<{ nfse: Nfse }>("nfse", { acao: "consultar", id: n.id });
    return `Situação: ${SITUACAO_NFSE[r.nfse.status].label}`;
  });

  const cancelar = (n: Nfse) => {
    const motivo = prompt("Motivo do cancelamento (mínimo 15 caracteres). Fica registrado com o seu nome:");
    if (motivo === null) return;
    if (motivo.trim().length < 15) return notify("Escreva o motivo com pelo menos 15 caracteres", "erro");
    if (!confirm(`Cancelar a NFS-e ${n.numero ? `nº ${n.numero}` : ""} na prefeitura? O cancelamento é definitivo.`)) return;
    executar("cancelar", async () => {
      const r = await callFunction<{ nfse: Nfse }>("nfse", { acao: "cancelar", id: n.id, motivo: motivo.trim() });
      return r.nfse.status === "cancelada" ? "NFS-e cancelada. A OS voltou a ficar sem nota" : "Cancelamento enviado; aguardando a prefeitura";
    });
  };

  if (!os.id) return <p className="text-sm text-slate-500">Salve a OS para emitir a nota de serviço.</p>;

  return (
    <div className="space-y-4">
      {/* nota atual */}
      {atual ? (
        <div className={`rounded-xl border p-4 ${atual.status === "autorizada" ? "border-emerald-200 bg-emerald-50" : atual.status === "rejeitada" ? "border-red-200 bg-red-50" : atual.status === "incerto" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-surface"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <ChipNfse n={atual} />
            {atual.ambiente === "homologacao" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">teste: sem valor fiscal</span>}
            <span className="text-xs text-slate-500">ref. {atual.referencia}</span>
          </div>
          <p className="mt-2 text-sm text-slate-700">{SITUACAO_NFSE[atual.status].ajuda}</p>
          {atual.mensagem && atual.status !== "autorizada" && (
            <p className="mt-2 flex gap-1.5 text-sm text-red-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {atual.mensagem}</p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">Valor dos serviços</dt><dd className="font-semibold">{brl(atual.valor_servicos)}</dd></div>
            <div><dt className="text-xs text-slate-500">ISS</dt><dd>{atual.valor_iss != null ? brl(atual.valor_iss) : "—"}{atual.aliquota_iss != null ? ` (${atual.aliquota_iss}%)` : ""}{atual.iss_retido ? " retido" : ""}</dd></div>
            <div><dt className="text-xs text-slate-500">Número</dt><dd>{atual.numero ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Verificação</dt><dd className="break-all">{atual.codigo_verificacao ?? "—"}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {atual.url_danfse && <a className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50" href={atual.url_danfse} target="_blank" rel="noreferrer"><FileText size={15} /> PDF da nota</a>}
            {atual.url && <a className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50" href={atual.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ver na prefeitura</a>}
            {atual.status === "autorizada" && atual.url_danfse && telefone && (
              <a className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                href={whatsappLink(telefone, `Olá! Segue a nota fiscal de serviço${atual.numero ? ` nº ${atual.numero}` : ""} da OS #${os.numero}: ${atual.url_danfse}`)} target="_blank" rel="noreferrer">
                <MessageCircle size={15} /> Enviar ao cliente
              </a>
            )}
            {NFSE_EM_ANDAMENTO.includes(atual.status) && (
              <Button type="button" variant="secondary" disabled={!!ocupado} onClick={() => consultar(atual)}><RefreshCw size={15} /> {ocupado === "consultar" ? "Consultando…" : "Consultar agora"}</Button>
            )}
            {atual.status === "autorizada" && pode("cancelar_nfse") && (
              <Button type="button" variant="ghost" className="!text-red-600" disabled={!!ocupado} onClick={() => cancelar(atual)}><Ban size={15} /> Cancelar NFS-e</Button>
            )}
            {atual.status === "rejeitada" && podeEmitir && !viva && (
              <Button type="button" disabled={!!ocupado} onClick={() => abrirPrevia(atual.id)}><RefreshCw size={15} /> Corrigir e reenviar</Button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          {!concluida ? "A nota de serviço é emitida depois que a OS é concluída."
            : os.em_garantia ? "OS em garantia: sem cobrança, sem nota de serviço."
            : !Number(os.valor_mao_obra) ? "Sem valor de mão de obra nesta OS."
            : "Esta OS ainda não tem nota de serviço."}
        </div>
      )}

      {/* emitir: conferência antes de enviar */}
      {!viva && concluida && !os.em_garantia && Number(os.valor_mao_obra) > 0 && podeEmitir && !previa && atual?.status !== "rejeitada" && (
        <Button type="button" disabled={!!ocupado} onClick={() => abrirPrevia()}><Send size={16} /> {ocupado === "previa" ? "Conferindo…" : "Emitir NFS-e"}</Button>
      )}

      {previa && (
        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold">Conferir antes de enviar</h4>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${previa.ambiente === "producao" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              {previa.ambiente === "producao" ? "produção" : "teste (homologação)"}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{previa.padrao === "nacional" ? "NFS-e Nacional" : "NFS-e municipal"}</span>
          </div>
          {previa.pendencias.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {previa.pendencias.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {p}</li>)}
            </ul>
          )}
          {previa.avisos.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {previa.avisos.map((p) => <li key={p} className="flex gap-1.5"><Clock size={14} className="mt-0.5 shrink-0" /> {p}</li>)}
            </ul>
          )}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Tomador</dt><dd className="font-semibold">{previa.tomador.nome}</dd><dd className="text-xs text-slate-600">{docFormat(previa.tomador.documento)} · {previa.tomador.email ?? "sem e-mail"}</dd></div>
            <div><dt className="text-xs text-slate-500">Endereço do tomador</dt><dd>{previa.tomador.endereco || "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Valor dos serviços</dt><dd className="font-semibold">{brl(previa.valor_servicos)}</dd>
              {previa.valor_pecas > 0 && <dd className="text-xs text-slate-600">{previa.incluir_pecas ? `inclui ${brl(previa.valor_pecas)} de peças` : `peças (${brl(previa.valor_pecas)}) fora da NFS-e: vão em NF-e`}</dd>}</div>
            <div><dt className="text-xs text-slate-500">ISS</dt><dd>{previa.valor_iss != null ? brl(previa.valor_iss) : "—"}{previa.aliquota_iss != null ? ` (${previa.aliquota_iss}%)` : ""}{previa.iss_retido ? " · retido pelo tomador" : ""}</dd></div>
          </dl>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Discriminação do serviço (vai impressa na nota)</span>
            <textarea className="input" rows={4} maxLength={2000} value={discriminacao} onChange={(e) => setDiscriminacao(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!!ocupado || previa.pendencias.length > 0 || discriminacao.trim().length < 10} onClick={enviar}>
              <Send size={16} /> {ocupado === "emitir" ? "Enviando…" : "Enviar para a prefeitura"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPrevia(null)}>Voltar</Button>
          </div>
          <p className="text-xs text-slate-500">
            O ERP grava a nota com uma referência única antes de enviar. Se a Focus não responder, ele consulta pela mesma referência antes de
            qualquer reenvio. A OS só fica faturada quando a prefeitura autorizar.
          </p>
        </div>
      )}

      {/* histórico */}
      {notas.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerHistorico((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-fg" aria-expanded={verHistorico}>
            <History size={15} /> Histórico ({notas.length} tentativa{notas.length > 1 ? "s" : ""}) <ChevronDown size={14} className={verHistorico ? "rotate-180" : ""} />
          </button>
          {verHistorico && (
            <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3 text-xs">
              {eventos.map((e) => {
                const n = notas.find((x) => x.id === e.nfse_id);
                return (
                  <li key={e.id} className="text-slate-600">
                    <span className="text-slate-400">{new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>{" "}
                    <b className="text-fg">{ROTULO_EVENTO[e.tipo] ?? e.tipo}</b>
                    {e.status_depois && <> → {SITUACAO_NFSE[e.status_depois as Nfse["status"]]?.label ?? e.status_depois}</>}
                    {e.http_status ? <> · HTTP {e.http_status}</> : null}
                    {e.detalhe && <> · {e.detalhe}</>}
                    {n && <span className="text-slate-400"> · ref. {n.referencia}</span>}
                  </li>
                );
              })}
              {!eventos.length && <li className="text-slate-400">Carregando…</li>}
            </ol>
          )}
        </div>
      )}
      {atual?.status === "autorizada" && atual.autorizada_em && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-800"><CheckCircle2 size={14} /> Autorizada em {dataBR(atual.autorizada_em)}</p>
      )}
    </div>
  );
}
