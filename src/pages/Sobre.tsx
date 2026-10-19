// Sobre o ERP Line (aberta pela versão no fim do menu): o que faz cada módulo, os sistemas (finance-os, analytics-os,
// ops-os, innovation-os, capability-showcase e a linguagem de comandos ECL), o Monitor (saúde das automações, filas,
// backup e o registro das execuções — só o administrador), a rodada de trabalho em curso (VISUALIZE), as versões dia a
// dia, o checklist dos pedidos (com quantas vezes cada tela mudou), esquemas para explicar à equipe (processos, fluxograma do menu com auditoria, cadeia de causas), as ideias e o handoff.
// Cada aba começa pelos indicadores, depois os filtros e as ações.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, CalendarDays, ClipboardCopy, ExternalLink, Eye, History, LayoutGrid, Lightbulb, Lock, Search, Settings, Sparkles } from "lucide-react";
import { Button, Card, PageHeader, Stat, Tabs } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useAbaUrl } from "@/lib/abaUrl";
import { grupos, grupoDaRota, itensForaDoMenu, useVisivel, type Item } from "@/lib/menu";
import { ONDE_ABRE, PAGINAS_POR_LINK, SOBRE_AREAS, SOBRE_TELAS } from "@/lib/modulos";
import { versoesDoHistorico } from "@/lib/atualizacoes";
import { auditarMenu } from "@/lib/auditoriaMenu";
import { pl } from "@/lib/format";
import { Handoff } from "@/components/sobre/Handoff";
import { ModulosCartoes } from "@/components/sobre/ModulosCartoes";
import { Ideias } from "@/components/sobre/Ideias";
import { Esquemas } from "@/components/sobre/Esquemas";
import { Sistemas } from "@/components/sobre/Sistemas";
import { Rodada } from "@/components/sobre/Rodada";
import { Monitor } from "@/components/sobre/Monitor";
import { PedidosChecklist } from "@/components/sobre/PedidosChecklist";
import { TelasAlteradas } from "@/components/sobre/TelasAlteradas";
import { CodigoErp } from "@/components/sobre/CodigoErp";
import { ItemModal, type InicialItem } from "@/components/sobre/ItemProjeto";
import { copiar } from "@/components/sobre/Guardanapo";

const VERSAO = typeof __ERP_VERSAO__ !== "undefined" ? __ERP_VERSAO__ : null;
const HISTORICO = typeof __ERP_HISTORICO__ !== "undefined" ? __ERP_HISTORICO__ : [];

const ABAS = ["modulos", "sistemas", "monitor", "rodada", "pedidos", "telas", "codigo", "atualizacoes", "esquemas", "ideias", "handoff"] as const;
type Aba = (typeof ABAS)[number];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Sobre() {
  const { tem, papel } = usePerfil();
  const podeHandoff = tem("financeiro", "contador");
  const ehAdmin = papel === "admin";
  // Rodada e Handoff falam de finanças e decisões da empresa: financeiro, contador e administrador. Monitor: só o administrador
  const [aba, setAba] = useAbaUrl<Aba>("modulos", ABAS.filter((a) =>
    (podeHandoff || (a !== "handoff" && a !== "rodada")) && (ehAdmin || a !== "monitor")));
  const [ideia, setIdeia] = useState<InicialItem | null>(null);
  const [pendencia, setPendencia] = useState<InicialItem | null>(null);
  return (
    <div>
      <PageHeader title="Sobre o ERP Line"
        subtitle={VERSAO ? `Versão ${VERSAO.numero}, de ${VERSAO.quando}. O que faz cada módulo, os sistemas, a saúde do ERP, o que mudou, esquemas para a equipe, ideias e o handoff.` : "O que faz cada módulo, os sistemas, a saúde do ERP, o que mudou, esquemas para a equipe, ideias e o handoff."}
        actions={<Button variant="secondary" onClick={() => setIdeia({})}><Lightbulb size={16} /> Anotar ideia</Button>} />
      <Tabs value={aba} onChange={setAba} options={[
        { value: "modulos", label: "Módulos" }, { value: "sistemas", label: "Sistemas" }, ...(ehAdmin ? [{ value: "monitor" as const, label: "Monitor" }] : []),
        ...(podeHandoff ? [{ value: "rodada" as const, label: "Rodada" }] : []),
        { value: "pedidos", label: "Pedidos" }, { value: "telas", label: "Telas alteradas" }, { value: "codigo", label: "Código" }, { value: "atualizacoes", label: "Atualizações" }, { value: "esquemas", label: "Esquemas" },
        { value: "ideias", label: "Ideias" }, ...(podeHandoff ? [{ value: "handoff" as const, label: "Handoff" }] : []),
      ]} />
      {aba === "modulos" && <ModulosCartoes onIdeia={setIdeia} onAuditoria={() => setAba("esquemas")} />}
      {aba === "sistemas" && <Sistemas onIdeia={setIdeia} />}
      {aba === "monitor" && ehAdmin && <Monitor />}
      {aba === "rodada" && podeHandoff && <Rodada versao={VERSAO} onIdeia={setIdeia} onPendencia={setPendencia} />}
      {aba === "pedidos" && <PedidosChecklist />}
      {aba === "telas" && <TelasAlteradas />}
      {aba === "codigo" && <CodigoErp />}
      {aba === "atualizacoes" && <Atualizacoes />}
      {aba === "esquemas" && <Esquemas />}
      {aba === "ideias" && <Ideias />}
      {aba === "handoff" && podeHandoff && <Handoff versao={VERSAO} onIrAba={setAba} />}
      {ideia && <ItemModal tipo="ideia" inicial={ideia} onClose={() => setIdeia(null)} />}
      {pendencia && <ItemModal tipo="pendencia" inicial={pendencia} onClose={() => setPendencia(null)} />}
    </div>
  );
}

