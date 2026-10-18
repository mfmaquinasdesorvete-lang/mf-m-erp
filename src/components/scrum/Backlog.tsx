// Backlog da equipe: tudo o que ainda não está numa sprint, na ordem de prioridade. Anotar rápido, subir e descer,
// mandar para a sprint e (equipe do ERP Line) trazer as Ideias do Sobre o ERP Line.
import { useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Lightbulb, Plus, ThumbsUp } from "lucide-react";
import { Button, Card, Modal } from "@/components/ui";
import { useItensProjeto } from "@/components/sobre/ItemProjeto";
import { useInvalidate } from "@/lib/data";
import { pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { ativo, type ItemProjeto } from "@/lib/projeto";
import {
  FIBONACCI, ROTULO_STATUS, moverNoBacklog, ordenarBacklog, prioridadeNoFim, somaPontos, sprintsParaBacklog,
  type ItemScrum, type Sprint, type TimeScrum, type TipoItem,
} from "@/lib/scrum";
import { Avatar, ChipTarefas, ChipTipo, Pontos, primeiroNome, type Pessoa } from "./comum";

export function Backlog({ time, itens, destino, media, pessoas, onAbrir }: {
  time: TimeScrum; itens: ItemScrum[]; destino: Sprint | null; media: number | null; pessoas: Pessoa[];
  onAbrir: (i: ItemScrum | null) => void;
}) {
  const invalidar = useInvalidate();
  const lista = useMemo(() => ordenarBacklog(itens), [itens]);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoItem>("historia");
  const [pontos, setPontos] = useState<string>("");
  const [ideias, setIdeias] = useState(false);
  const total = somaPontos(lista);
  const semPontos = lista.filter((i) => i.pontos == null).length;
  const previsao = sprintsParaBacklog(total, media);
  const ehErpLine = time.nome.trim().toLowerCase() === "erp line";

  async function anotar(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    const { error } = await supabase.from("scrum_itens").insert({
      time_id: time.id, titulo: titulo.trim(), tipo, pontos: pontos === "" ? null : Number(pontos), prioridade: prioridadeNoFim(lista),
    });
    if (error) return notifyError(error);
    setTitulo(""); setPontos("");
    invalidar("scrum_itens");
  }

  async function mover(id: string, direcao: -1 | 1) {
    const mudancas = moverNoBacklog(lista, id, direcao);
    for (const m of mudancas) {
      const { error } = await supabase.from("scrum_itens").update({ prioridade: m.prioridade }).eq("id", m.id);
      if (error) { notifyError(error); break; }
    }
    invalidar("scrum_itens");
  }

  async function paraSprint(i: ItemScrum) {
    if (!destino) return notify("Crie a próxima sprint na aba Sprints para mandar itens para ela.", "erro");
    const { error } = await supabase.from("scrum_itens").update({ sprint_id: destino.id }).eq("id", i.id);
    if (error) return notifyError(error);
    invalidar("scrum_itens");
    notify(`"${i.titulo}" foi para a sprint ${destino.numero}.`);
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <form onSubmit={anotar} className="flex flex-wrap items-center gap-2">
          <input className="input h-10 min-w-0 flex-1 basis-64" placeholder="Anotar item no backlog (Enter para salvar)" aria-label="Título do item" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} />
          <select className="input h-10 w-auto" aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoItem)}>
            <option value="historia">História</option><option value="tarefa">Tarefa</option><option value="bug">Problema</option><option value="melhoria">Melhoria</option>
          </select>
          <select className="input h-10 w-auto" aria-label="Pontos" value={pontos} onChange={(e) => setPontos(e.target.value)}>
            <option value="">Pontos?</option>
            {FIBONACCI.map((p) => <option key={p} value={p}>{p} pts</option>)}
          </select>
          <Button type="submit" disabled={!titulo.trim()}><Plus size={16} aria-hidden /> Anotar</Button>
          <Button type="button" variant="secondary" onClick={() => onAbrir(null)}>Com detalhes</Button>
          {ehErpLine && <Button type="button" variant="secondary" onClick={() => setIdeias(true)}><Lightbulb size={16} aria-hidden /> Trazer das Ideias</Button>}
        </form>
        <p className="mt-2 text-[13px] text-slate-600">
          <b className="num">{lista.length}</b> {pl(lista.length, "item", "itens")} · <b className="num">{total}</b> pontos
          {previsao != null && <> · cerca de <b className="num">{previsao}</b> {pl(previsao, "sprint", "sprints")} na velocidade de agora ({media} pts por sprint)</>}
          {semPontos > 0 && <span className="text-amber-700"> · {semPontos} sem pontos: estime na reunião de refinamento</span>}
        </p>
      </Card>

      {!lista.length ? (
        <Card className="p-8 text-center text-sm text-slate-500">Backlog vazio. Anote acima o que a equipe precisa fazer; o mais importante fica no alto.</Card>
      ) : (
        <ol className="space-y-2">
          {lista.map((i, k) => (
            <li key={i.id}>
              <Card className="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
                <span className="num w-7 shrink-0 text-center text-sm font-extrabold text-slate-400">{k + 1}</span>
                <div className="flex shrink-0 flex-col">
                  <button type="button" onClick={() => mover(i.id, -1)} disabled={k === 0} aria-label="Subir prioridade" className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => mover(i.id, 1)} disabled={k === lista.length - 1} aria-label="Descer prioridade" className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={15} /></button>
                </div>
                <button type="button" onClick={() => onAbrir(i)} className="min-w-0 flex-1 text-left">
                  <span className="line-clamp-2 text-sm font-semibold text-fg">{i.titulo}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ChipTipo tipo={i.tipo} />
                    <Pontos pontos={i.pontos} />
                    <ChipTarefas item={i} />
                    {i.status !== "a_fazer" && <span className="text-[11px] font-semibold text-sky-700">{ROTULO_STATUS[i.status]} (veio de sprint anterior)</span>}
                    {i.ideia_id && <span className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-700"><Lightbulb size={12} aria-hidden /> Ideia</span>}
                    {i.responsavel_id && <span className="flex items-center gap-1 text-[11px] text-slate-500"><Avatar nome={primeiroNome(pessoas, i.responsavel_id)} cor={time.cor} tamanho={18} />{primeiroNome(pessoas, i.responsavel_id)}</span>}
                  </span>
                </button>
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => paraSprint(i)} title={destino ? `Mandar para a sprint ${destino.numero}` : "Crie a próxima sprint"}>
                  <span className="hidden sm:inline">{destino ? `Sprint ${destino.numero}` : "Sprint"}</span><ArrowRight size={15} aria-hidden />
                </Button>
              </Card>
            </li>
          ))}
        </ol>
      )}
      {ideias && <TrazerIdeias time={time} jaTrazidas={new Set(itens.map((i) => i.ideia_id).filter(Boolean) as string[])} fim={prioridadeNoFim(lista)} onClose={() => setIdeias(false)} />}
    </div>
  );
}

