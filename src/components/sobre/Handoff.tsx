// Handoff do ERP (Sobre o ERP Line → Handoff): onde o ERP está, o que falta e quem faz, para passar o trabalho
// adiante sem perder nada. Indicadores no topo (clicáveis), próximos passos, pendências com filtros, decisões e
// como o ERP funciona. O texto do handoff sai pronto para colar no WhatsApp ou numa conversa.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlarmClock, Ban, Check, CheckCircle2, ClipboardCopy, FileText, Flag, Hourglass, ListTodo, Pencil, Play, Plus, RotateCcw, Scale, Search, UserRound, Bot,
} from "lucide-react";
import { Button, Card, Modal, Stat } from "@/components/ui";
import { ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { MenuAcoes } from "@/components/MenuAcoes";
import { hoje, pl } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  RESPONSAVEIS, ROTULO_PRIORIDADE, ROTULO_RESPONSAVEL, ativo, atrasada, indicadoresHandoff, ordenarPendencias, proximosPassos, textoHandoff,
  type ItemProjeto, type Prioridade, type Responsavel, type TipoItem,
} from "@/lib/projeto";
import {
  AREAS, ChipArea, ChipPrioridade, ChipResponsavel, ChipSituacao, ItemModal, dataCurta, useItensProjeto, useMudarSituacao,
} from "./ItemProjeto";

type Visao = "ativas" | "aguardando" | "feita" | "descartada" | "todas";
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COR_FAIXA: Record<Prioridade, string> = { alta: "bg-red-500", media: "bg-amber-400", baixa: "bg-slate-300" };

