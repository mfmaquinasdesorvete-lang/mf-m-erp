// Contas a pagar renegociadas (turquesa + laranja): fechar o acordo com o fornecedor (parcelas novas no lugar das
// contas, ou só registrar a negociação), acompanhar as parcelas pagas e guardar o histórico com data: anotações,
// áudios (gravados aqui ou do WhatsApp), prints e arquivos. Os arquivos ficam no bucket privado "documentos".
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FileText, Handshake, Image as Imagem, Mic, Paperclip, Square, StickyNote, Trash2, Wallet } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje, pl, somarDias } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { useUnidade, EtiquetaUnidade } from "@/lib/unidade";
import { confirmar } from "@/components/Dialogos";
import { COR_RENEGOCIADA, COR_TOM, situacaoPagar, type ContaDecisao } from "@/lib/programacao";
import {
  andamento, linhaDoTempo, nomeArquivoLimpo, parcelasDoAcordo, SITUACOES_NEGOCIACAO, tipoPeloArquivo, TIPOS_EVENTO,
  type EventoNegociacao, type Negociacao, type SituacaoNegociacao, type TipoEvento,
} from "@/lib/renegociacao";

type Conta = ContaDecisao & {
  descricao: string; data_pagamento?: string | null; valor_pago?: number | null; fornecedor_id?: string | null;
  fornecedor?: { nome: string; bloqueado?: boolean | null } | null;
};
const LIMITE = 20 * 1024 * 1024;

/** Etiqueta "Renegociada" (turquesa + laranja) da conta: tocar abre o histórico da negociação. */
export function ChipRenegociada({ onClick, papel }: { onClick?: () => void; papel?: string | null }) {
  const texto = papel === "original" ? "Trocada no acordo" : "Renegociada";
  return (
    <button type="button" onClick={onClick} title="Abrir o histórico da negociação" style={{ background: COR_RENEGOCIADA.fundo, color: COR_RENEGOCIADA.tinta }}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold shadow-sm hover:brightness-105">
      <Handshake size={12} aria-hidden /> {texto}
    </button>
  );
}

/* ------------------------------ Renegociar (fechar o acordo) ------------------------------ */