/** Ideias do Sobre o ERP Line que ainda não estão no Scrum: escolher e trazer para o backlog do ERP Line. */
function TrazerIdeias({ time, jaTrazidas, fim, onClose }: { time: TimeScrum; jaTrazidas: Set<string>; fim: number; onClose: () => void }) {
  const invalidar = useInvalidate();
  const { data: itens = [], isLoading } = useItensProjeto();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  // quanto mais votos, mais no alto
  const ideias = itens.filter((i) => i.tipo === "ideia" && ativo(i) && !jaTrazidas.has(i.id)).sort((a, b) => b.votos.length - a.votos.length);
  const marcar = (id: string) => setMarcadas((m) => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function trazer() {
    const escolhidas = ideias.filter((i) => marcadas.has(i.id));
    if (!escolhidas.length) return;
    setSalvando(true);
    const linhas = escolhidas.map((i: ItemProjeto, k) => ({
      time_id: time.id, ideia_id: i.id, titulo: i.titulo.slice(0, 200), descricao: i.detalhe, tipo: "melhoria",
      pontos: i.esforco === "pequeno" ? 2 : i.esforco === "medio" ? 5 : i.esforco === "grande" ? 13 : null, prioridade: fim + k * 10,
    }));
    const { error } = await supabase.from("scrum_itens").insert(linhas);
    setSalvando(false);
    if (error) return notifyError(error);
    invalidar("scrum_itens");
    notify(`${linhas.length} ${pl(linhas.length, "ideia trazida", "ideias trazidas")} para o backlog.`);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Trazer das Ideias">
      <p className="mb-3 text-sm text-slate-600">Ideias ainda abertas no Sobre o ERP Line → Ideias, das mais votadas para as menos. O esforço vira uma primeira estimativa de pontos (pequeno 2, médio 5, grande 13).</p>
      {isLoading ? <p className="text-sm text-slate-500">Carregando…</p> : !ideias.length ? <p className="text-sm text-slate-500">Nenhuma ideia aberta fora do Scrum.</p> : (
        <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {ideias.map((i) => (
            <li key={i.id}>
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${marcadas.has(i.id) ? "border-modulo bg-modulo/10" : "border-slate-200"}`}>
                <input type="checkbox" className="mt-0.5" checked={marcadas.has(i.id)} onChange={() => marcar(i.id)} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-fg">{i.titulo}</span>
                  {i.detalhe && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{i.detalhe}</span>}
                </span>
                <span className="num flex shrink-0 items-center gap-0.5 text-xs font-semibold text-slate-500"><ThumbsUp size={12} aria-hidden />{i.votos.length}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={!marcadas.size || salvando} onClick={trazer}>Trazer {marcadas.size || ""}</Button>
      </div>
    </Modal>
  );
}
