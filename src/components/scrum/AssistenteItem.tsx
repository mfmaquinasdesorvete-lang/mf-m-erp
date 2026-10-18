// Peças do assistente do item do Scrum: itens parecidos (enquanto escreve o título), lista de tarefas, casos de
// teste e a conversa da equipe com o resumo. As regras ficam em lib/assistenteItem.
import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Lightbulb, MessageSquare, Plus, Rocket, Send, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useItensProjeto } from "@/components/sobre/ItemProjeto";
import { DESTAQUES } from "@/lib/atualizacoes";
import { parecidos, placarTestes, resumirComentarios, type Candidato } from "@/lib/assistenteItem";
import { usePerfil } from "@/lib/auth";
import { ler, useInvalidate } from "@/lib/data";
import { dataBR, dataHoraBR, pl } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { ROTULO_STATUS, type CasoTeste, type ComentarioScrum, type ItemScrum, type Sprint, type Tarefa, type TimeScrum } from "@/lib/scrum";
import { nomeDe, type Pessoa } from "./comum";

/** O que já foi entregue (Sobre → Atualizações), uma frase por entrega */
const ENTREGUES: Candidato[] = Object.entries(DESTAQUES).flatMap(([dia, d]) =>
  d.itens.map((texto, k) => ({ id: `entregue-${dia}-${k}`, titulo: texto, texto, origem: "entregue" as const, detalhe: `Entregue em ${dataBR(dia)} (Atualizações)` })));

