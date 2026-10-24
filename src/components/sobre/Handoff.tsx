// Handoff do ERP (Sobre o ERP Line → Handoff): onde o ERP está, o que falta e quem faz, para passar o trabalho
// adiante sem perder nada. No topo, o que é o Handoff (pendência, decisão e ideia) e como usar; depois o painel escuro
// (pendências abertas no centro do anel, um pedaço por quem faz, tocar filtra), os próximos passos, as pendências com a
// barra de filtros, as decisões e como o ERP funciona. O texto do handoff sai pronto para colar no WhatsApp ou numa conversa.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlarmClock, Ban, Bot, Briefcase, Check, CheckCircle2, ClipboardCopy, Code2, Database, FileText, Flag, Globe, Hourglass, Lightbulb, ListTodo, Pencil, Play,
  Plus, RotateCcw, Scale, Store, Truck, UserRound, X, type LucideIcon,
} from "lucide-react";
import { Button, Card, chip, Modal } from "@/components/ui";
import { BarraFiltros, ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { AnelEscuro, LinhaEscura, NumeroEscuro, QuadroEscuro, type FatiaAnel, TOM_ESCURO } from "@/components/painel/PainelEscuro";
import { MenuAcoes } from "@/components/MenuAcoes";
import { hoje, pl } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  RESPONSAVEIS, ROTULO_PRIORIDADE, ROTULO_RESPONSAVEL, ativo, atrasada, indicadoresHandoff, ordenarPendencias, partesTituloIdeia, proximosPassos, textoHandoff,
  type ItemProjeto, type Prioridade, type Responsavel, type TipoItem,
} from "@/lib/projeto";
import {
  AREAS, ChipArea, ChipPrioridade, ChipResponsavel, ChipSituacao, ItemModal, dataCurta, useItensProjeto, useMudarSituacao,
} from "./ItemProjeto";