export function Handoff({ versao, onIrAba }: { versao: { numero: string; hash: string } | null; onIrAba: (aba: "modulos" | "atualizacoes" | "ideias") => void }) {
  const { data: itens = [], isLoading } = useItensProjeto();
  const dia = hoje();
  const ind = useMemo(() => indicadoresHandoff(itens, dia), [itens, dia]);
  const [visao, setVisao] = useState<Visao>("ativas");
  const [resp, setResp] = useState<Responsavel | "">("");
  const [prio, setPrio] = useState<Prioridade | "">("");
  const [area, setArea] = useState("");
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<{ tipo: TipoItem; item?: ItemProjeto | null } | null>(null);
  const [texto, setTexto] = useState<string | null>(null);

  const pend = useMemo(() => itens.filter((i) => i.tipo === "pendencia"), [itens]);
  const termo = semAcento(busca.trim());
  // tudo menos a visão e o responsável: as contagens dos botões seguem os outros filtros
  const base = pend.filter((i) => (!prio || i.prioridade === prio) && (!area || i.area === area) && (!soAtrasadas || atrasada(i, dia))
    && (!termo || termo.split(/\s+/).every((p) => semAcento(`${i.titulo} ${i.detalhe ?? ""} ${i.motivo ?? ""}`).includes(p))));
  const naVisao = (i: ItemProjeto, v: Visao) => v === "todas" || (v === "ativas" ? ativo(i) : i.situacao === v);
  const doResp = base.filter((i) => !resp || i.responsavel === resp);
  const lista = ordenarPendencias(doResp.filter((i) => naVisao(i, visao)), dia);
  const passos = proximosPassos(pend, dia);
  const decisoes = itens.filter((i) => i.tipo === "decisao").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const nFiltros = (prio ? 1 : 0) + (area ? 1 : 0) + (soAtrasadas ? 1 : 0) + (resp ? 1 : 0) + (termo ? 1 : 0);
  const limpar = () => { setResp(""); setPrio(""); setArea(""); setSoAtrasadas(false); setBusca(""); setVisao("ativas"); };
  const filtrar = (f: () => void) => { limpar(); f(); document.getElementById("pendencias")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  // agrupado por quem faz quando não há filtro de responsável
  const grupos = resp ? [{ r: resp, l: lista }] : RESPONSAVEIS.map((r) => ({ r, l: lista.filter((i) => i.responsavel === r) })).filter((g) => g.l.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="min-w-0 max-w-2xl flex-1 basis-72 text-sm text-slate-600">
          Onde o ERP está, o que falta e quem faz. Comece pelos <b>próximos passos</b>; ao terminar, marque como feita.
          Ideia nova vai para <button type="button" className="font-semibold text-modulo-texto underline-offset-2 hover:underline" onClick={() => onIrAba("ideias")}>Ideias</button>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setTexto(textoHandoff(itens, dia, versao))} disabled={!itens.length}><FileText size={16} /> Handoff em texto</Button>
          <Button variant="secondary" onClick={() => setEditando({ tipo: "decisao" })}><Scale size={16} /> Registrar decisão</Button>
          <Button onClick={() => setEditando({ tipo: "pendencia" })}><Plus size={16} /> Nova pendência</Button>
        </div>
      </div>

      {/* indicadores: tocar filtra a lista de pendências */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Pendências abertas" valor={ind.abertas} icon={ListTodo} tom="info" onClick={() => filtrar(() => {})}
          sub={`${ind.fazendo} fazendo · ${ind.feitasSemana} ${pl(ind.feitasSemana, "feita", "feitas")} em 7 dias`} />
        <Stat label="Alta prioridade" valor={ind.alta} icon={Flag} tom={ind.alta ? "critico" : "bom"} onClick={() => filtrar(() => setPrio("alta"))} sub="fazer primeiro" />
        <Stat label="Atrasadas" valor={ind.atrasadas} icon={AlarmClock} tom={ind.atrasadas ? "critico" : "bom"} onClick={() => filtrar(() => setSoAtrasadas(true))} sub="prazo vencido" />
        <Stat label="Aguardando alguém" valor={ind.aguardando} icon={Hourglass} tom={ind.aguardando ? "atencao" : "neutro"} onClick={() => filtrar(() => setVisao("aguardando"))} sub="paradas por resposta" />
        <Stat label="Com a empresa" valor={ind.porResponsavel.empresa} icon={UserRound} onClick={() => filtrar(() => setResp("empresa"))} sub={`+ ${ind.terceiros} com contador e outros`} />
        <Stat label="Com o Claude" valor={ind.porResponsavel.claude} icon={Bot} onClick={() => filtrar(() => setResp("claude"))} sub={`${ind.decisoes} ${pl(ind.decisoes, "decisão", "decisões")} em vigor`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          {/* 1º: o que fazer agora */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-base font-bold text-fg">Próximos passos</h2>
            <p className="text-sm text-slate-600">As pendências que dá para fazer agora, na ordem: atrasadas, prioridade e prazo.</p>
            {!passos.length && !isLoading && <p className="mt-3 text-sm text-slate-500">Nada pendente. Anote a próxima pendência ou veja as ideias.</p>}
            <ol className="mt-3 space-y-2">
              {passos.map((i, k) => (
                <li key={i.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                  <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-modulo-escuro text-sm font-extrabold text-white">{k + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug text-fg">{i.titulo}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {i.responsavel && <ChipResponsavel r={i.responsavel} />}<ChipPrioridade p={i.prioridade} />
                      {i.situacao === "andamento" && <ChipSituacao i={i} />}
                      {i.prazo && <span className={`text-[11px] font-semibold ${atrasada(i, dia) ? "text-red-700" : "text-slate-500"}`}>prazo {dataCurta(i.prazo, dia)}</span>}
                    </div>
                  </div>
                  <AcoesPendencia i={i} onEditar={() => setEditando({ tipo: "pendencia", item: i })} />
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-4 sm:p-5">
            <div id="pendencias" className="scroll-mt-20" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-fg">Pendências</h2>
              {nFiltros > 0 && <button type="button" onClick={limpar} className="text-xs font-semibold text-slate-500 hover:text-fg">Limpar filtros ({nFiltros})</button>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-56">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                <input className="input h-10 pl-9" type="search" placeholder="Buscar pendência" aria-label="Buscar pendência" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <select className="input h-10 w-auto" aria-label="Área" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Todas as áreas</option>
                {AREAS.filter((a) => pend.some((i) => i.area === a.id)).map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
              </select>
              <select className="input h-10 w-auto" aria-label="Prioridade" value={prio} onChange={(e) => setPrio(e.target.value as Prioridade | "")}>
                <option value="">Toda prioridade</option>
                {(["alta", "media", "baixa"] as Prioridade[]).map((p) => <option key={p} value={p}>Prioridade {ROTULO_PRIORIDADE[p].toLowerCase()}</option>)}
              </select>
              <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600">
                <input type="checkbox" checked={soAtrasadas} onChange={(e) => setSoAtrasadas(e.target.checked)} /> Atrasadas
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Quem faz">
              {(["", ...RESPONSAVEIS] as (Responsavel | "")[]).map((r) => {
                const n = base.filter((i) => naVisao(i, visao) && (!r || i.responsavel === r)).length;
                if (r && !n && resp !== r) return null;
                return (
                  <button key={r || "todos"} type="button" aria-pressed={resp === r} onClick={() => setResp(r)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${resp === r ? "bg-modulo-escuro text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {r ? ROTULO_RESPONSAVEL[r] : "Todos"} <span className="num opacity-80">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2">
              <ChipsSituacao valor={visao} onChange={setVisao} rotulo="Situação"
                opcoes={([["ativas", "Abertas"], ["aguardando", "Aguardando"], ["feita", "Feitas"], ["descartada", "Descartadas"], ["todas", "Todas"]] as [Visao, string][])
                  .map(([v, l]) => ({ value: v, label: l, n: doResp.filter((i) => naVisao(i, v)).length }))} />
            </div>

            {!lista.length && !isLoading && <p className="py-6 text-center text-sm text-slate-500">Nenhuma pendência {nFiltros ? "com esses filtros" : "aqui"}.</p>}
            {grupos.map((g) => (
              <section key={g.r} className="mt-2">
                {!resp && <h3 className="flex items-center gap-2 border-b border-slate-100 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <ChipResponsavel r={g.r as Responsavel} /> <span className="num">{g.l.length}</span>
                </h3>}
                <ul className="divide-y divide-slate-100">
                  {g.l.map((i) => <LinhaPendencia key={i.id} i={i} dia={dia} mostrarQuem={!!resp} onEditar={() => setEditando({ tipo: "pendencia", item: i })} />)}
                </ul>
              </section>
            ))}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Decisoes decisoes={decisoes} dia={dia} onEditar={(item) => setEditando({ tipo: "decisao", item })} />
          <ComoFunciona onIrAba={onIrAba} />
        </div>
      </div>

      {editando && <ItemModal tipo={editando.tipo} item={editando.item} onClose={() => setEditando(null)} />}
      {texto != null && <TextoHandoff texto={texto} onClose={() => setTexto(null)} />}
    </div>
  );
}

/** Botão do próximo passo da pendência e o resto no menu "⋯". */
function AcoesPendencia({ i, onEditar }: { i: ItemProjeto; onEditar: () => void }) {
  const mudar = useMudarSituacao();
  const principal = i.situacao === "aguardando" ? { r: "Retomar", ic: RotateCcw, s: "aberta" as const }
    : ativo(i) ? { r: "Concluir", ic: Check, s: "feita" as const }
    : { r: "Reabrir", ic: RotateCcw, s: "aberta" as const };
  return (
    <div className="flex shrink-0 items-start gap-1.5">
      <Button variant={principal.s === "feita" ? "primary" : "secondary"} className="!min-h-0 !px-2.5 !py-1.5 whitespace-nowrap" onClick={() => mudar(i, principal.s)}>
        <principal.ic size={15} /> {principal.r}
      </Button>
      <MenuAcoes itens={[
        i.situacao === "aberta" && { rotulo: "Estou fazendo", icone: Play, onClick: () => mudar(i, "andamento") },
        ativo(i) && i.situacao !== "aguardando" && { rotulo: "Aguardando alguém…", icone: Hourglass, onClick: () => mudar(i, "aguardando") },
        i.situacao === "aguardando" && { rotulo: "Mudar o que aguarda…", icone: Hourglass, onClick: () => mudar(i, "aguardando") },
        { rotulo: "Editar", icone: Pencil, onClick: onEditar },
        ativo(i) && { rotulo: "Descartar…", icone: Ban, onClick: () => mudar(i, "descartada"), perigo: true },
      ]} />
    </div>
  );
}

function LinhaPendencia({ i, dia, mostrarQuem, onEditar }: { i: ItemProjeto; dia: string; mostrarQuem: boolean; onEditar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const longo = (i.detalhe?.length ?? 0) > 160;
  return (
    <li className={`flex gap-3 py-3 ${ativo(i) ? "" : "opacity-75"}`}>
      <span className={`w-1 shrink-0 self-stretch rounded-full ${ativo(i) ? COR_FAIXA[i.prioridade] : "bg-slate-200"}`} title={`Prioridade ${ROTULO_PRIORIDADE[i.prioridade].toLowerCase()}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold leading-snug text-fg ${i.situacao === "descartada" ? "line-through" : ""}`}>{i.titulo}</p>
        {i.detalhe && (
          <p className={`mt-0.5 whitespace-pre-line text-[13px] leading-snug text-slate-600 ${aberto || !longo ? "" : "line-clamp-2"}`}>
            {i.detalhe}
          </p>
        )}
        {longo && <button type="button" onClick={() => setAberto((v) => !v)} className="text-xs font-semibold text-modulo-texto">{aberto ? "menos" : "ver tudo"}</button>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {i.situacao !== "aberta" && <ChipSituacao i={i} />}
          {mostrarQuem && i.responsavel && <ChipResponsavel r={i.responsavel} />}
          <ChipPrioridade p={i.prioridade} />
          <ChipArea area={i.area} />
          {i.prazo && <span className={`text-[11px] font-semibold ${atrasada(i, dia) ? "text-red-700" : "text-slate-500"}`}>{atrasada(i, dia) ? "atrasada · " : ""}prazo {dataCurta(i.prazo, dia)}</span>}
          {i.motivo && <span className="text-[11px] text-slate-600">{i.situacao === "aguardando" ? "aguardando: " : "motivo: "}{i.motivo}</span>}
          {i.situacao === "feita" && i.concluido_em && <span className="text-[11px] text-emerald-700">feita em {dataCurta(i.concluido_em, dia)}</span>}
        </div>
      </div>
      <AcoesPendencia i={i} onEditar={onEditar} />
    </li>
  );
}

function Decisoes({ decisoes, dia, onEditar }: { decisoes: ItemProjeto[]; dia: string; onEditar: (i: ItemProjeto) => void }) {
  const mudar = useMudarSituacao();
  const vale = decisoes.filter((i) => i.situacao === "feita");
  const revogadas = decisoes.filter((i) => i.situacao === "descartada");
  const linha = (i: ItemProjeto) => (
    <li key={i.id} className="flex gap-2 py-2.5">
      <CheckCircle2 size={16} className={`mt-0.5 shrink-0 ${i.situacao === "feita" ? "text-emerald-600" : "text-slate-400"}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-snug text-fg ${i.situacao === "descartada" ? "line-through" : ""}`}>{i.titulo}</p>
        {i.detalhe && <p className="text-[13px] leading-snug text-slate-600">{i.detalhe}</p>}
        <p className="mt-0.5 text-[11px] text-slate-500">{rotuloAreaCurta(i.area)} · {dataCurta(i.created_at, dia)}{i.motivo ? ` · revogada: ${i.motivo}` : ""}</p>
      </div>
      <MenuAcoes itens={[
        { rotulo: "Editar", icone: Pencil, onClick: () => onEditar(i) },
        i.situacao === "feita" ? { rotulo: "Revogar…", icone: Ban, onClick: () => mudar(i, "descartada"), perigo: true }
          : { rotulo: "Voltar a valer", icone: RotateCcw, onClick: () => mudar(i, "feita") },
      ]} />
    </li>
  );
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-base font-bold text-fg">Decisões em vigor</h2>
      <p className="text-sm text-slate-600">O que já foi combinado: leia antes de mudar algo.</p>
      {!vale.length && <p className="mt-2 text-sm text-slate-500">Nenhuma decisão registrada.</p>}
      <ul className="mt-1 divide-y divide-slate-100">{vale.map(linha)}</ul>
      {revogadas.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">{revogadas.length} {pl(revogadas.length, "revogada", "revogadas")}</summary>
          <ul className="divide-y divide-slate-100">{revogadas.map(linha)}</ul>
        </details>
      )}
    </Card>
  );
}
const rotuloAreaCurta = (id: string) => AREAS.find((a) => a.id === id)?.titulo ?? id;

/** Como o ERP funciona, em linhas gerais (para quem vai continuar o trabalho). */
function ComoFunciona({ onIrAba }: { onIrAba: (aba: "modulos" | "atualizacoes" | "ideias") => void }) {
  const link = "font-semibold text-modulo-texto underline-offset-2 hover:underline";
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-base font-bold text-fg">Como o ERP funciona</h2>
      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">As peças</h3>
      <ul className="mt-1 space-y-1 text-[13px] leading-snug text-slate-700">
        <li><b>Telas</b>: abrem no navegador do computador e do celular.</li>
        <li><b>Banco e regras</b>: Supabase guarda os dados, as permissões de cada perfil e as funções do servidor (NF-e, bancos, e-mail).</li>
        <li><b>Site</b>: publicado na Hostinger.</li>
        <li><b>Código</b>: no GitHub. É público: nada da empresa vai no código; senhas só pelas telas ou pelos segredos do Supabase.</li>
      </ul>
      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Uma mudança até chegar ao ar</h3>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] leading-snug text-slate-700">
        <li>O pedido vira pendência aqui (ou ideia, se ainda for só ideia).</li>
        <li>É feita e testada no código, com testes automáticos.</li>
        <li>Mudança no banco só por acréscimo, anotada no registro de migrações.</li>
        <li>O site só é publicado com o ok da empresa.</li>
        <li>A versão nova aparece em <button type="button" className={link} onClick={() => onIrAba("atualizacoes")}>Atualizações</button>.</li>
      </ol>
      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Onde olhar</h3>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
        <button type="button" className={link} onClick={() => onIrAba("modulos")}>Módulos</button>
        <button type="button" className={link} onClick={() => onIrAba("ideias")}>Ideias</button>
        <Link to="/auditoria" className={link}>Auditoria</Link>
        <Link to="/contador" className={link}>Painel do contador</Link>
      </div>
    </Card>
  );
}

/** O handoff em texto, para copiar e mandar. */
function TextoHandoff({ texto, onClose }: { texto: string; onClose: () => void }) {
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); notify("Handoff copiado"); }
    catch { (document.getElementById("texto-handoff") as HTMLTextAreaElement | null)?.select(); notify("Selecione o texto e copie"); }
  }
  return (
    <Modal open onClose={onClose} title="Handoff em texto">
      <p className="text-sm text-slate-600">Pronto para colar no WhatsApp, num e-mail ou numa conversa com o Claude.</p>
      <textarea id="texto-handoff" readOnly value={texto} rows={16} className="input mt-2 font-mono text-xs leading-relaxed" onFocus={(e) => e.currentTarget.select()} />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Fechar</Button>
        <Button onClick={copiar}><ClipboardCopy size={16} /> Copiar</Button>
      </div>
    </Modal>
  );
}