/** AI Suggest: o que já existe parecido com o título — itens de qualquer equipe, Ideias abertas e entregas */
export function Parecidos({ titulo, item, itens, times, sprints, onAbrir }: {
  titulo: string; item: ItemScrum | null; itens: ItemScrum[]; times: TimeScrum[]; sprints: Sprint[];
  onAbrir?: (i: ItemScrum) => void;
}) {
  const texto = useDeferredValue(titulo);
  const { data: projeto = [] } = useItensProjeto();
  const lista = useMemo(() => {
    const doScrum: Candidato[] = itens.map((i) => {
      const time = times.find((t) => t.id === i.time_id)?.nome ?? "Equipe";
      const sprint = sprints.find((s) => s.id === i.sprint_id);
      const onde = i.status === "feito" ? "feito" : sprint ? `sprint ${sprint.numero} · ${ROTULO_STATUS[i.status].toLowerCase()}` : "no backlog";
      return { id: i.id, titulo: i.titulo, texto: i.descricao, origem: "scrum", detalhe: `${time} · ${onde}` };
    });
    const ligadas = new Set(itens.map((i) => i.ideia_id).filter(Boolean));
    const ideias: Candidato[] = projeto.filter((p) => p.tipo === "ideia" && !ligadas.has(p.id)).map((p) => ({
      id: p.id, titulo: p.titulo, texto: p.detalhe, origem: "ideia", detalhe: `Ideia · ${p.votos.length} ${pl(p.votos.length, "voto", "votos")}`,
    }));
    return parecidos(texto, [...doScrum, ...ideias, ...ENTREGUES], { ignorar: item?.id ?? undefined, limite: 4 });
  }, [texto, itens, times, sprints, projeto, item?.id]);
  if (!lista.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[13px] text-amber-900" role="status">
      <p className="mb-1 flex items-center gap-1.5 font-bold"><Sparkles size={14} aria-hidden /> Parecido com o que já existe — confira antes de criar outro</p>
      <ul className="space-y-1">
        {lista.map((p) => {
          const doScrum = p.origem === "scrum" ? itens.find((i) => i.id === p.id) : undefined;
          const Icone = p.origem === "ideia" ? Lightbulb : p.origem === "entregue" ? Rocket : CircleDashed;
          return (
            <li key={p.id} className="flex items-start gap-1.5">
              <Icone size={13} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                {doScrum && onAbrir
                  ? <button type="button" className="text-left font-semibold underline decoration-amber-400 underline-offset-2" onClick={() => onAbrir(doScrum)}>{p.titulo}</button>
                  : <span className="line-clamp-2 font-semibold">{p.titulo}</span>}
                <span className="block text-[11px] text-amber-800">{p.detalhe} · {Math.round(p.score * 100)}% parecido</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Lista de tarefas do item: marcar, escrever, tirar */
export function ListaTarefas({ tarefas, onChange }: { tarefas: Tarefa[]; onChange: (t: Tarefa[]) => void }) {
  const [nova, setNova] = useState("");
  const incluir = () => {
    if (!nova.trim()) return;
    onChange([...tarefas, { texto: nova.trim().slice(0, 300), feito: false }]);
    setNova("");
  };
  return (
    <div className="space-y-2">
      {tarefas.length > 0 && (
        <ul className="space-y-1">
          {tarefas.map((t, k) => (
            <li key={k} className="group flex items-start gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-50">
              <input type="checkbox" className="mt-1" checked={t.feito} aria-label={t.texto}
                onChange={() => onChange(tarefas.map((x, j) => (j === k ? { ...x, feito: !x.feito } : x)))} />
              <span className={`min-w-0 flex-1 text-sm ${t.feito ? "text-slate-400 line-through" : "text-fg"}`}>{t.texto}</span>
              <button type="button" aria-label={`Tirar a tarefa ${t.texto}`} onClick={() => onChange(tarefas.filter((_, j) => j !== k))}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-red-700"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {/* sem <form>: fica dentro do formulário do item */}
      <div className="flex gap-2">
        <input className="input h-9 min-w-0 flex-1" placeholder="Nova tarefa (Enter)" aria-label="Nova tarefa" value={nova} maxLength={300}
          onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); incluir(); } }} />
        <Button type="button" variant="secondary" onClick={incluir} disabled={!nova.trim()}><Plus size={15} aria-hidden /> Tarefa</Button>
      </div>
    </div>
  );
}

const ROTULO_OK = (ok: boolean | null) => (ok === true ? "passou" : ok === false ? "falhou" : "falta testar");

/** Casos de teste: passos, resultado esperado e passou/falhou */
export function ListaTestes({ testes, onChange }: { testes: CasoTeste[]; onChange: (t: CasoTeste[]) => void }) {
  if (!testes.length) return <p className="text-sm text-slate-500">Nenhum caso de teste. Toque em "Casos de teste" no assistente para montar a partir dos cenários.</p>;
  const marcar = (k: number, ok: boolean | null) => onChange(testes.map((t, j) => (j === k ? { ...t, ok: t.ok === ok ? null : ok } : t)));
  return (
    <ol className="space-y-2">
      {testes.map((t, k) => (
        <li key={k} className={`rounded-xl border p-2.5 ${t.ok === true ? "border-emerald-300 bg-emerald-50/60" : t.ok === false ? "border-red-300 bg-red-50/60" : "border-slate-200"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-sm font-bold text-fg">{k + 1}. {t.nome}</span>
            <span className="sr-only">{ROTULO_OK(t.ok)}</span>
            <button type="button" aria-pressed={t.ok === true} onClick={() => marcar(k, true)}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold ${t.ok === true ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-emerald-700"}`}><CheckCircle2 size={13} aria-hidden /> Passou</button>
            <button type="button" aria-pressed={t.ok === false} onClick={() => marcar(k, false)}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold ${t.ok === false ? "border-red-600 bg-red-600 text-white" : "border-slate-300 text-red-700"}`}><XCircle size={13} aria-hidden /> Falhou</button>
            <button type="button" aria-label={`Tirar o caso ${t.nome}`} onClick={() => onChange(testes.filter((_, j) => j !== k))}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-700"><X size={14} /></button>
          </div>
          <div className="mt-1.5 grid gap-2 text-[13px] sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Passos</p>
              <ol className="list-decimal pl-5 text-slate-700">{t.passos.map((p, j) => <li key={j}>{p}</li>)}</ol>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Resultado esperado</p>
              <ul className="list-disc pl-5 text-slate-700">{t.esperado.map((p, j) => <li key={j}>{p}</li>)}</ul>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export const resumoTestes = (testes: CasoTeste[]) => {
  const p = placarTestes(testes);
  return testes.length ? `${p.passou} ${pl(p.passou, "passou", "passaram")} · ${p.falhou} ${pl(p.falhou, "falhou", "falharam")} · ${p.falta} ${pl(p.falta, "falta", "faltam")}` : "nenhum";
};

/** Conversa da equipe no item (grava na hora, sem esperar o Salvar) e o resumo dela (Summarizer) */
export function Comentarios({ item, pessoas }: { item: ItemScrum; pessoas: Pessoa[] }) {
  const { user_id, papel } = usePerfil();
  const invalidar = useInvalidate();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resumo, setResumo] = useState(false);
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["scrum_comentarios", item.id],
    queryFn: async () => ((await ler(supabase.from("scrum_comentarios").select("*").eq("item_id", item.id).order("created_at"))) ?? []) as ComentarioScrum[],
  });
  const r = useMemo(() => resumirComentarios(lista.map((c) => ({ nome: nomeDe(pessoas, c.user_id), texto: c.texto, created_at: c.created_at }))), [lista, pessoas]);

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    const { error } = await supabase.from("scrum_comentarios").insert({ item_id: item.id, texto: texto.trim().slice(0, 4000) });
    setEnviando(false);
    if (error) return notifyError(error);
    setTexto("");
    invalidar("scrum_comentarios");
  }
  async function apagar(c: ComentarioScrum) {
    if (!(await confirmar("Apagar este comentário? Não dá para desfazer.", { perigo: true, ok: "Apagar" }))) return;
    const { error } = await supabase.from("scrum_comentarios").delete().eq("id", c.id);
    if (error) return notifyError(error);
    invalidar("scrum_comentarios");
  }

  return (
    <div className="space-y-2">
      {lista.length >= 2 && (
        <div>
          <Button type="button" variant="secondary" onClick={() => setResumo((v) => !v)} aria-expanded={resumo}><Sparkles size={15} aria-hidden /> {resumo ? "Fechar o resumo" : "Resumir a conversa"}</Button>
          {resumo && (
            <div className="mt-2 space-y-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-[13px] text-slate-800">
              <p><b>{r.total} {pl(r.total, "comentário", "comentários")}</b> de {r.pessoas.map((p) => `${p.nome.split(" ")[0]} (${p.n})`).join(", ")}{r.de && r.ate ? `, de ${dataBR(r.de.slice(0, 10))} a ${dataBR(r.ate.slice(0, 10))}` : ""}.</p>
              <BlocoResumo titulo="Decidido" itens={r.decisoes} cor="text-emerald-800" />
              <BlocoResumo titulo="Travado ou faltando" itens={r.pendencias} cor="text-red-800" />
              <BlocoResumo titulo="Perguntas sem resposta" itens={r.perguntas} cor="text-amber-800" />
              <BlocoResumo titulo="Próximos passos" itens={r.proximos} cor="text-sky-800" />
              {!r.decisoes.length && !r.pendencias.length && !r.perguntas.length && !r.proximos.length && <p className="text-slate-600">Nada marcado como decisão, pendência ou pergunta. Última mensagem: {r.ultimo}</p>}
            </div>
          )}
        </div>
      )}
      {isLoading ? <p className="text-sm text-slate-500">Carregando…</p> : !lista.length ? <p className="text-sm text-slate-500">Ninguém comentou ainda.</p> : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {lista.map((c) => (
            <li key={c.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <p className="flex items-center gap-2 text-[11px] text-slate-500">
                <b className="text-slate-700">{nomeDe(pessoas, c.user_id)}</b> {dataHoraBR(c.created_at)}
                {(c.user_id === user_id || papel === "admin") && (
                  <button type="button" onClick={() => apagar(c)} aria-label="Apagar o comentário" className="ml-auto rounded p-0.5 text-slate-400 hover:text-red-700"><Trash2 size={13} /></button>
                )}
              </p>
              <p className="whitespace-pre-wrap text-fg">{c.texto}</p>
            </li>
          ))}
        </ul>
      )}
      {/* sem <form>: fica dentro do formulário do item */}
      <div className="flex items-end gap-2">
        <textarea className="input min-h-[44px] min-w-0 flex-1" rows={2} placeholder="Escreva para a equipe (Ctrl+Enter envia)" aria-label="Novo comentário" value={texto} maxLength={4000}
          onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } }} />
        <Button type="button" onClick={() => enviar()} disabled={!texto.trim() || enviando} aria-label="Enviar comentário"><Send size={15} aria-hidden /><span className="hidden sm:inline">Enviar</span></Button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-slate-500"><MessageSquare size={11} aria-hidden /> O comentário grava na hora; não precisa do Salvar.</p>
    </div>
  );
}

function BlocoResumo({ titulo, itens, cor }: { titulo: string; itens: string[]; cor: string }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className={`text-[11px] font-extrabold uppercase tracking-wide ${cor}`}>{titulo}</p>
      <ul className="list-disc pl-5">{itens.map((x, k) => <li key={k}>{x}</li>)}</ul>
    </div>
  );
}
