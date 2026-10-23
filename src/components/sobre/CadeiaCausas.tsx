// Cadeia de causas: explica um efeito ligando os eventos em sequência. Fato (com a evidência) tem borda cheia;
// hipótese tem borda tracejada; a ligação diz se a causa é comprovada, provável ou só correlação. Toda cadeia
// nasce "em revisão" e outra pessoa revisa; o banco não deixa chamar de comprovada a ligação sem evidência.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Ban, CheckCircle2, ClipboardCopy, FileSearch, GitCommitVertical, HelpCircle, Paperclip, Pencil, Plus, RotateCcw, Search, Trash2, Waypoints,
} from "lucide-react";
import { Button, Card, chip, Field, Modal, Stat } from "@/components/ui";
import { ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { pedirTexto } from "@/components/Dialogos";
import { usePerfil } from "@/lib/auth";
import { useInvalidate, useRows } from "@/lib/data";
import { hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import {
  DICA_LIGACAO, ROTULO_LIGACAO, ROTULO_SITUACAO_CADEIA, ROTULO_TIPO, avisosCadeia, elosVazios, forcaCadeia, problemaCadeia, textoCadeia,
  type Cadeia, type Elo, type Ligacao, type SituacaoCadeia,
} from "@/lib/causas";
import { AREAS, ChipArea, dataCurta } from "./ItemProjeto";
import { copiar } from "./Guardanapo";

type Visao = SituacaoCadeia | "todas";
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COR_FORCA: Record<Ligacao, string> = {
  comprovada: "bg-emerald-100 text-emerald-800", provavel: "bg-amber-100 text-amber-800", correlacao: "bg-slate-200 text-slate-700",
};
const COR_SITUACAO: Record<SituacaoCadeia, string> = {
  em_revisao: "bg-amber-100 text-amber-800", revisada: "bg-emerald-100 text-emerald-800", descartada: "bg-slate-100 text-slate-500 line-through",
};

export function CadeiaCausas() {
  const { data: cadeias = [], isLoading } = useRows<Cadeia>("cadeias_causa", { order: "created_at", ascending: false });
  const [visao, setVisao] = useState<Visao>("em_revisao");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [editando, setEditando] = useState<Cadeia | "nova" | null>(null);
  const termo = semAcento(busca.trim());
  const base = cadeias.filter((c) => !termo || semAcento(`${c.titulo} ${c.efeito} ${c.elos.map((e) => e.texto).join(" ")}`).includes(termo));
  const lista = base.filter((c) => visao === "todas" || c.situacao === visao);
  const atual = cadeias.find((c) => c.id === aberta) ?? lista[0] ?? null;
  const vivas = cadeias.filter((c) => c.situacao !== "descartada");
  const hipoteses = vivas.reduce((s, c) => s + c.elos.filter((e) => e.tipo === "hipotese").length, 0);
  const correlacoes = vivas.reduce((s, c) => s + c.elos.filter((e) => e.ligacao === "correlacao").length, 0);
  useEffect(() => { if (aberta && !cadeias.some((c) => c.id === aberta)) setAberta(null); }, [cadeias, aberta]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
        <Stat label="Em revisão" valor={cadeias.filter((c) => c.situacao === "em_revisao").length} icon={FileSearch} tom="atencao" onClick={() => setVisao("em_revisao")} sub="esperando outra pessoa" />
        <Stat label="Revisadas" valor={cadeias.filter((c) => c.situacao === "revisada").length} icon={CheckCircle2} tom="bom" onClick={() => setVisao("revisada")} />
        <Stat label="Hipóteses a conferir" valor={hipoteses} icon={HelpCircle} tom={hipoteses ? "atencao" : "bom"} onClick={() => setVisao("todas")} sub="ainda sem prova" />
        <Stat label="Só correlação" valor={correlacoes} icon={Waypoints} tom={correlacoes ? "critico" : "bom"} onClick={() => setVisao("todas")} sub="ligações que não provam causa" />
        <Stat label="Cadeias" valor={cadeias.length} icon={GitCommitVertical} onClick={() => setVisao("todas")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input h-10 pl-9" type="search" placeholder="Buscar cadeia" aria-label="Buscar cadeia" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Button className="ml-auto" onClick={() => setEditando("nova")}><Plus size={16} /> Nova cadeia</Button>
      </div>
      <ChipsSituacao valor={visao} onChange={setVisao} rotulo="Situação"
        opcoes={([["em_revisao", "Em revisão"], ["revisada", "Revisadas"], ["descartada", "Descartadas"], ["todas", "Todas"]] as [Visao, string][])
          .map(([v, l]) => ({ value: v, label: l, n: base.filter((c) => v === "todas" || c.situacao === v).length }))} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 p-2 lg:self-start">
          {!lista.length && !isLoading && <p className="p-4 text-sm text-slate-500">Nenhuma cadeia aqui. Use "Nova cadeia" para explicar um problema.</p>}
          <ul className="space-y-1">
            {lista.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setAberta(c.id)} aria-pressed={atual?.id === c.id}
                  className={`linha-clicavel p-3 ${atual?.id === c.id ? "bg-modulo/10 ring-1 ring-modulo" : ""}`}>
                  <span className="block text-sm font-bold leading-snug text-fg">{c.titulo}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR_SITUACAO[c.situacao]}`}>{ROTULO_SITUACAO_CADEIA[c.situacao]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR_FORCA[forcaCadeia(c.elos)]}`}>{ROTULO_LIGACAO[forcaCadeia(c.elos)]}</span>
                    <span className="text-2xs text-slate-500">{c.elos.length} {pl(c.elos.length, "elo", "elos")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="min-w-0 lg:col-span-2">
          {atual ? <Diagrama c={atual} onEditar={() => setEditando(atual)} /> : !isLoading && <Card className="p-6 text-sm text-slate-500">Escolha uma cadeia na lista.</Card>}
        </div>
      </div>

      {editando && <EditorCadeia cadeia={editando === "nova" ? null : editando} onClose={() => setEditando(null)} onSalva={(id) => { setAberta(id); setVisao("em_revisao"); }} />}
    </div>
  );
}

/** A cadeia desenhada de cima para baixo: elos, ligações e o efeito no fim. */
function Diagrama({ c, onEditar }: { c: Cadeia; onEditar: () => void }) {
  const { user_id, papel } = usePerfil();
  const invalidate = useInvalidate();
  const dia = hoje();
  const forca = forcaCadeia(c.elos);
  const avisos = avisosCadeia(c);
  const podeRevisar = c.criado_por !== user_id || papel === "admin";
  async function revisar(s: SituacaoCadeia) {
    let motivo: string | null = null;
    if (s === "descartada") {
      motivo = await pedirTexto("Por que esta cadeia deixa de valer? (ex.: a causa era outra)", "", { titulo: "Descartar cadeia", ok: "Descartar", minimo: 5 });
      if (!motivo) return;
    }
    const { error } = await supabase.rpc("revisar_cadeia", { p_id: c.id, p_situacao: s, p_motivo: motivo });
    if (error) return notifyError(error);
    notify(`Cadeia ${ROTULO_SITUACAO_CADEIA[s].toLowerCase()}`);
    invalidate("cadeias_causa");
  }
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-fg">{c.titulo}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR_SITUACAO[c.situacao]}`}>{ROTULO_SITUACAO_CADEIA[c.situacao]}</span>
            <ChipArea area={c.area} />
            {c.criado_nome && <span>por {c.criado_nome} · {dataCurta(c.created_at, dia)}</span>}
            {c.revisado_nome && <span>· revisada por {c.revisado_nome} em {dataCurta(c.revisado_em, dia)}</span>}
            {c.motivo && <span>· descartada: {c.motivo}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" className="!min-h-0 !px-2.5 !py-1.5" onClick={() => copiar(textoCadeia(c), "Cadeia copiada")}><ClipboardCopy size={15} /> Copiar</Button>
          {c.situacao !== "descartada" && <Button variant="secondary" className="!min-h-0 !px-2.5 !py-1.5" onClick={onEditar}><Pencil size={15} /> Editar</Button>}
          {c.situacao === "em_revisao" && (
            <Button className="!min-h-0 !px-2.5 !py-1.5" disabled={!podeRevisar} title={podeRevisar ? "Conferi os fatos e as ligações" : "A revisão é de outra pessoa"} onClick={() => revisar("revisada")}>
              <CheckCircle2 size={15} /> Marcar revisada
            </Button>
          )}
          {c.situacao !== "em_revisao" && <Button variant="secondary" className="!min-h-0 !px-2.5 !py-1.5" onClick={() => revisar("em_revisao")}><RotateCcw size={15} /> Voltar a revisão</Button>}
          {c.situacao !== "descartada" && <Button variant="ghost" className="!min-h-0 !px-2.5 !py-1.5 !text-red-600" onClick={() => revisar("descartada")}><Ban size={15} /> Descartar</Button>}
        </div>
      </div>

      <ol className="mt-4 flex flex-col items-stretch">
        {c.elos.map((e, k) => (
          <li key={k} className="flex flex-col items-center">
            <div className={`w-full max-w-xl rounded-xl border-2 p-3 ${e.tipo === "fato" ? "border-slate-400 bg-surface" : "border-dashed border-amber-400 bg-amber-50/60"}`}>
              <div className="flex items-start gap-2">
                <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white ring-1 ring-slate-300">{k + 1}</span>
                <div className="min-w-0 flex-1">
                  <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide ${e.tipo === "fato" ? "bg-ink text-white ring-1 ring-slate-300" : "bg-amber-400 text-amber-950"}`}>{ROTULO_TIPO[e.tipo]}</span>
                  <span className="text-sm font-semibold leading-snug text-fg">{e.texto}</span>
                  {e.evidencia?.trim()
                    ? <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-slate-600"><Paperclip size={12} className="mt-0.5 shrink-0" aria-hidden /> <span><b>Evidência:</b> {e.evidencia}</span></p>
                    : <p className="mt-1 text-xs font-semibold text-amber-800">Sem evidência ainda: confira antes de agir.</p>}
                </div>
              </div>
            </div>
            <Ligacao l={e.ligacao} />
          </li>
        ))}
        <li className="flex justify-center">
          <div className="w-full max-w-xl rounded-xl bg-ink p-3 text-white shadow-card">
            <span className="mr-1.5 inline-block rounded bg-white/20 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide">Efeito</span>
            <span className="text-sm font-semibold">{c.efeito}</span>
          </div>
        </li>
      </ol>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Força da explicação</p>
          <p className="mt-1"><span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${COR_FORCA[forca]}`}>{ROTULO_LIGACAO[forca]}</span></p>
          <p className="mt-1 text-xs text-slate-600">Vale o elo mais fraco. {DICA_LIGACAO[forca]}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Conclusão</p>
          <p className="mt-1 whitespace-pre-line text-sm text-fg">{c.conclusao || <span className="text-slate-500">Sem conclusão escrita.</span>}</p>
        </div>
      </div>
      {avisos.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {avisos.map((a) => <li key={a} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {a}</li>)}
        </ul>
      )}
    </Card>
  );
}

/** A ligação entre dois elos: cheia (comprovada), tracejada (provável) ou pontilhada sem ponta (só correlação). */
function Ligacao({ l }: { l: Ligacao }) {
  const traco = l === "comprovada" ? "border-solid border-slate-600" : l === "provavel" ? "border-dashed border-amber-500" : "border-dotted border-slate-400";
  return (
    <div className="flex items-center gap-2 py-1" title={DICA_LIGACAO[l]}>
      <span className={`h-8 border-l-[3px] ${traco}`} aria-hidden />
      {l !== "correlacao" ? <ArrowDown size={14} className={l === "comprovada" ? "text-slate-600" : "text-amber-600"} aria-hidden /> : <span className="text-slate-400" aria-hidden>≈</span>}
      <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR_FORCA[l]}`}>{ROTULO_LIGACAO[l]}</span>
    </div>
  );
}

function EditorCadeia({ cadeia, onClose, onSalva }: { cadeia: Cadeia | null; onClose: () => void; onSalva: (id: string) => void }) {
  const [titulo, setTitulo] = useState(cadeia?.titulo ?? "");
  const [efeito, setEfeito] = useState(cadeia?.efeito ?? "");
  const [area, setArea] = useState(cadeia?.area ?? "geral");
  const [elos, setElos] = useState<Elo[]>(cadeia?.elos?.length ? cadeia.elos.map((e) => ({ ...e, evidencia: e.evidencia ?? "" })) : elosVazios());
  const [conclusao, setConclusao] = useState(cadeia?.conclusao ?? "");
  const [salvando, setSalvando] = useState(false);
  const invalidate = useInvalidate();
  const problema = useMemo(() => problemaCadeia(elos), [elos]);
  const avisos = avisosCadeia({ elos, conclusao });
  const muda = (k: number, p: Partial<Elo>) => setElos((l) => l.map((e, n) => (n === k ? { ...e, ...p } : e)));
  const move = (k: number, d: -1 | 1) => setElos((l) => { const c = [...l]; [c[k], c[k + d]] = [c[k + d], c[k]]; return c; });

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (problema) return;
    setSalvando(true);
    const limpos = elos.map((e) => ({ texto: e.texto.trim(), tipo: e.tipo, evidencia: e.evidencia?.trim() || null, ligacao: e.ligacao }));
    const { data, error } = await supabase.rpc("salvar_cadeia", { p_id: cadeia?.id ?? null, p_titulo: titulo, p_efeito: efeito, p_elos: limpos, p_area: area, p_conclusao: conclusao || null });
    setSalvando(false);
    if (error) return notifyError(error);
    notify(cadeia ? "Cadeia alterada: volta para revisão" : "Cadeia anotada: fica em revisão");
    invalidate("cadeias_causa");
    onSalva(data as string);
    onClose();
  }

  return (
    <Modal open wide onClose={onClose} title={cadeia ? "Editar cadeia de causas" : "Nova cadeia de causas"}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Comece pela causa mais antiga e vá até o efeito. <b>Fato</b> é o que aconteceu e dá para mostrar onde (a evidência);
          <b> hipótese</b> é suspeita. A ligação só é <b>comprovada</b> entre dois fatos; quando as coisas só acontecem juntas, é <b>correlação</b>.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Título" className="sm:col-span-2"><input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} required minLength={3} placeholder='Ex.: "Vendas antigas sem conta"' /></Field>
          <Field label="Área"><select className="input" value={area} onChange={(e) => setArea(e.target.value)}>{AREAS.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}</select></Field>
        </div>
        <Field label="O efeito (o que se vê e queremos explicar)"><input className="input" value={efeito} onChange={(e) => setEfeito(e.target.value)} maxLength={300} required minLength={3} /></Field>

        <ol className="space-y-2">
          {elos.map((e, k) => (
            <li key={k} className={`rounded-xl border-2 p-3 ${e.tipo === "fato" ? "border-slate-300" : "border-dashed border-amber-400"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="num grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-bold text-white ring-1 ring-slate-300">{k + 1}</span>
                <div className="flex gap-1" role="group" aria-label={`Elo ${k + 1}: fato ou hipótese`}>
                  {(["fato", "hipotese"] as const).map((t) => (
                    <button key={t} type="button" aria-pressed={e.tipo === t} onClick={() => muda(k, { tipo: t, ...(t === "hipotese" && e.ligacao === "comprovada" ? { ligacao: "provavel" as const } : {}) })}
                      className={chip(e.tipo === t, t === "fato" ? "border-slate-300 bg-ink text-white" : "border-amber-500 bg-amber-400 text-amber-950")}>
                      {ROTULO_TIPO[t]}
                    </button>
                  ))}
                </div>
                <span className="ml-auto flex gap-1">
                  <button type="button" disabled={k === 0} onClick={() => move(k, -1)} className="botao-icone p-1" aria-label="Subir"><ArrowUp size={15} /></button>
                  <button type="button" disabled={k === elos.length - 1} onClick={() => move(k, 1)} className="botao-icone p-1" aria-label="Descer"><ArrowDown size={15} /></button>
                  <button type="button" disabled={elos.length === 1} onClick={() => setElos((l) => l.filter((_, n) => n !== k))} className="botao-icone-perigo p-1 disabled:opacity-30" aria-label="Tirar o elo"><Trash2 size={15} /></button>
                </span>
              </div>
              <input className="input mt-2" value={e.texto} onChange={(ev) => muda(k, { texto: ev.target.value })} maxLength={300} placeholder="O que aconteceu" aria-label={`Elo ${k + 1}: o que aconteceu`} />
              <input className="input mt-2" value={e.evidencia ?? ""} onChange={(ev) => muda(k, { evidencia: ev.target.value })} maxLength={500}
                placeholder={e.tipo === "fato" ? "Evidência: onde se vê (tela, relatório, documento, data)" : "Evidência (se já tiver alguma)"} aria-label={`Elo ${k + 1}: evidência`} />
              <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold">Liga {k === elos.length - 1 ? "ao efeito" : `ao elo ${k + 2}`} como</span>
                <select className="input h-9 w-auto" value={e.ligacao} onChange={(ev) => muda(k, { ligacao: ev.target.value as Ligacao })}>
                  {(["comprovada", "provavel", "correlacao"] as Ligacao[]).map((l) => <option key={l} value={l}>{ROTULO_LIGACAO[l]}</option>)}
                </select>
                <span className="text-xs text-slate-500">{DICA_LIGACAO[e.ligacao]}</span>
              </label>
            </li>
          ))}
        </ol>
        {elos.length < 20 && <Button type="button" variant="secondary" onClick={() => setElos((l) => [...l, ...elosVazios()])}><Plus size={15} /> Elo</Button>}
        <Field label="Conclusão (o que está provado, o que não está e o que fazer)">
          <textarea className="input min-h-[80px]" value={conclusao} onChange={(e) => setConclusao(e.target.value)} maxLength={1500} />
        </Field>
        {problema && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">Para salvar: {problema}.</p>}
        {!problema && avisos.length > 0 && <ul className="space-y-0.5 text-xs text-amber-800">{avisos.map((a) => <li key={a}>• {a}</li>)}</ul>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando || !!problema || titulo.trim().length < 3 || efeito.trim().length < 3}>{salvando ? "Salvando…" : "Salvar (vai para revisão)"}</Button>
        </div>
      </form>
    </Modal>
  );
}
