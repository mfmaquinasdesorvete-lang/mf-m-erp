// Ideias para o ERP (Sobre o ERP Line → Ideias): anotar rápido, votar e acompanhar. Quem avalia é o
// administrador (avaliar, planejar, feita ou descartar com o motivo); a ideia aprovada vira pendência do Handoff.
import { useMemo, useState, type FormEvent } from "react";
import { Ban, CheckCircle2, ClipboardList, Columns3, Lightbulb, List, ListChecks, Pencil, RotateCcw, Sparkles, ThumbsUp, Zap, type LucideIcon } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { BarraFiltros, ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { AnelEscuro, LinhaEscura, NumeroEscuro, QuadroEscuro, type FatiaAnel, TOM_ESCURO } from "@/components/painel/PainelEscuro";
import { MenuAcoes } from "@/components/MenuAcoes";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import {
  ROTULO_ESFORCO, ROTULO_PRIORIDADE, ativo, ganhoRapido, indicadoresIdeias, ordenarIdeias, partesTituloIdeia, rotuloSituacao,
  type ItemProjeto, type OrdemIdeias, type SituacaoItem,
} from "@/lib/projeto";
import { AREAS, ItemModal, dataCurta, rotuloArea, useItensProjeto, useMudarSituacao, useVotar, type InicialItem } from "./ItemProjeto";

type Visao = "ativas" | SituacaoItem | "todas";
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// cor de cada situação (bolinha da linha, coluna do quadro e pedaço do anel; o anel usa o tom "neon" no fundo escuro)
const SITUACOES: { id: SituacaoItem; rotulo: string; ponto: string; cor: string; neon: string; icone: LucideIcon }[] = [
  { id: "aberta", rotulo: "Novas", ponto: "bg-amber-500", ...TOM_ESCURO.ambar, icone: Lightbulb },
  { id: "avaliando", rotulo: "Em avaliação", ponto: "bg-sky-500", ...TOM_ESCURO.anil, icone: ClipboardList },
  { id: "planejada", rotulo: "Planejadas", ponto: "bg-purple-500", ...TOM_ESCURO.violeta, icone: ListChecks },
  { id: "feita", rotulo: "Feitas", ponto: "bg-emerald-500", ...TOM_ESCURO.verde, icone: CheckCircle2 },
  { id: "descartada", rotulo: "Descartadas", ponto: "bg-slate-400", ...TOM_ESCURO.cinza, icone: Ban },
];
const daSituacao = (s: SituacaoItem) => SITUACOES.find((x) => x.id === s) ?? SITUACOES[0];

export function Ideias() {
  const { user_id, papel, tem } = usePerfil();
  const admin = papel === "admin";
  const podePendencia = tem("financeiro", "contador");
  const { data: itens = [], isLoading } = useItensProjeto();
  const ideias = useMemo(() => itens.filter((i) => i.tipo === "ideia"), [itens]);
  const ind = useMemo(() => indicadoresIdeias(ideias), [ideias]);
  const dia = hoje();
  const [visao, setVisao] = useState<Visao>("ativas");
  const [area, setArea] = useState("");
  const [ordem, setOrdem] = useState<OrdemIdeias>("votos");
  const [minhas, setMinhas] = useState(false);
  const [soGanho, setSoGanho] = useState(false);
  const [busca, setBusca] = useState("");
  // lista ou quadro por etapa (a escolha fica no aparelho)
  const [modo, setModoState] = useState<"lista" | "quadro">(() => { try { return localStorage.getItem("erp.ideias.modo") === "quadro" ? "quadro" : "lista"; } catch { return "lista"; } });
  const setModo = (m: "lista" | "quadro") => { setModoState(m); try { localStorage.setItem("erp.ideias.modo", m); } catch { /* sem armazenamento */ } };
  const [editando, setEditando] = useState<{ item?: ItemProjeto | null; inicial?: InicialItem } | null>(null);
  const [virando, setVirando] = useState<ItemProjeto | null>(null);
  const mudar = useMudarSituacao();

  const termo = semAcento(busca.trim());
  const base = ideias.filter((i) => (!area || i.area === area) && (!minhas || i.criado_por === user_id) && (!soGanho || ganhoRapido(i))
    && (!termo || termo.split(/\s+/).every((p) => semAcento(`${i.titulo} ${i.detalhe ?? ""}`).includes(p))));
  const naVisao = (i: ItemProjeto, v: Visao) => v === "todas" || (v === "ativas" ? ativo(i) : i.situacao === v);
  const lista = ordenarIdeias(base.filter((i) => naVisao(i, visao)), ordem);
  const nFiltros = (area ? 1 : 0) + (minhas ? 1 : 0) + (soGanho ? 1 : 0);
  const ir = (f: () => void) => { setVisao("ativas"); setArea(""); setMinhas(false); setSoGanho(false); setBusca(""); f(); };
  const linha = (i: ItemProjeto, compacta?: boolean) => (
    <LinhaIdeia key={i.id} i={i} dia={dia} meu={i.criado_por === user_id} votei={i.votos.includes(user_id)} admin={admin} compacta={compacta}
      podePendencia={podePendencia} onEditar={() => setEditando({ item: i })} onVirarPendencia={() => setVirando(i)} mudar={mudar} />
  );

  return (
    <div className="space-y-4">
      {/* 1º: anotar rápido, sem sair da tela */}
      <AnotarRapido onDetalhes={(inicial) => setEditando({ inicial })} />

      <PainelIdeias ideias={ideias} ind={ind} visao={visao} onVisao={(v) => ir(() => setVisao(v))}
        onGanho={() => ir(() => { setSoGanho(true); setOrdem("ganho"); })} onVotadas={() => ir(() => setOrdem("votos"))} />

      <Card className="p-4 sm:p-5">
        <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar ideia"
          filtros={<>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Área</span>
              <select className="input w-auto" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Todas as áreas</option>
                {AREAS.filter((a) => ideias.some((i) => i.area === a.id)).map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
              </select></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Ordem</span>
              <select className="input w-auto" value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemIdeias)}>
                <option value="votos">Mais votadas</option>
                <option value="ganho">Ganho rápido primeiro</option>
                <option value="recentes">Mais recentes</option>
              </select></label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600"><input type="checkbox" checked={minhas} onChange={(e) => setMinhas(e.target.checked)} /> Só as minhas</label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600"><input type="checkbox" checked={soGanho} onChange={(e) => setSoGanho(e.target.checked)} /> Só ganho rápido</label>
          </>}
          nFiltros={nFiltros} onLimpar={() => ir(() => {})}
          direita={
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm font-semibold" role="group" aria-label="Ver como">
              {([["lista", "Lista", List], ["quadro", "Quadro", Columns3]] as const).map(([v, l, I]) => (
                <button key={v} type="button" aria-pressed={modo === v} onClick={() => setModo(v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${modo === v ? "bg-brand text-brand-fg" : "bg-surface text-slate-600 hover:bg-slate-50"}`}><I size={15} /> {l}</button>
              ))}
            </div>} />

        {modo === "lista" ? <>
          <ChipsSituacao valor={visao} onChange={setVisao} rotulo="Situação"
            opcoes={([["ativas", "Em aberto"], ["aberta", "Novas"], ["avaliando", "Em avaliação"], ["planejada", "Planejadas"], ["feita", "Feitas"], ["descartada", "Descartadas"], ["todas", "Todas"]] as [Visao, string][])
              .map(([v, l]) => ({ value: v, label: l, n: base.filter((i) => naVisao(i, v)).length }))} />
          {!lista.length && !isLoading && <p className="py-6 text-center text-sm text-slate-500">Nenhuma ideia {nFiltros || termo || visao !== "ativas" ? "com esses filtros" : "ainda: anote a primeira acima"}.</p>}
          <ul className="divide-y divide-slate-100">{lista.map((i) => linha(i))}</ul>
        </> : (
          // quadro: uma coluna por etapa (as descartadas ficam só na lista)
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {SITUACOES.filter((x) => x.id !== "descartada").map((x) => {
              const daColuna = ordenarIdeias(base.filter((i) => i.situacao === x.id), x.id === "feita" ? "recentes" : ordem);
              return (
                <section key={x.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                  <h3 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-fg">
                    <span className={`h-2.5 w-2.5 rounded-full ${x.ponto}`} aria-hidden />{x.rotulo}<span className="num ml-auto text-xs font-semibold text-slate-500">{daColuna.length}</span>
                  </h3>
                  <ul className="space-y-2">
                    {daColuna.slice(0, x.id === "feita" ? 8 : 50).map((i) => linha(i, true))}
                    {!daColuna.length && <li className="px-1 py-3 text-center text-xs text-slate-500">Nada aqui.</li>}
                  </ul>
                  {x.id === "feita" && daColuna.length > 8 && <p className="mt-2 px-1 text-xs text-slate-500">e mais {daColuna.length - 8} na lista (Feitas).</p>}
                </section>
              );
            })}
          </div>
        )}
        {!admin && <p className="mt-3 text-xs text-slate-500">Quem avalia as ideias é o administrador. Você pode votar nas ideias e editar ou retirar as suas.</p>}
      </Card>

      {editando && <ItemModal tipo="ideia" item={editando.item} inicial={editando.inicial} onClose={() => setEditando(null)} />}
      {virando && (
        <ItemModal tipo="pendencia" inicial={{ titulo: virando.titulo, detalhe: virando.detalhe, area: virando.area, prioridade: virando.prioridade, responsavel: "claude" }}
          onClose={() => setVirando(null)}
          onSalvo={async () => {
            // a ideia fica planejada: o trabalho segue como pendência no Handoff
            if (admin && virando.situacao !== "planejada") {
              const { error } = await supabase.rpc("mudar_situacao_projeto", { p_id: virando.id, p_situacao: "planejada", p_motivo: null });
              if (error) notifyError(error);
            }
          }} />
      )}
    </div>
  );
}

/** Topo no estilo painel escuro: as ideias em aberto no centro do anel (um pedaço por situação; tocar filtra). */
function PainelIdeias({ ideias, ind, visao, onVisao, onGanho, onVotadas }: {
  ideias: ItemProjeto[]; ind: ReturnType<typeof indicadoresIdeias>; visao: Visao; onVisao: (v: Visao) => void; onGanho: () => void; onVotadas: () => void;
}) {
  const conta = (s: SituacaoItem) => ideias.filter((i) => i.situacao === s).length;
  const fatias: FatiaAnel<SituacaoItem>[] = SITUACOES.map((x) => ({ id: x.id, rotulo: x.rotulo, valor: conta(x.id), cor: x.cor, neon: x.neon, dica: `${x.rotulo}: ${conta(x.id)}` }));
  const escolhida = SITUACOES.some((x) => x.id === visao) ? (visao as SituacaoItem) : "";
  const daVez = escolhida ? daSituacao(escolhida) : null;
  const mv = ind.maisVotada;
  return (
    <QuadroEscuro rotulo="Ideias para o ERP" titulo="Ideias" destaque="para o ERP" className=""
      filtro={daVez ? { texto: daVez.rotulo, onLimpar: () => onVisao("ativas") } : undefined}>
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,15.5rem)_auto_minmax(0,1fr)] lg:gap-6">
        <div className="order-1 min-w-0 lg:order-2">
          <AnelEscuro fatias={fatias} escolhida={escolhida} onEscolher={(id) => onVisao(id || "ativas")} rotulo={`${ind.ativas} ideias em aberto`}
            centro={daVez
              ? { rotulo: daVez.rotulo, valor: String(conta(daVez.id)), sub: pl(conta(daVez.id), "ideia", "ideias") }
              : { rotulo: "Em aberto", valor: String(ind.ativas), sub: `de ${ideias.length} · ${ind.feitas} ${pl(ind.feitas, "feita", "feitas")}` }} />
        </div>
        <div className="order-2 grid min-w-0 grid-cols-2 gap-2 lg:order-1 lg:grid-cols-1">
          <NumeroEscuro icone={Lightbulb} rotulo="Novas" valor={ind.novas} sub="esperando avaliação" tom="ambar" aceso={ind.novas > 0} onClick={() => onVisao("aberta")} />
          <NumeroEscuro icone={Zap} rotulo="Ganho rápido" valor={ind.ganhoRapido} sub="ajuda muito, pouco trabalho" tom="verde" aceso={ind.ganhoRapido > 0} onClick={onGanho} />
          <NumeroEscuro icone={ThumbsUp} rotulo="Mais votada" valor={mv ? `${mv.votos.length} ${pl(mv.votos.length, "voto", "votos")}` : "—"}
            sub={mv ? partesTituloIdeia(mv.titulo).texto : "vote nas ideias"} tom="anil" aceso={!!mv} onClick={onVotadas} />
          <NumeroEscuro icone={ListChecks} rotulo="Planejadas" valor={ind.planejadas} sub="viram pendência no Handoff" tom="violeta" aceso={ind.planejadas > 0} onClick={() => onVisao("planejada")} />
        </div>
        <ul className="order-3 grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1" aria-label="Por situação">
          {SITUACOES.map((x) => {
            const n = conta(x.id), ativa = escolhida === x.id;
            return (
              <li key={x.id} className="min-w-0">
                <LinhaEscura icone={x.icone} rotulo={x.rotulo} valor={n} pct={ideias.length ? Math.round((n / ideias.length) * 100) : 0} cor={x.cor} neon={x.neon}
                  ativo={ativa} apagado={!!escolhida && !ativa} onClick={() => onVisao(ativa ? "ativas" : x.id)} title="Toque para ver só estas ideias" />
              </li>
            );
          })}
        </ul>
      </div>
    </QuadroEscuro>
  );
}

/** Campo de uma linha para anotar a ideia na hora (Enter salva); "mais detalhes" abre a janela completa. */
function AnotarRapido({ onDetalhes }: { onDetalhes: (inicial: InicialItem) => void }) {
  const [titulo, setTitulo] = useState("");
  const [area, setArea] = useState("geral");
  const [salvando, setSalvando] = useState(false);
  const invalidate = useInvalidate();
  async function anotar(e: FormEvent) {
    e.preventDefault();
    if (titulo.trim().length < 3) return;
    setSalvando(true);
    const { error } = await supabase.rpc("salvar_item_projeto", { p_id: null, p_tipo: "ideia", p_titulo: titulo, p_area: area });
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Ideia anotada");
    setTitulo("");
    invalidate("projeto_itens");
  }
  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={anotar} className="flex flex-wrap items-center gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm" aria-hidden><Sparkles size={19} /></span>
        <input className="input h-10 min-w-0 flex-1 basis-60" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160}
          placeholder="Anote uma ideia para o ERP (ex.: avisar o cliente quando a máquina sair do conserto)" aria-label="Nova ideia" />
        <select className="input h-10 w-auto" aria-label="Área da ideia" value={area} onChange={(e) => setArea(e.target.value)}>
          {AREAS.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
        </select>
        <Button type="submit" disabled={salvando || titulo.trim().length < 3}><Lightbulb size={16} /> Anotar</Button>
        <button type="button" onClick={() => onDetalhes({ titulo, area })} className="text-sm font-semibold text-modulo-texto hover:underline">mais detalhes</button>
      </form>
    </Card>
  );
}

function LinhaIdeia({ i, dia, meu, votei, admin, podePendencia, compacta, onEditar, onVirarPendencia, mudar }: {
  i: ItemProjeto; dia: string; meu: boolean; votei: boolean; admin: boolean; podePendencia: boolean; compacta?: boolean;
  onEditar: () => void; onVirarPendencia: () => void; mudar: ReturnType<typeof useMudarSituacao>;
}) {
  const votar = useVotar();
  const proximo: Partial<Record<SituacaoItem, [string, SituacaoItem]>> = { aberta: ["Avaliar", "avaliando"], avaliando: ["Planejar", "planejada"], planejada: ["Feita", "feita"] };
  const passo = admin ? proximo[i.situacao] : undefined;
  const { codigo, texto } = partesTituloIdeia(i.titulo);
  const sit = daSituacao(i.situacao);
  // impacto e esforço juntos numa etiqueta só, na cor do impacto
  const corImpacto = i.prioridade === "alta" ? "bg-red-50 text-red-700 ring-red-200" : i.prioridade === "media" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200";
  const voto = (
    <button type="button" onClick={() => votar(i)} aria-pressed={votei} title={votei ? "Tirar meu voto" : "Votar nesta ideia"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition ${votei ? "border-brand/40 bg-brand/10 text-brand" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
      <ThumbsUp size={13} aria-hidden /><span className="num">{i.votos.length}</span>
      <span className="sr-only">{pl(i.votos.length, "voto", "votos")}</span>
    </button>
  );
  const acoes = (
    <div className="flex shrink-0 items-start gap-1">
      {passo && <Button variant="secondary" className="!min-h-0 !px-2 !py-1 text-xs whitespace-nowrap" onClick={() => mudar(i, passo[1])}>{passo[0]}</Button>}
      {admin && !ativo(i) && <Button variant="secondary" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => mudar(i, "aberta")}><RotateCcw size={14} /> Reabrir</Button>}
      <MenuAcoes itens={[
        admin && i.situacao !== "avaliando" && ativo(i) && { rotulo: "Em avaliação", icone: ClipboardList, onClick: () => mudar(i, "avaliando") },
        admin && i.situacao !== "planejada" && ativo(i) && { rotulo: "Planejar", icone: ListChecks, onClick: () => mudar(i, "planejada") },
        podePendencia && ativo(i) && { rotulo: "Virar pendência no Handoff", icone: ClipboardList, onClick: onVirarPendencia },
        admin && ativo(i) && { rotulo: "Marcar feita", icone: CheckCircle2, onClick: () => mudar(i, "feita") },
        (admin || meu) && { rotulo: "Editar", icone: Pencil, onClick: onEditar },
        (admin || meu) && ativo(i) && { rotulo: meu && !admin ? "Retirar minha ideia…" : "Descartar…", icone: Ban, onClick: () => mudar(i, "descartada"), perigo: true },
        meu && !admin && i.situacao === "descartada" && { rotulo: "Voltar a valer", icone: RotateCcw, onClick: () => mudar(i, "aberta") },
      ]} />
    </div>
  );
  const etiquetas = (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-slate-500">
      {ganhoRapido(i) && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800"><Zap size={11} aria-hidden /> ganho rápido</span>}
      <span className={`rounded-full px-2 py-0.5 font-bold ring-1 ring-inset ${corImpacto}`}>
        impacto {ROTULO_PRIORIDADE[i.prioridade].toLowerCase()}{i.esforco ? ` · esforço ${ROTULO_ESFORCO[i.esforco].toLowerCase()}` : ""}
      </span>
      <span className="font-semibold text-slate-600">{rotuloArea(i.area)}</span>
      <span>· {i.criado_nome ? `${i.criado_nome}, ` : ""}{dataCurta(i.created_at, dia)}</span>
      {i.motivo && <span className="w-full text-slate-600">motivo: {i.motivo}</span>}
    </div>
  );
  const titulo = (
    <p className={`font-semibold leading-snug text-fg ${compacta ? "text-sm" : ""} ${i.situacao === "descartada" ? "line-through" : ""}`}>
      {texto}{codigo && <span className="ml-1.5 whitespace-nowrap rounded bg-slate-100 px-1.5 py-px align-middle font-mono text-2xs font-semibold text-slate-500" title="Código do roteiro">{codigo}</span>}
    </p>
  );

  if (compacta) {
    // cartão do quadro
    return (
      <li className={`rounded-lg border border-slate-200 bg-surface p-2.5 shadow-card ${ativo(i) ? "" : "opacity-75"}`}>
        {titulo}
        {i.detalhe && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600" title={i.detalhe}>{i.detalhe}</p>}
        {etiquetas}
        <div className="mt-2 flex items-center justify-between gap-2">{voto}{acoes}</div>
      </li>
    );
  }
  return (
    // no celular o voto e as ações descem para baixo do texto (ao lado, espremiam a ideia numa coluna estreita)
    <li className={`flex flex-wrap gap-x-3 gap-y-2 py-3 sm:flex-nowrap ${ativo(i) ? "" : "opacity-75"}`}>
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${sit.ponto}`} title={rotuloSituacao("ideia", i.situacao)} aria-label={rotuloSituacao("ideia", i.situacao)} />
      <div className="min-w-0 flex-1">
        {titulo}
        {i.detalhe && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs leading-snug text-slate-600" title={i.detalhe}>{i.detalhe}</p>}
        {etiquetas}
      </div>
      <div className="ml-[1.375rem] flex w-full items-start justify-between gap-1.5 sm:ml-0 sm:w-auto sm:shrink-0 sm:justify-start">{voto}{acoes}</div>
    </li>
  );
}