type Visao = "ativas" | "aguardando" | "feita" | "descartada" | "todas";
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COR_FAIXA: Record<Prioridade, string> = { alta: "bg-red-500", media: "bg-amber-400", baixa: "bg-slate-300" };
// cor e ícone de quem faz (as mesmas das etiquetas; o "neon" é o tom que aparece no painel escuro)
const QUEM: Record<Responsavel, { cor: string; neon: string; icone: LucideIcon }> = {
  empresa: { ...TOM_ESCURO.violeta, icone: UserRound }, claude: { ...TOM_ESCURO.laranja, icone: Bot },
  contador: { ...TOM_ESCURO.azul, icone: Briefcase }, advogado: { ...TOM_ESCURO.cinza, icone: Scale },
  fornecedor: { ...TOM_ESCURO.teal, icone: Truck },
};
/** Título sem o código do roteiro ("analytics-os · BI:" → "BI"); o título gravado não muda. */
const tituloLimpo = (t: string) => partesTituloIdeia(t).texto;

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
  const fatiasQuem: FatiaAnel<Responsavel>[] = RESPONSAVEIS.map((r) => ({ id: r, rotulo: ROTULO_RESPONSAVEL[r], valor: ind.porResponsavel[r], cor: QUEM[r].cor, neon: QUEM[r].neon }));
  const grupos = resp ? [{ r: resp, l: lista }] : RESPONSAVEIS.map((r) => ({ r, l: lista.filter((i) => i.responsavel === r) })).filter((g) => g.l.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => setTexto(textoHandoff(itens, dia, versao))} disabled={!itens.length}><FileText size={16} /> Handoff em texto</Button>
        <Button variant="secondary" onClick={() => setEditando({ tipo: "decisao" })}><Scale size={16} /> Registrar decisão</Button>
        <Button onClick={() => setEditando({ tipo: "pendencia" })}><Plus size={16} /> Nova pendência</Button>
      </div>

      <OQueE onIdeias={() => onIrAba("ideias")} />

      {/* painel: as pendências abertas no centro, um pedaço por quem faz (tocar filtra a lista) */}
      <QuadroEscuro rotulo="Pendências do ERP" titulo="Handoff" destaque="o que falta e quem faz" className=""
        filtro={resp ? { texto: ROTULO_RESPONSAVEL[resp], onLimpar: () => setResp("") } : undefined}>
        <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,15.5rem)_auto_minmax(0,1fr)] lg:gap-6">
          <div className="order-1 min-w-0 lg:order-2">
            <AnelEscuro fatias={fatiasQuem} escolhida={resp} onEscolher={(r) => filtrar(() => setResp(r))} rotulo={`${ind.abertas} pendências abertas`}
              centro={resp
                ? { rotulo: ROTULO_RESPONSAVEL[resp], valor: String(ind.porResponsavel[resp]), sub: pl(ind.porResponsavel[resp], "pendência aberta", "pendências abertas") }
                : { rotulo: "Abertas", valor: String(ind.abertas), sub: `${ind.fazendo} fazendo agora` }} />
          </div>
          <div className="order-2 grid min-w-0 grid-cols-2 gap-2 lg:order-1 lg:grid-cols-1">
            <NumeroEscuro icone={Flag} rotulo="Alta prioridade" valor={ind.alta} sub="fazer primeiro" tom="rosa" aceso={ind.alta > 0} onClick={() => filtrar(() => setPrio("alta"))} />
            <NumeroEscuro icone={AlarmClock} rotulo="Atrasadas" valor={ind.atrasadas} sub="prazo vencido" tom="ambar" aceso={ind.atrasadas > 0} onClick={() => filtrar(() => setSoAtrasadas(true))} />
            <NumeroEscuro icone={Hourglass} rotulo="Aguardando alguém" valor={ind.aguardando} sub="paradas por resposta" tom="roxo" aceso={ind.aguardando > 0} onClick={() => filtrar(() => setVisao("aguardando"))} />
            <NumeroEscuro icone={CheckCircle2} rotulo="Feitas em 7 dias" valor={ind.feitasSemana} sub={`${ind.decisoes} ${pl(ind.decisoes, "decisão", "decisões")} em vigor`} tom="verde" aceso={ind.feitasSemana > 0} onClick={() => filtrar(() => setVisao("feita"))} />
          </div>
          <ul className="order-3 grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1" aria-label="Por quem faz">
            {RESPONSAVEIS.filter((r) => ind.porResponsavel[r] > 0 || resp === r).map((r) => (
              <li key={r} className="min-w-0">
                <LinhaEscura icone={QUEM[r].icone} rotulo={ROTULO_RESPONSAVEL[r]} valor={ind.porResponsavel[r]} pct={ind.abertas ? Math.round((ind.porResponsavel[r] / ind.abertas) * 100) : 0}
                  cor={QUEM[r].cor} neon={QUEM[r].neon} ativo={resp === r} apagado={!!resp && resp !== r} onClick={() => filtrar(() => setResp(resp === r ? "" : r))} title="Toque para ver só as pendências de quem faz" />
              </li>
            ))}
          </ul>
        </div>
      </QuadroEscuro>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          {/* 1º: o que fazer agora */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-base font-bold text-fg">Próximos passos</h2>
            <p className="text-sm text-slate-600">Comece por aqui: as pendências que dá para fazer agora, na ordem atrasadas, prioridade e prazo. Terminou? Toque em <b>Concluir</b>.</p>
            {!passos.length && !isLoading && <p className="mt-3 text-sm text-slate-500">Nada pendente. Anote a próxima pendência ou veja as ideias.</p>}
            <ol className="mt-3 space-y-2">
              {passos.map((i, k) => (
                // celular: os botões descem para baixo do texto (antes o texto ficava espremido numa coluna estreita)
                <li key={i.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-modulo-escuro text-sm font-bold text-white">{k + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug text-fg" title={i.titulo}>{tituloLimpo(i.titulo)}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {i.responsavel && <ChipResponsavel r={i.responsavel} />}<ChipPrioridade p={i.prioridade} />
                      {i.situacao === "andamento" && <ChipSituacao i={i} />}
                      {i.prazo && <span className={`text-2xs font-semibold ${atrasada(i, dia) ? "text-red-700" : "text-slate-500"}`}>prazo {dataCurta(i.prazo, dia)}</span>}
                    </div>
                  </div>
                  <AcoesPendencia i={i} onEditar={() => setEditando({ tipo: "pendencia", item: i })} className="col-start-2 sm:col-start-auto" />
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-4 sm:p-5">
            <div id="pendencias" className="scroll-mt-20" />
            <h2 className="text-base font-bold text-fg">Pendências</h2>
            <p className="mb-3 text-sm text-slate-600">Tudo o que falta, separado por quem faz. Use os botões abaixo para ver só um responsável ou uma situação.</p>
            <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar pendência"
              filtros={<>
                <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Área</span>
                  <select className="input w-auto" value={area} onChange={(e) => setArea(e.target.value)}>
                    <option value="">Todas as áreas</option>
                    {AREAS.filter((a) => pend.some((i) => i.area === a.id)).map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
                  </select></label>
                <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Prioridade</span>
                  <select className="input w-auto" value={prio} onChange={(e) => setPrio(e.target.value as Prioridade | "")}>
                    <option value="">Toda prioridade</option>
                    {(["alta", "media", "baixa"] as Prioridade[]).map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
                  </select></label>
                <label className="flex items-center gap-2 pb-2 text-sm text-slate-600"><input type="checkbox" checked={soAtrasadas} onChange={(e) => setSoAtrasadas(e.target.checked)} /> Só atrasadas</label>
              </>}
              nFiltros={(prio ? 1 : 0) + (area ? 1 : 0) + (soAtrasadas ? 1 : 0) + (resp ? 1 : 0)} onLimpar={limpar} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quem faz">
              {(["", ...RESPONSAVEIS] as (Responsavel | "")[]).map((r) => {
                const n = base.filter((i) => naVisao(i, visao) && (!r || i.responsavel === r)).length;
                if (r && !n && resp !== r) return null;
                return (
                  <button key={r || "todos"} type="button" aria-pressed={resp === r} onClick={() => setResp(r)}
                    className={chip(resp === r, "border-transparent bg-modulo-escuro text-white")}>
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
function AcoesPendencia({ i, onEditar, className = "" }: { i: ItemProjeto; onEditar: () => void; className?: string }) {
  const mudar = useMudarSituacao();
  const principal = i.situacao === "aguardando" ? { r: "Retomar", ic: RotateCcw, s: "aberta" as const }
    : ativo(i) ? { r: "Concluir", ic: Check, s: "feita" as const }
    : { r: "Reabrir", ic: RotateCcw, s: "aberta" as const };
  return (
    <div className={`flex shrink-0 items-start gap-1.5 ${className}`}>
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
    <li className={`grid grid-cols-[4px_minmax(0,1fr)] gap-x-3 gap-y-2 py-3 sm:grid-cols-[4px_minmax(0,1fr)_auto] ${ativo(i) ? "" : "opacity-75"}`}>
      <span className={`row-span-2 w-1 self-stretch rounded-full sm:row-span-1 ${ativo(i) ? COR_FAIXA[i.prioridade] : "bg-slate-200"}`} title={`Prioridade ${ROTULO_PRIORIDADE[i.prioridade].toLowerCase()}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold leading-snug text-fg ${i.situacao === "descartada" ? "line-through" : ""}`} title={i.titulo}>{tituloLimpo(i.titulo)}</p>
        {i.detalhe && (
          <p className={`mt-0.5 whitespace-pre-line text-xs leading-snug text-slate-600 ${aberto || !longo ? "" : "line-clamp-2"}`}>
            {i.detalhe}
          </p>
        )}
        {longo && <button type="button" onClick={() => setAberto((v) => !v)} className="link-modulo text-xs">{aberto ? "menos" : "ver tudo"}</button>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {i.situacao !== "aberta" && <ChipSituacao i={i} />}
          {mostrarQuem && i.responsavel && <ChipResponsavel r={i.responsavel} />}
          <ChipPrioridade p={i.prioridade} />
          <ChipArea area={i.area} />
          {i.prazo && <span className={`text-2xs font-semibold ${atrasada(i, dia) ? "text-red-700" : "text-slate-500"}`}>{atrasada(i, dia) ? "atrasada · " : ""}prazo {dataCurta(i.prazo, dia)}</span>}
          {i.motivo && <span className="text-2xs text-slate-600">{i.situacao === "aguardando" ? "aguardando: " : "motivo: "}{i.motivo}</span>}
          {i.situacao === "feita" && i.concluido_em && <span className="text-2xs text-emerald-700">feita em {dataCurta(i.concluido_em, dia)}</span>}
        </div>
      </div>
      <AcoesPendencia i={i} onEditar={onEditar} className="col-start-2 sm:col-start-auto" />
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
        {i.detalhe && <p className="text-xs leading-snug text-slate-600">{i.detalhe}</p>}
        <p className="mt-0.5 text-2xs text-slate-500">{rotuloAreaCurta(i.area)} · {dataCurta(i.created_at, dia)}{i.motivo ? ` · revogada: ${i.motivo}` : ""}</p>
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

/**
 * O que é o Handoff e como usar: as três coisas que ele guarda (pendência, decisão e ideia) e o passo a passo.
 * Dá para fechar (fica fechado no aparelho) e abrir de novo pelo botão "O que é o Handoff?".
 */
function OQueE({ onIdeias }: { onIdeias: () => void }) {
  const CHAVE = "erp.handoff.explicacao";
  const [aberta, setAbertaState] = useState(() => { try { return localStorage.getItem(CHAVE) !== "fechada"; } catch { return true; } });
  const setAberta = (v: boolean) => { setAbertaState(v); try { localStorage.setItem(CHAVE, v ? "aberta" : "fechada"); } catch { /* sem armazenamento */ } };
  if (!aberta) {
    return <button type="button" onClick={() => setAberta(true)} className="link-modulo text-sm">O que é o Handoff e como usar?</button>;
  }
  const tipos: { icone: LucideIcon; cor: string; titulo: string; texto: ReactNode; exemplo: string }[] = [
    { icone: ListTodo, cor: "bg-fixo-sky-700", titulo: "Pendência", texto: "Algo que precisa ser feito, com quem faz, prioridade e, se tiver, prazo.", exemplo: "Ex.: emitir a NF-e da venda #3 (empresa, alta)" },
    { icone: Scale, cor: "bg-fixo-teal-700", titulo: "Decisão", texto: "Algo que já foi combinado e vale daqui para frente. Leia antes de mudar alguma coisa.", exemplo: "Ex.: o site só é publicado com o ok da empresa" },
    { icone: Lightbulb, cor: "bg-fixo-orange-600", titulo: "Ideia", texto: <>Ainda não é trabalho: vai para <button type="button" onClick={onIdeias} className="link-modulo">Ideias</button>, é votada e, se aprovada, vira pendência.</>, exemplo: "Ex.: avisar o cliente quando a máquina sair do conserto" },
  ];
  const passos = [
    ["Comece pelos próximos passos", "são as pendências mais urgentes, já na ordem certa"],
    ["Toque em Concluir ao terminar", "ou em ⋯ → Estou fazendo, para a equipe saber"],
    ["Parou esperando alguém?", "⋯ → Aguardando alguém, escrevendo o que falta"],
    ["Passar o trabalho adiante", "Handoff em texto gera o resumo para colar no WhatsApp ou numa conversa com o Claude"],
  ];
  return (
    <Card className="relative p-4 sm:p-5">
      <button type="button" onClick={() => setAberta(false)} aria-label="Fechar a explicação" title="Fechar a explicação" className="botao-icone absolute right-3 top-3"><X size={16} /></button>
      <h2 className="pr-8 text-base font-bold text-fg">O que é o Handoff</h2>
      <p className="text-sm text-slate-600">O caderno de trabalho do ERP: <b>onde ele está, o que falta e quem faz</b>, para qualquer pessoa (ou um chat novo do Claude) continuar sem perder nada.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {tipos.map((t) => (
          <div key={t.titulo} className="min-w-0 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${t.cor} text-white`} aria-hidden><t.icone size={16} /></span>
              <b className="text-fg">{t.titulo}</b>
            </div>
            <p className="mt-2 text-sm leading-snug text-slate-600">{t.texto}</p>
            <p className="mt-1.5 text-xs italic text-slate-500">{t.exemplo}</p>
          </div>
        ))}
      </div>
      <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Como usar</h3>
      <ol className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {passos.map(([t, d], k) => (
          <li key={t} className="flex min-w-0 gap-2.5">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-modulo-escuro text-xs font-bold text-white">{k + 1}</span>
            <span className="min-w-0 text-sm leading-snug"><b className="block text-fg">{t}</b><span className="text-slate-600">{d}</span></span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Como o ERP funciona, em linhas gerais (para quem vai continuar o trabalho). */
function ComoFunciona({ onIrAba }: { onIrAba: (aba: "modulos" | "atualizacoes" | "ideias") => void }) {
  const link = "link-modulo underline-offset-2";
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-base font-bold text-fg">Como o ERP funciona</h2>
      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">As peças</h3>
      <ul className="mt-2 space-y-2.5">
        {([
          [Store, "Telas", "abrem no navegador do computador e do celular."],
          [Database, "Banco e regras", "o Supabase guarda os dados, as permissões de cada perfil e as funções do servidor (NF-e, bancos, e-mail)."],
          [Globe, "Site", "publicado na Hostinger, só com o ok da empresa."],
          [Code2, "Código", "no GitHub. É público: nada da empresa vai no código; senhas só pelas telas ou pelos segredos do Supabase."],
        ] as const).map(([Icone, t, d]) => (
          <li key={t} className="flex gap-2.5 text-xs leading-snug text-slate-700">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-modulo/15 text-modulo-texto" aria-hidden><Icone size={14} /></span>
            <span><b className="text-fg">{t}</b>: {d}</span>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Uma mudança até chegar ao ar</h3>
      <ol className="relative mt-2 space-y-2.5 border-l-2 border-slate-200 pl-4">
        {[
          "O pedido vira pendência aqui (ou ideia, se ainda for só ideia).",
          "É feita e testada no código, com testes automáticos.",
          "Mudança no banco só por acréscimo, anotada no registro de migrações.",
          "O site só é publicado com o ok da empresa (um chat publica por vez).",
        ].map((t, k) => (
          <li key={t} className="relative text-xs leading-snug text-slate-700">
            <span className="num absolute -left-[1.6rem] top-0 grid h-5 w-5 place-items-center rounded-full bg-modulo-escuro text-2xs font-bold text-white">{k + 1}</span>{t}
          </li>
        ))}
        <li className="relative text-xs leading-snug text-slate-700">
          <span className="num absolute -left-[1.6rem] top-0 grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-2xs font-bold text-white">5</span>
          A versão nova aparece em <button type="button" className={link} onClick={() => onIrAba("atualizacoes")}>Atualizações</button>.
        </li>
      </ol>
      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Onde olhar</h3>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
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