const diaPorExtenso = (dia: string) =>
  new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const diasAntes = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

type Periodo = "tudo" | "7" | "30";

function Atualizacoes() {
  const versoes = useMemo(() => versoesDoHistorico(HISTORICO), []);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const total = versoes.reduce((s, v) => s + v.mudancas.length, 0);
  const ultimo = versoes[0]?.dia ?? "";
  const semana = versoes.filter((v) => v.dia > diasAntes(ultimo, 7)).reduce((s, v) => s + v.mudancas.length, 0);
  const termo = semAcento(busca.trim());
  const visiveis = versoes
    .filter((v) => periodo === "tudo" || v.dia > diasAntes(ultimo, Number(periodo)))
    .map((v) => {
      if (!termo) return { ...v, achou: false };
      const combina = (t: string) => termo.split(/\s+/).every((p) => semAcento(t).includes(p));
      const itens = v.itens.filter(combina);
      const mudancas = v.mudancas.filter((m) => combina(m.texto));
      return { ...v, itens: combina(v.titulo ?? "") ? v.itens : itens, mudancas, achou: true, vazio: !itens.length && !mudancas.length && !combina(v.titulo ?? "") };
    })
    .filter((v) => !("vazio" in v && v.vazio));
  const copiarDia = (v: (typeof versoes)[number]) =>
    copiar([`ERP Line ${v.numero} · ${diaPorExtenso(v.dia)}`, v.titulo ?? "", ...v.itens.map((t) => `• ${t}`), `${v.mudancas.length} ${pl(v.mudancas.length, "mudança", "mudanças")} no dia.`].filter(Boolean).join("\n"), "Novidades copiadas");

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-modulo to-modulo-escuro text-white shadow-card" aria-hidden><Sparkles size={21} /></span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-modulo-texto">Versão em uso</p>
          <p className="num text-2xl font-bold text-fg">{VERSAO?.numero ?? "prévia"}</p>
          {VERSAO && <p className="text-sm text-slate-600">de {VERSAO.quando} · código <code className="text-xs">{VERSAO.hash}</code></p>}
        </div>
        <p className="min-w-0 max-w-xl flex-1 basis-64 text-sm text-slate-600">
          Cada dia de trabalho vira uma versão: <b>1.9</b> é o 9º dia. O último número conta as mudanças publicadas no dia
          (<b>1.9.27</b> é a 27ª mudança do 9º dia).
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="No último dia" valor={versoes[0]?.mudancas.length ?? 0} icon={Sparkles} tom="info" sub={versoes[0] ? diaPorExtenso(versoes[0].dia).replace(/^[^,]+, /, "") : "—"} />
        <Stat label="Últimos 7 dias" valor={semana} icon={CalendarDays} onClick={() => setPeriodo("7")} sub="mudanças" />
        <Stat label="Dias de trabalho" valor={versoes.length} icon={History} onClick={() => setPeriodo("tudo")} />
        <Stat label="Mudanças no total" valor={total.toLocaleString("pt-BR")} icon={Boxes} sub={versoes.length ? `desde ${diaPorExtenso(versoes[versoes.length - 1].dia).replace(/^[^,]+, /, "")}` : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-md sm:basis-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input h-10 pl-9" type="search" placeholder="Buscar mudança (ex.: boleto, NF-e, vendas)" aria-label="Buscar mudança" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Período">
          {([["tudo", "Tudo"], ["7", "7 dias"], ["30", "30 dias"]] as [Periodo, string][]).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={periodo === v} onClick={() => setPeriodo(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${periodo === v ? "bg-modulo-escuro text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
          ))}
        </div>
      </div>
      {!visiveis.length && <p className="text-sm text-slate-500">Nenhuma mudança {termo ? `com "${busca.trim()}"` : "no período"}.</p>}

      <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4 sm:pl-6">
        {visiveis.map((v) => {
          const i = versoes.indexOf(versoes.find((x) => x.dia === v.dia)!);
          return (
            <li key={v.dia} className="relative">
              <span className={`absolute -left-[23px] top-5 h-3 w-3 rounded-full sm:-left-[31px] ${i === 0 ? "bg-modulo" : "bg-slate-300"}`} aria-hidden />
              <Card className="min-w-0 p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`num rounded-lg px-2 py-0.5 text-sm font-bold ${i === 0 ? "bg-modulo-escuro text-white" : "bg-slate-100 text-fg"}`}>{v.numero}</span>
                  <span className="text-sm font-semibold capitalize text-slate-600">{diaPorExtenso(v.dia)}</span>
                  {i === 0 && VERSAO && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">em uso</span>}
                  <button type="button" onClick={() => copiarDia(versoes[i])} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-fg" title="Copiar as novidades do dia para mandar à equipe">
                    <ClipboardCopy size={13} aria-hidden /> Copiar
                  </button>
                </div>
                {v.titulo && <h2 className="mt-1.5 text-base font-bold text-fg">{v.titulo}</h2>}
                {v.itens.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 marker:text-modulo">
                    {v.itens.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                )}
                {v.mudancas.length > 0 && (
                  <details className="group mt-3" open={!v.itens.length || v.achou}>
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      <History size={13} aria-hidden /> {v.mudancas.length} {pl(v.mudancas.length, "mudança", "mudanças")} {termo ? "encontradas" : "do dia"}
                    </summary>
                    <ol className="mt-2 space-y-1.5">
                      {[...v.mudancas].reverse().map((m) => (
                        <li key={m.hash} className="flex gap-2.5 text-xs leading-snug">
                          <span className="num shrink-0 text-slate-500">{m.hora}</span>
                          <span className="min-w-0 text-slate-700">{m.texto}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
