// Janela do item do Scrum (novo ou para editar): título, tipo, pontos, responsável, onde fica, descrição, critério de
// aceite, tarefas, cenários, casos de teste e a conversa da equipe. O assistente preenche e monta rascunhos; nada
// grava até o Salvar (só o comentário, que grava na hora).
import { useState, type FormEvent, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, FileText, FlaskConical, ListChecks, Sparkles, Trash2, Undo2, Wand2, Workflow } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { autoPreencher, elaborar, gerarCenarios, gerarCriterios, gerarTarefas, gerarTestes, juntarLinhas, normalizar } from "@/lib/assistenteItem";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import {
  ROTULO_STATUS, ROTULO_TIPO, prioridadeNoFim,
  type CasoTeste, type ItemScrum, type Sprint, type StatusItem, type Tarefa, type TimeScrum, type TipoItem,
} from "@/lib/scrum";
import { Comentarios, ListaTarefas, ListaTestes, Parecidos, resumoTestes } from "./AssistenteItem";
import { EscolhaPontos, type Pessoa } from "./comum";

type Rascunho = {
  titulo: string; tipo: TipoItem; pontos: number | null; responsavel_id: string; descricao: string; criterio_aceite: string;
  sprint_id: string; status: StatusItem; tarefas: Tarefa[]; cenarios: string; testes: CasoTeste[];
};
type Acao = "preencher" | "detalhar" | "tarefas" | "criterios" | "cenarios" | "testes";
type Secao = "tarefas" | "cenarios" | "testes" | "comentarios";

/** Os botões do assistente (o nome em inglês é o do recurso, para quem conhece) */
const ACOES: { id: Acao; rotulo: string; dica: string; Icone: typeof Wand2 }[] = [
  { id: "preencher", rotulo: "Preencher", dica: "Auto-Fill: completa tipo, pontos, responsável, descrição e critério que estão vazios", Icone: Wand2 },
  { id: "detalhar", rotulo: "Detalhar", dica: "Elaborator: transforma o título numa descrição organizada", Icone: FileText },
  { id: "tarefas", rotulo: "Tarefas", dica: "Smart-Task: lista de tarefas pelo tipo e pelo assunto", Icone: ListChecks },
  { id: "criterios", rotulo: "Critérios", dica: "Smart-Acceptance: como saber que está pronto", Icone: BadgeCheck },
  { id: "cenarios", rotulo: "Cenários", dica: "Smart-BDD: Dado / Quando / Então, em português", Icone: Workflow },
  { id: "testes", rotulo: "Casos de teste", dica: "Test-Gen: passos e resultado esperado, a partir dos cenários", Icone: FlaskConical },
];