export function ModalRenegociar({ contas, onClose, onFeito }: { contas: Conta[]; onClose: () => void; onFeito?: (id: string) => void }) {
  const invalidar = useInvalidate();
  const validas = contas.filter((c) => c.status === "aberto" && !c.negociacao_id);
  const total = Math.round(validas.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100;
  const fornecedores = [...new Set(validas.map((c) => c.fornecedor?.nome).filter(Boolean))];
  const [titulo, setTitulo] = useState(`Acordo ${fornecedores.length === 1 ? fornecedores[0] : "com o fornecedor"}`.slice(0, 120));
  const [trocar, setTrocar] = useState(true);
  const [valor, setValor] = useState(String(total || ""));
  const [parcelas, setParcelas] = useState(3);
  const [primeiro, setPrimeiro] = useState(somarDias(30));
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const valorNum = Number(String(valor).replace(",", "."));
  const previa = trocar ? parcelasDoAcordo(valorNum, parcelas, primeiro) : [];
  const diferenca = Math.round((valorNum - total) * 100) / 100;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!validas.length) return notify("Escolha contas em aberto que não estejam em outra renegociação", "erro");
    setOcupado(true);
    const { data, error } = await supabase.rpc("renegociar_contas_pagar", {
      p_ids: validas.map((c) => c.id), p_titulo: titulo.trim(), p_trocar: trocar,
      p_valor: trocar ? valorNum : null, p_parcelas: trocar ? parcelas : null, p_primeiro: trocar ? primeiro : null, p_obs: obs.trim() || null,
    });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(trocar ? `Acordo registrado: ${parcelas} ${pl(parcelas, "parcela lançada", "parcelas lançadas")} (passam pela aprovação)` : "Negociação registrada");
    invalidar("contas_pagar", "pagar_negociacoes", "pagar_negociacao_eventos", "auditoria");
    onClose();
    if (data) onFeito?.(String(data));
  }

  return (
    <Modal open onClose={onClose} title="Renegociar contas">
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl p-3 sm:col-span-2" style={{ background: COR_RENEGOCIADA.fundo, color: COR_RENEGOCIADA.tinta }}>
          <div className="font-bold">{validas.length} {pl(validas.length, "conta", "contas")} · <span className="num">{brl(total)}</span></div>
          <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-xs">
            {validas.map((c) => <li key={c.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{dataBR(c.vencimento)} · {c.fornecedor?.nome || c.descricao}</span><span className="num shrink-0 font-semibold">{brl(c.valor)}</span></li>)}
          </ul>
          {fornecedores.length > 1 && <p className="mt-1 text-xs font-semibold">Contas de {fornecedores.length} fornecedores: o acordo fica no nome do fornecedor da conta mais antiga.</p>}
          {validas.length !== contas.length && <p className="mt-1 text-xs font-semibold">{contas.length - validas.length} ficou(aram) de fora: já paga, cancelada ou em outra renegociação.</p>}
        </div>
        <Field label="Nome da renegociação" className="sm:col-span-2"><input className="input" required minLength={3} maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Field>
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2" role="radiogroup" aria-label="O que acontece com as contas">
          {([[true, "Trocar por um acordo", "As contas viram parcelas novas (as antigas ficam canceladas, com o motivo)"],
            [false, "Só registrar a negociação", "As contas continuam as mesmas; guarda o histórico da conversa"]] as const).map(([v, t, d]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={trocar === v} onClick={() => setTrocar(v)}
              className={`rounded-xl border p-3 text-left ${trocar === v ? "border-teal-500 bg-fixo-teal-50 ring-2 ring-teal-300" : "border-slate-200 hover:bg-slate-50"}`}>
              <span className="block font-bold text-fg">{t}</span><span className="block text-xs text-slate-600">{d}</span>
            </button>
          ))}
        </div>
        {trocar && <>
          <Field label="Valor do acordo (R$)"><input className="input" inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)} /></Field>
          <Field label="Parcelas"><input className="input" type="number" min={1} max={120} required value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} /></Field>
          <Field label="Vencimento da 1ª parcela"><input className="input" type="date" required value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} /></Field>
          <p className="self-end pb-2 text-xs text-slate-600">
            {valorNum > 0 && diferenca !== 0 && <>{diferenca < 0 ? "Desconto" : "Acréscimo (juros/multa)"} de <b className={diferenca < 0 ? "text-emerald-700" : "text-red-700"}>{brl(Math.abs(diferenca))}</b> sobre as contas. </>}
            As parcelas novas passam pela aprovação como qualquer conta.
          </p>
          {previa.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 sm:col-span-2">
              <table className="w-full text-xs">
                <tbody>{previa.map((p) => <tr key={p.n} className="border-b border-slate-100 last:border-0"><td className="px-3 py-1">{p.n}/{previa.length}</td><td className="num px-3 py-1">{dataBR(p.vencimento)}</td><td className="num px-3 py-1 text-right font-semibold">{brl(p.valor)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>}
        <Field label="O que foi combinado (opcional)" className="sm:col-span-2"><textarea className="input" rows={2} maxLength={4000} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: falei com o financeiro do fornecedor; tirou os juros se pagar até dia 10" /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">Depois de salvar, abra o histórico para anexar áudios, prints e o acordo assinado.</p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button disabled={ocupado || !validas.length}><Handshake size={15} /> {ocupado ? "Salvando…" : trocar ? "Fechar o acordo" : "Registrar a negociação"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ Andamento (barra das parcelas) ------------------------------ */

function BarraAndamento({ a }: { a: ReturnType<typeof andamento> }) {
  if (!a.total) return <p className="text-xs opacity-90">Sem parcelas ainda.</p>;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs font-semibold">
        <span>{a.pagas} de {a.total} {pl(a.total, "parcela paga", "parcelas pagas")}</span><span className="num">{a.pct}%</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/50" role="progressbar" aria-valuenow={a.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Parcelas pagas">
        <div className="h-full rounded-full bg-fixo-teal-950" style={{ width: `${a.pct}%` }} />
      </div>
      <div className="num mt-1 flex flex-wrap justify-between gap-x-3 text-xs"><span>Pago {brl(a.valorPago)}</span><span>Falta {brl(a.falta)}</span></div>
    </div>
  );
}

/* ------------------------------ Painel das renegociadas ------------------------------ */

type FiltroNeg = "andamento" | "quitada" | "cancelada" | "todas";

export function PainelRenegociadas({ contas, onAbrir, rodape }: { contas: Conta[]; onAbrir: (id: string) => void; rodape?: ReactNode }) {
  const { filtrar } = useUnidade();
  const { data: todas = [], isLoading } = useRows<Negociacao>("pagar_negociacoes", { order: "created_at", ascending: false });
  const { data: fornecedores = [] } = useRows<{ id: string; nome: string }>("fornecedores", { select: "id, nome", order: "nome", ascending: true, key: ["nomes"] });
  const [filtro, setFiltro] = useState<FiltroNeg>("andamento");
  const lista = filtrar(todas);
  const porNeg = useMemo(() => {
    const m = new Map<string, Conta[]>();
    for (const c of contas) if (c.negociacao_id) m.set(c.negociacao_id, [...(m.get(c.negociacao_id) ?? []), c]);
    return m;
  }, [contas]);
  const naFiltro = (n: Negociacao) => filtro === "todas" || (filtro === "andamento" ? n.situacao === "negociando" || n.situacao === "acordo" : n.situacao === filtro);
  const contagem = (f: FiltroNeg) => lista.filter((n) => f === "todas" || (f === "andamento" ? n.situacao === "negociando" || n.situacao === "acordo" : n.situacao === f)).length;
  const mostradas = lista.filter(naFiltro);

  return (
    <section aria-label="Contas renegociadas">
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Situação da negociação">
        {([["andamento", "Em andamento"], ["quitada", "Quitadas"], ["cancelada", "Canceladas"], ["todas", "Todas"]] as const).map(([f, r]) => (
          <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${filtro === f ? "border-transparent text-fixo-teal-950 shadow-card" : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`}
            style={filtro === f ? { background: COR_RENEGOCIADA.fundo } : undefined}>
            {r} <span className="num opacity-80">{contagem(f)}</span>
          </button>
        ))}
      </div>
      {!isLoading && !mostradas.length && (
        <div className="rounded-2xl border border-dashed border-teal-300 bg-fixo-teal-50 p-5 text-sm text-fixo-teal-900">
          <p className="font-bold">Nenhuma renegociação {filtro === "andamento" ? "em andamento" : "aqui"}.</p>
          <p className="mt-1">Para renegociar: marque as contas na lista e toque em <b>Renegociar</b> (ou no menu ⋯ da conta → <b>Renegociar…</b>). O acordo, as parcelas pagas e o histórico (áudios, prints e arquivos) ficam aqui.</p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {mostradas.map((n) => {
          const cs = porNeg.get(n.id) ?? [];
          const a = andamento(cs);
          const s = SITUACOES_NEGOCIACAO[n.situacao];
          const forn = fornecedores.find((f) => f.id === n.fornecedor_id)?.nome;
          return (
            <article key={n.id} className="cartao overflow-hidden">
              <button type="button" onClick={() => onAbrir(n.id)} className="block w-full p-4 text-left hover:brightness-105" style={{ background: COR_RENEGOCIADA.fundo, color: COR_RENEGOCIADA.tinta }}
                title="Abrir o histórico da negociação">
                <div className="flex items-start gap-2">
                  <Handshake size={18} className="mt-0.5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-bold leading-snug">{n.titulo}</div>
                    {forn && <div className="truncate text-xs font-semibold opacity-90">{forn}</div>}
                  </div>
                  <EtiquetaUnidade id={n.unidade_id} />
                </div>
                <div className="num mt-2 text-xs">
                  Contas <b>{brl(n.valor_original)}</b>{n.valor_acordo != null && <> → acordo <b>{brl(n.valor_acordo)}</b>{n.parcelas ? ` em ${n.parcelas}x` : ""}</>}
                </div>
                <div className="mt-2"><BarraAndamento a={a} /></div>
              </button>
              <div className="flex flex-wrap items-center gap-2 p-3 text-xs">
                <span title={s.dica} className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.chip}`}>{s.rotulo}</span>
                {a.proxima && <span className="text-slate-600">Próxima: <b className="num text-fg">{dataBR(a.proxima.vencimento)}</b> · <span className="num">{brl(a.proxima.valor)}</span></span>}
                <Button variant="secondary" className="ml-auto" onClick={() => onAbrir(n.id)}><StickyNote size={15} /> Histórico</Button>
              </div>
            </article>
          );
        })}
      </div>
      {rodape}
    </section>
  );
}

/* ------------------------------ Histórico da negociação ------------------------------ */

const ICONE_EVENTO: Record<TipoEvento | "pagamento", typeof FileText> = { nota: StickyNote, audio: Mic, print: Imagem, arquivo: Paperclip, acordo: Handshake, pagamento: Wallet };
const COR_EVENTO: Record<TipoEvento | "pagamento", string> = {
  nota: "bg-slate-100 text-slate-700", audio: "bg-orange-100 text-orange-800", print: "bg-sky-100 text-sky-800",
  arquivo: "bg-indigo-100 text-indigo-800", acordo: "bg-fixo-teal-100 text-fixo-teal-900", pagamento: "bg-emerald-100 text-emerald-800",
};

/** Arquivo do histórico: áudio toca aqui, print aparece em miniatura, o resto abre numa aba. Link temporário (10 min). */
function ArquivoEvento({ e }: { e: EventoNegociacao }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (e.arquivo_caminho) supabase.storage.from("documentos").createSignedUrl(e.arquivo_caminho, 600).then(({ data }) => { if (vivo) setUrl(data?.signedUrl ?? null); });
    return () => { vivo = false; };
  }, [e.arquivo_caminho]);
  if (!e.arquivo_caminho) return null;
  if (!url) return <span className="text-xs text-slate-500">Carregando o arquivo…</span>;
  if (e.arquivo_tipo?.startsWith("audio/")) return <audio controls preload="none" src={url} className="mt-1 w-full max-w-sm" aria-label={e.arquivo_nome ?? "Áudio"} />;
  if (e.arquivo_tipo?.startsWith("image/")) return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block w-fit" title="Abrir o print">
      <img src={url} alt={e.arquivo_nome ?? "Print"} className="max-h-48 max-w-full rounded-lg border border-slate-200 object-contain" />
    </a>
  );
  return <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand underline"><FileText size={14} aria-hidden /> {e.arquivo_nome ?? "Abrir o arquivo"}</a>;
}

