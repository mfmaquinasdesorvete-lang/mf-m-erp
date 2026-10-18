// Ideias para o ERP (Sobre o ERP Line → Ideias): anotar rápido, votar e acompanhar. Quem avalia é o
// administrador (avaliar, planejar, feita ou descartar com o motivo); a ideia aprovada vira pendência do Handoff.
import { useMemo, useState, type FormEvent } from "react";
import { Ban, CheckCircle2, ClipboardList, Lightbulb, ListChecks, Pencil, RotateCcw, Search, Sparkles, ThumbsUp, Zap } from "lucide-react";
import { Button, Card, Stat } from "@/components/ui";
import { ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { MenuAcoes } from "@/components/MenuAcoes";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import {
  ROTULO_ESFORCO, ativo, ganhoRapido, indicadoresIdeias, ordenarIdeias, type ItemProjeto, type OrdemIdeias, type SituacaoItem,
} from "@/lib/projeto";
import { AREAS, ChipArea, ChipPrioridade, ChipSituacao, ItemModal, dataCurta, useItensProjeto, useMudarSituacao, useVotar, type InicialItem } from "./ItemProjeto";

type Visao = "ativas" | SituacaoItem | "todas";
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
  const [editando, setEditando] = useState<{ item?: ItemProjeto | null; inicial?: InicialItem } | null>(null);
  const [virando, setVirando] = useState<ItemProjeto | null>(null);
  const mudar = useMudarSituacao();

  const termo = semAcento(busca.trim());
  const base = ideias.filter((i) => (!area || i.area === area) && (!minhas || i.criado_por === user_id) && (!soGanho || ganhoRapido(i))
    && (!termo || termo.split(/\s+/).every((p) => semAcento(`${i.titulo} ${i.detalhe ?? ""}`).includes(p))));
  const naVisao = (i: ItemProjeto, v: Visao) => v === "todas" || (v === "ativas" ? ativo(i) : i.situacao === v);
  const lista = ordenarIdeias(base.filter((i) => naVisao(i, visao)), ordem);
  const nFiltros = (area ? 1 : 0) + (minhas ? 1 : 0) + (soGanho ? 1 : 0) + (termo ? 1 : 0);
  const ir = (f: () => void) => { setVisao("ativas"); setArea(""); setMinhas(false); setSoGanho(false); setBusca(""); f(); };

  return (
    <div className="space-y-4">
      {/* 1º: anotar rápido, sem sair da tela */}
      <AnotarRapido onDetalhes={(inicial) => setEditando({ inicial })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Novas" valor={ind.novas} icon={Lightbulb} tom={ind.novas ? "atencao" : "neutro"} onClick={() => ir(() => setVisao("aberta"))} sub="esperando avaliação" />
        <Stat label="Em avaliação" valor={ind.avaliando} icon={ClipboardList} tom="info" onClick={() => ir(() => setVisao("avaliando"))} />
        <Stat label="Planejadas" valor={ind.planejadas} icon={ListChecks} tom="info" onClick={() => ir(() => setVisao("planejada"))} sub="viram pendência no Handoff" />
        <Stat label="Feitas" valor={ind.feitas} icon={CheckCircle2} tom="bom" onClick={() => ir(() => setVisao("feita"))} />
        <Stat label="Ganho rápido" valor={ind.ganhoRapido} icon={Zap} tom={ind.ganhoRapido ? "bom" : "neutro"} onClick={() => ir(() => { setSoGanho(true); setOrdem("ganho"); })} sub="ajuda muito, pouco trabalho" />
        <Stat label="Mais votada" valor={ind.maisVotada ? `${ind.maisVotada.votos.length} ${pl(ind.maisVotada.votos.length, "voto", "votos")}` : "—"} icon={ThumbsUp}
          onClick={() => ir(() => setOrdem("votos"))} sub={ind.maisVotada ? <span className="line-clamp-1">{ind.maisVotada.titulo}</span> : "vote nas ideias"} />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input h-10 pl-9" type="search" placeholder="Buscar ideia" aria-label="Buscar ideia" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select className="input h-10 w-auto" aria-label="Área" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas as áreas</option>
            {AREAS.filter((a) => ideias.some((i) => i.area === a.id)).map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
          </select>
          <select className="input h-10 w-auto" aria-label="Ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemIdeias)}>
            <option value="votos">Mais votadas</option>
            <option value="ganho">Ganho rápido primeiro</option>
            <option value="recentes">Mais recentes</option>
          </select>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={minhas} onChange={(e) => setMinhas(e.target.checked)} /> Só as minhas
          </label>
          {nFiltros > 0 && <button type="button" onClick={() => ir(() => {})} className="text-xs font-semibold text-slate-500 hover:text-fg">Limpar filtros ({nFiltros})</button>}
        </div>
        <div className="mt-3">
          <ChipsSituacao valor={visao} onChange={setVisao} rotulo="Situação"
            opcoes={([["ativas", "Em aberto"], ["aberta", "Novas"], ["avaliando", "Em avaliação"], ["planejada", "Planejadas"], ["feita", "Feitas"], ["descartada", "Descartadas"], ["todas", "Todas"]] as [Visao, string][])
              .map(([v, l]) => ({ value: v, label: l, n: base.filter((i) => naVisao(i, v)).length }))} />
        </div>

        {!lista.length && !isLoading && <p className="py-6 text-center text-sm text-slate-500">Nenhuma ideia {nFiltros || visao !== "ativas" ? "com esses filtros" : "ainda: anote a primeira acima"}.</p>}
        <ul className="divide-y divide-slate-100">
          {lista.map((i) => (
            <LinhaIdeia key={i.id} i={i} dia={dia} meu={i.criado_por === user_id} votei={i.votos.includes(user_id)} admin={admin}
              podePendencia={podePendencia} onEditar={() => setEditando({ item: i })} onVirarPendencia={() => setVirando(i)} mudar={mudar} />
          ))}
        </ul>
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

function LinhaIdeia({ i, dia, meu, votei, admin, podePendencia, onEditar, onVirarPendencia, mudar }: {
  i: ItemProjeto; dia: string; meu: boolean; votei: boolean; admin: boolean; podePendencia: boolean;
  onEditar: () => void; onVirarPendencia: () => void; mudar: ReturnType<typeof useMudarSituacao>;
}) {
  const votar = useVotar();
  const proximo: Partial<Record<SituacaoItem, [string, SituacaoItem]>> = { aberta: ["Avaliar", "avaliando"], avaliando: ["Planejar", "planejada"], planejada: ["Feita", "feita"] };
  const passo = admin ? proximo[i.situacao] : undefined;
  return (
    <li className={`flex gap-3 py-3 ${ativo(i) ? "" : "opacity-75"}`}>
      <button type="button" onClick={() => votar(i)} aria-pressed={votei} title={votei ? "Tirar meu voto" : "Votar nesta ideia"}
        className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-xs font-bold transition ${votei ? "border-brand bg-brand text-brand-fg" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
        <ThumbsUp size={16} aria-hidden /><span className="num mt-0.5">{i.votos.length}</span>
        <span className="sr-only">{pl(i.votos.length, "voto", "votos")}</span>
      </button>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold leading-snug text-fg ${i.situacao === "descartada" ? "line-through" : ""}`}>{i.titulo}</p>
        {i.detalhe && <p className="mt-0.5 whitespace-pre-line text-xs leading-snug text-slate-600">{i.detalhe}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ChipSituacao i={i} />
          {ganhoRapido(i) && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-2xs font-bold text-emerald-800"><Zap size={11} aria-hidden /> ganho rápido</span>}
          <ChipPrioridade p={i.prioridade} rotulo="impacto" />
          {i.esforco && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-bold text-slate-600">esforço {ROTULO_ESFORCO[i.esforco].toLowerCase()}</span>}
          <ChipArea area={i.area} />
          <span className="text-2xs text-slate-500">{i.criado_nome ? `por ${i.criado_nome} · ` : ""}{dataCurta(i.created_at, dia)}</span>
          {i.motivo && <span className="text-2xs text-slate-600">motivo: {i.motivo}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-1.5">
        {passo && <Button variant="secondary" className="!min-h-0 !px-2.5 !py-1.5 whitespace-nowrap" onClick={() => mudar(i, passo[1])}>{passo[0]}</Button>}
        {admin && !ativo(i) && <Button variant="secondary" className="!min-h-0 !px-2.5 !py-1.5" onClick={() => mudar(i, "aberta")}><RotateCcw size={15} /> Reabrir</Button>}
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
    </li>
  );
}