export function ItemModal({ time, item, sprintInicial, sprints, itensDoTime, todosItens, times, pessoas, todasPessoas, onClose, onAbrir }: {
  time: TimeScrum; item: ItemScrum | null; sprintInicial?: string | null; sprints: Sprint[]; itensDoTime: ItemScrum[];
  /** todas as equipes: itens parecidos e histórico para pontos e responsável */
  todosItens: ItemScrum[]; times: TimeScrum[];
  pessoas: Pessoa[]; todasPessoas: Pessoa[]; onClose: () => void; onAbrir?: (i: ItemScrum) => void;
}) {
  const { user_id, papel } = usePerfil();
  const invalidar = useInvalidate();
  const [r, setR] = useState<Rascunho>(() => ({
    titulo: item?.titulo ?? "", tipo: item?.tipo ?? "historia", pontos: item?.pontos ?? null, responsavel_id: item?.responsavel_id ?? "",
    descricao: item?.descricao ?? "", criterio_aceite: item?.criterio_aceite ?? "", sprint_id: item?.sprint_id ?? sprintInicial ?? "", status: item?.status ?? "a_fazer",
    tarefas: item?.tarefas ?? [], cenarios: item?.cenarios ?? "", testes: item?.testes ?? [],
  }));
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ linhas: string[]; antes: Rascunho } | null>(null);
  const [aberto, setAberto] = useState<Record<Secao, boolean>>(() => ({
    tarefas: !!item?.tarefas?.length, cenarios: !!item?.cenarios, testes: !!item?.testes?.length, comentarios: !!item,
  }));
  const abertas = sprints.filter((s) => s.time_id === time.id && (s.status !== "encerrada" || s.id === item?.sprint_id));
  const membros = pessoas.filter((p) => time.membros.includes(p.user_id));
  const outros = pessoas.filter((p) => !time.membros.includes(p.user_id));
  const podeExcluir = !!item && (papel === "admin" || item.created_by === user_id);
  const feitas = r.tarefas.filter((t) => t.feito).length;

  async function usar(acao: Acao) {
    if (!r.titulo.trim()) return notify("Escreva o título primeiro: o assistente parte dele.", "erro");
    const antes = r;
    let novo: Rascunho = r;
    let linhas: string[] = [];
    if (acao === "preencher") {
      const p = autoPreencher(r, todosItens, item?.id);
      novo = { ...r, ...p.campos };
      linhas = p.motivos.length ? p.motivos : ["Nada vazio para preencher."];
    } else if (acao === "detalhar") {
      if (r.descricao.trim() && !(await confirmar("Trocar a descrição atual pelo rascunho do assistente? Dá para desfazer antes de salvar.", { ok: "Trocar" }))) return;
      novo = { ...r, descricao: elaborar(r) };
      linhas = ["Descrição montada pelo título. Complete o que está entre parênteses."];
    } else if (acao === "tarefas") {
      const t = gerarTarefas(r, r.tarefas);
      novo = { ...r, tarefas: [...r.tarefas, ...t] };
      linhas = [t.length ? `${t.length} ${pl(t.length, "tarefa nova", "tarefas novas")} na lista. Tire o que não serve.` : "A lista já tem essas tarefas."];
      setAberto((a) => ({ ...a, tarefas: true }));
    } else if (acao === "criterios") {
      const criterio_aceite = juntarLinhas(r.criterio_aceite, gerarCriterios(r));
      novo = { ...r, criterio_aceite };
      linhas = [criterio_aceite === r.criterio_aceite.trimEnd() ? "O critério já tem esses pontos." : "Critérios juntados no fim do critério de aceite (sem repetir)."];
    } else if (acao === "cenarios") {
      if (r.cenarios.trim() && !(await confirmar("Trocar os cenários atuais pelos do assistente? Dá para desfazer antes de salvar.", { ok: "Trocar" }))) return;
      novo = { ...r, cenarios: gerarCenarios(r) };
      linhas = ["Cenários montados pelo título e pelo critério de aceite."];
      setAberto((a) => ({ ...a, cenarios: true }));
    } else {
      const cenarios = r.cenarios.trim() || gerarCenarios(r);
      const ja = new Set(r.testes.map((t) => normalizar(t.nome)));
      const novos = gerarTestes(cenarios).filter((c) => !ja.has(normalizar(c.nome)));
      novo = { ...r, cenarios, testes: [...r.testes, ...novos] };
      linhas = [novos.length ? `${novos.length} ${pl(novos.length, "caso de teste", "casos de teste")} a partir dos cenários${r.cenarios.trim() ? "" : " (montados agora)"}.` : "Os casos de teste já estão na lista."];
      setAberto((a) => ({ ...a, testes: true, cenarios: a.cenarios || !r.cenarios.trim() }));
    }
    setR(novo);
    setAviso({ linhas, antes });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!r.titulo.trim()) return notify("Escreva o título do item.", "erro");
    setSalvando(true);
    const dados = {
      titulo: r.titulo.trim(), tipo: r.tipo, pontos: r.pontos, responsavel_id: r.responsavel_id || null,
      descricao: r.descricao.trim() || null, criterio_aceite: r.criterio_aceite.trim() || null,
      sprint_id: r.sprint_id || null, status: r.status,
      tarefas: r.tarefas.filter((t) => t.texto.trim()), cenarios: r.cenarios.trim() || null, testes: r.testes,
    };
    const { error } = item
      ? await supabase.from("scrum_itens").update(dados).eq("id", item.id)
      : await supabase.from("scrum_itens").insert({ ...dados, time_id: time.id, prioridade: prioridadeNoFim(itensDoTime.filter((i) => !i.sprint_id)) });
    setSalvando(false);
    if (error) return notifyError(error);
    invalidar("scrum_itens");
    notify(item ? "Item salvo." : r.sprint_id ? "Item criado na sprint." : "Item criado no backlog.");
    onClose();
  }

  async function excluir() {
    if (!item || !(await confirmar(`Excluir o item "${item.titulo}"? Não dá para desfazer.`, { perigo: true, ok: "Excluir" }))) return;
    const { error } = await supabase.from("scrum_itens").delete().eq("id", item.id);
    if (error) return notifyError(error);
    invalidar("scrum_itens");
    notify("Item excluído.");
    onClose();
  }

  const secao = (id: Secao, titulo: ReactNode, conteudo: ReactNode) => (
    <section className="rounded-xl border border-slate-200">
      <button type="button" aria-expanded={aberto[id]} onClick={() => setAberto((a) => ({ ...a, [id]: !a[id] }))}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-fg">
        <span className="min-w-0 flex-1">{titulo}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition ${aberto[id] ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {aberto[id] && <div className="border-t border-slate-100 p-3">{conteudo}</div>}
    </section>
  );

  return (
    <Modal open onClose={onClose} title={item ? "Item do Scrum" : `Novo item · ${time.nome}`} wide>
      <form onSubmit={salvar} className="space-y-4">
        <Field label="Título (o que entrega, do ponto de vista de quem usa)">
          <input className="input" autoFocus value={r.titulo} maxLength={200} placeholder="Ex.: técnico anexa fotos na OS pelo celular"
            onChange={(e) => setR({ ...r, titulo: e.target.value })} />
        </Field>
        <Parecidos titulo={r.titulo} item={item} itens={todosItens} times={times} sprints={sprints} onAbrir={onAbrir} />

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-indigo-900"><Sparkles size={14} aria-hidden /> Assistente
            <span className="font-normal text-indigo-800">— rascunhos pelo título e pelo histórico das equipes; confira antes de salvar</span></p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Assistente do item">
            {ACOES.map(({ id, rotulo, dica, Icone }) => (
              <button key={id} type="button" onClick={() => usar(id)} title={dica} aria-label={`${rotulo}: ${dica}`}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-surface px-2.5 text-[13px] font-semibold text-indigo-900 transition hover:bg-indigo-100">
                <Icone size={15} aria-hidden /> {rotulo}
              </button>
            ))}
          </div>
          {aviso && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-surface p-2 text-[13px] text-slate-700" role="status">
              <ul className="min-w-0 flex-1 space-y-0.5">{aviso.linhas.map((l, k) => <li key={k}>{l}</li>)}</ul>
              <button type="button" onClick={() => { setR(aviso.antes); setAviso(null); }} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-indigo-800 hover:bg-indigo-100">
                <Undo2 size={13} aria-hidden /> Desfazer
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <select className="input" value={r.tipo} onChange={(e) => setR({ ...r, tipo: e.target.value as TipoItem })}>
              {(Object.keys(ROTULO_TIPO) as TipoItem[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
            </select>
          </Field>
          <Field label="Responsável">
            <select className="input" value={r.responsavel_id} onChange={(e) => setR({ ...r, responsavel_id: e.target.value })}>
              <option value="">Sem responsável</option>
              {membros.length > 0 && <optgroup label="Da equipe">{membros.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}</optgroup>}
              <optgroup label={membros.length ? "Outras pessoas" : "Pessoas"}>{outros.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}</optgroup>
            </select>
          </Field>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Pontos de esforço (toque de novo para tirar)</span>
          <EscolhaPontos valor={r.pontos} onChange={(pontos) => setR({ ...r, pontos })} />
          <p className="mt-1 text-xs text-slate-500">Compare com itens já feitos: 1 = bem pequeno, 3 = um dia, 8 = vários dias, 13 ou 21 = grande demais — divida.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Onde fica">
            <select className="input" value={r.sprint_id} onChange={(e) => setR({ ...r, sprint_id: e.target.value })}>
              <option value="">Backlog (ainda sem sprint)</option>
              {abertas.map((s) => <option key={s.id} value={s.id}>Sprint {s.numero}{s.status === "ativa" ? " (em andamento)" : s.status === "planejada" ? " (planejada)" : ""}</option>)}
            </select>
          </Field>
          {r.sprint_id && (
            <Field label="Situação">
              <select className="input" value={r.status} onChange={(e) => setR({ ...r, status: e.target.value as StatusItem })}>
                {(Object.keys(ROTULO_STATUS) as StatusItem[]).map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Descrição (opcional)">
          <textarea className="input min-h-[96px]" value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} />
        </Field>
        <Field label="Critério de aceite: como saber que está pronto">
          <textarea className="input min-h-[72px]" value={r.criterio_aceite} placeholder="Ex.: a foto aparece na OS e no PDF; funciona no iPhone"
            onChange={(e) => setR({ ...r, criterio_aceite: e.target.value })} />
        </Field>

        {secao("tarefas", <>Tarefas {r.tarefas.length > 0 && <span className="num font-semibold text-slate-500">· {feitas}/{r.tarefas.length} feitas</span>}</>,
          <ListaTarefas tarefas={r.tarefas} onChange={(tarefas) => setR({ ...r, tarefas })} />)}
        {secao("cenarios", <>Cenários (Dado / Quando / Então) {r.cenarios.trim() && <span className="font-semibold text-slate-500">· {(r.cenarios.match(/Cen[áa]rio\s*:/gi) ?? []).length}</span>}</>,
          <textarea className="input min-h-[180px] font-mono text-[13px]" aria-label="Cenários" value={r.cenarios} spellCheck={false}
            placeholder={"Cenário: Caminho principal\n  Dado que …\n  Quando …\n  Então …"} onChange={(e) => setR({ ...r, cenarios: e.target.value })} />)}
        {secao("testes", <>Casos de teste <span className="font-semibold text-slate-500">· {resumoTestes(r.testes)}</span></>,
          <ListaTestes testes={r.testes} onChange={(testes) => setR({ ...r, testes })} />)}
        {item
          ? secao("comentarios", "Comentários da equipe", <Comentarios item={item} pessoas={todasPessoas} />)
          : <p className="text-xs text-slate-500">Os comentários da equipe aparecem depois de salvar o item.</p>}

        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-surface px-1 pt-3">
          {podeExcluir ? <Button type="button" variant="ghost" className="text-red-700" onClick={excluir}><Trash2 size={15} aria-hidden /> Excluir</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