export function HistoricoNegociacao({ id, contas, onClose }: { id: string; contas: Conta[]; onClose: () => void }) {
  const { pode, papel, user_id, nome } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const invalidar = useInvalidate();
  const dia = hoje();
  const { data: negs = [] } = useRows<Negociacao>("pagar_negociacoes", { order: "created_at", ascending: false });
  const { data: todosEventos = [] } = useRows<EventoNegociacao>("pagar_negociacao_eventos", { order: "quando", ascending: false });
  const { data: fornecedores = [] } = useRows<{ id: string; nome: string }>("fornecedores", { select: "id, nome", order: "nome", ascending: true, key: ["nomes"] });
  const n = negs.find((x) => x.id === id);
  const cs = contas.filter((c) => c.negociacao_id === id);
  const acordo = cs.filter((c) => c.negociacao_papel === "acordo").sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const originais = cs.filter((c) => c.negociacao_papel === "original").sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const a = andamento(cs);
  const linha = linhaDoTempo(todosEventos.filter((e) => e.negociacao_id === id), cs, brl);

  // novo registro no histórico
  const [tipo, setTipo] = useState<TipoEvento>("nota");
  const [quando, setQuando] = useState(dia);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // gravar áudio aqui (quando o navegador deixa usar o microfone)
  const [gravando, setGravando] = useState(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const podeGravar = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

  async function gravar() {
    if (gravando) { gravador.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      pedacos.current = [];
      r.ondataavailable = (ev) => { if (ev.data.size) pedacos.current.push(ev.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const mime = r.mimeType || "audio/webm";
        const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
        setArquivo(new File(pedacos.current, `audio-${dia}.${ext}`, { type: mime }));
        setTipo("audio");
      };
      gravador.current = r;
      r.start();
      setGravando(true);
    } catch {
      notify("Não deu para usar o microfone. Envie o áudio como arquivo (ex.: o áudio do WhatsApp).", "erro");
    }
  }
  useEffect(() => () => gravador.current?.stop(), []);

  async function adicionar(ev: FormEvent) {
    ev.preventDefault();
    if (!texto.trim() && !arquivo) return notify("Escreva o que aconteceu ou anexe um arquivo", "erro");
    if (arquivo && arquivo.size > LIMITE) return notify("Arquivo maior que 20 MB", "erro");
    setOcupado(true);
    let caminho: string | null = null;
    try {
      if (arquivo) {
        caminho = `conta_pagar/negociacao-${id}/${crypto.randomUUID()}-${nomeArquivoLimpo(arquivo.name)}`;
        const { error } = await supabase.storage.from("documentos").upload(caminho, arquivo, { contentType: arquivo.type || "application/octet-stream" });
        if (error) throw error;
      }
      const { error } = await supabase.from("pagar_negociacao_eventos").insert({
        negociacao_id: id, tipo: arquivo && tipo === "nota" ? tipoPeloArquivo(arquivo.type) : tipo, quando, texto: texto.trim() || null,
        arquivo_caminho: caminho, arquivo_nome: arquivo?.name ?? null, arquivo_tipo: arquivo?.type || null, criado_nome: nome,
      });
      if (error) throw error;
      notify("Registrado no histórico");
      setTexto(""); setArquivo(null); setTipo("nota"); setQuando(dia);
      if (input.current) input.current.value = "";
      invalidar("pagar_negociacao_eventos");
    } catch (err) {
      if (caminho) await supabase.storage.from("documentos").remove([caminho]);
      notifyError(err);
    } finally {
      setOcupado(false);
    }
  }
  async function apagar(e: EventoNegociacao) {
    if (!(await confirmar("Apagar este registro do histórico?", { perigo: true }))) return;
    const { error } = await supabase.from("pagar_negociacao_eventos").delete().eq("id", e.id);
    if (error) return notifyError(error);
    if (e.arquivo_caminho) await supabase.storage.from("documentos").remove([e.arquivo_caminho]);
    invalidar("pagar_negociacao_eventos");
  }

  async function mudarSituacao(s: SituacaoNegociacao) {
    const { error } = await supabase.from("pagar_negociacoes").update({ situacao: s }).eq("id", id);
    if (error) return notifyError(error);
    notify(`Negociação: ${SITUACOES_NEGOCIACAO[s].rotulo.toLowerCase()}`);
    invalidar("pagar_negociacoes");
  }

  const forn = fornecedores.find((f) => f.id === n?.fornecedor_id)?.nome;
  const aceita = tipo === "audio" ? "audio/*" : tipo === "print" ? "image/*" : undefined;
  return (
    <Modal open onClose={onClose} title="Histórico da negociação" wide>
      {!n ? <p className="text-sm text-slate-500">Carregando…</p> : (
        <div className="space-y-4 text-sm">
          <div className="rounded-2xl p-4" style={{ background: COR_RENEGOCIADA.fundo, color: COR_RENEGOCIADA.tinta }}>
            <div className="flex flex-wrap items-start gap-2">
              <Handshake size={22} className="shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold leading-tight">{n.titulo}</div>
                <div className="text-xs font-semibold opacity-90">{[forn, n.criado_nome && `aberta por ${n.criado_nome}`, `em ${dataBR(n.created_at.slice(0, 10))}`].filter(Boolean).join(" · ")}</div>
              </div>
              {podeEditar ? (
                <label className="flex w-full flex-col text-xs font-bold sm:w-auto">Situação
                  <select className="input mt-0.5 h-9 w-full bg-white/90 text-fixo-teal-950 sm:w-auto" value={n.situacao} onChange={(e) => mudarSituacao(e.target.value as SituacaoNegociacao)}>
                    {(Object.keys(SITUACOES_NEGOCIACAO) as SituacaoNegociacao[]).map((s) => <option key={s} value={s}>{SITUACOES_NEGOCIACAO[s].rotulo}</option>)}
                  </select>
                </label>
              ) : <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SITUACOES_NEGOCIACAO[n.situacao].chip}`}>{SITUACOES_NEGOCIACAO[n.situacao].rotulo}</span>}
            </div>
            <div className="num mt-2 text-xs">Contas <b>{brl(n.valor_original)}</b>{n.valor_acordo != null && <> → acordo <b>{brl(n.valor_acordo)}</b>{n.parcelas ? ` em ${n.parcelas}x` : ""}</>}</div>
            <div className="mt-2 max-w-md"><BarraAndamento a={a} /></div>
            {a.quitada && n.situacao !== "quitada" && podeEditar && (
              <button type="button" onClick={() => mudarSituacao("quitada")} className="mt-2 rounded-lg bg-fixo-teal-950 px-3 py-1.5 text-xs font-bold text-white hover:brightness-125">Todas pagas: marcar como quitada</button>
            )}
            {n.observacoes && <p className="mt-2 whitespace-pre-line rounded-lg bg-white/50 p-2 text-xs">{n.observacoes}</p>}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="Parcelas do acordo">
              <h3 className="mb-1.5 font-bold text-fg">{originais.length ? "Parcelas do acordo" : "Contas da negociação"} <span className="text-slate-500">({acordo.length})</span></h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {acordo.map((c) => {
                  const s = situacaoPagar(c, dia);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-fg">{c.descricao}</span><span className="num text-xs text-slate-500">vence {dataBR(c.vencimento)}</span></span>
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COR_TOM[s.tom]}`}>{s.texto}</span>
                      <span className="num ml-auto text-right font-semibold">{brl(c.valor)}</span>
                    </li>
                  );
                })}
                {!acordo.length && <li className="px-3 py-3 text-slate-500">Nenhuma conta.</li>}
              </ul>
              {originais.length > 0 && <>
                <h3 className="mb-1.5 mt-3 font-bold text-fg">Contas trocadas pelo acordo <span className="text-slate-500">({originais.length})</span></h3>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
                  {originais.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-slate-600">
                      <span className="min-w-0 flex-1 truncate">{dataBR(c.vencimento)} · {c.descricao}</span><span className="num font-semibold line-through">{brl(c.valor)}</span>
                    </li>
                  ))}
                </ul>
              </>}
            </section>

            <section aria-label="Linha do tempo">
              <h3 className="mb-1.5 font-bold text-fg">Linha do tempo</h3>
              {podeEditar && (
                <form onSubmit={adicionar} className="mb-3 space-y-2 rounded-xl border border-teal-200 bg-fixo-teal-50 p-3">
                  <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tipo do registro">
                    {(["nota", "audio", "print", "arquivo"] as const).map((t) => {
                      const Icone = ICONE_EVENTO[t];
                      return (
                        <button key={t} type="button" role="radio" aria-checked={tipo === t} title={TIPOS_EVENTO[t].dica} onClick={() => setTipo(t)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${tipo === t ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-surface text-slate-700 hover:bg-slate-50"}`}>
                          <Icone size={13} aria-hidden /> {TIPOS_EVENTO[t].rotulo}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[9.5rem_1fr]">
                    <Field label="Data"><input className="input" type="date" required value={quando} max={dia} onChange={(e) => setQuando(e.target.value)} /></Field>
                    <Field label={tipo === "nota" ? "O que aconteceu" : "Descrição (opcional)"}>
                      <input className="input" maxLength={4000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={TIPOS_EVENTO[tipo].dica} />
                    </Field>
                  </div>
                  {tipo !== "nota" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input ref={input} type="file" accept={aceita} className="min-w-0 max-w-full text-xs" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} aria-label="Arquivo" />
                      {tipo === "audio" && podeGravar && (
                        <Button type="button" variant={gravando ? "danger" : "secondary"} onClick={gravar}>
                          {gravando ? <><Square size={14} /> Parar</> : <><Mic size={14} /> Gravar aqui</>}
                        </Button>
                      )}
                      {arquivo && <span className="text-xs text-slate-600">{arquivo.name}</span>}
                    </div>
                  )}
                  <div className="flex justify-end"><Button disabled={ocupado || gravando}>{ocupado ? "Salvando…" : "Adicionar ao histórico"}</Button></div>
                </form>
              )}
              <ol className="space-y-2">
                {linha.map((it, i) => {
                  const Icone = ICONE_EVENTO[it.tipo];
                  const e = it.evento;
                  const meu = !!e && (papel === "admin" || e.criado_por === user_id);
                  return (
                    <li key={e?.id ?? `p${i}`} className="cartao flex gap-2.5 p-2.5">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${COR_EVENTO[it.tipo]}`}><Icone size={15} aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                          <b className="num text-fg">{dataBR(it.quando)}</b><span>{it.tipo === "pagamento" ? "Pagamento" : TIPOS_EVENTO[it.tipo].rotulo}</span>{e?.criado_nome && <span>· {e.criado_nome}</span>}
                        </div>
                        {it.texto && (!e?.arquivo_caminho || it.texto !== e.arquivo_nome) && <p className="whitespace-pre-line text-fg">{it.texto}</p>}
                        {e && <ArquivoEvento e={e} />}
                      </div>
                      {meu && e.tipo !== "acordo" && <button type="button" onClick={() => apagar(e)} className="self-start rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Apagar este registro" aria-label="Apagar este registro"><Trash2 size={15} /></button>}
                    </li>
                  );
                })}
                {!linha.length && <li className="text-slate-500">Nada registrado ainda.</li>}
              </ol>
            </section>
          </div>
          <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
        </div>
      )}
    </Modal>
  );
}
