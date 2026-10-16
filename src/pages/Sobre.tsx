// Sobre o ERP Line (aberta pela versão no fim do menu): o que faz cada módulo, as versões dia a dia, esquemas para
// explicar à equipe (processos, fluxograma do menu com auditoria, cadeia de causas), as ideias e o handoff.
// Cada aba começa pelos indicadores, depois os filtros e as ações.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, CalendarDays, ClipboardCopy, ExternalLink, Eye, History, LayoutGrid, Lightbulb, Lock, Search, Sparkles } from "lucide-react";
import { Button, Card, PageHeader, Stat, Tabs } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useAbaUrl } from "@/lib/abaUrl";
import { grupos, grupoDaRota, itensForaDoMenu, useVisivel, type Item } from "@/lib/menu";
import { PAGINAS_POR_LINK, SOBRE_AREAS, SOBRE_TELAS } from "@/lib/modulos";
import { versoesDoHistorico } from "@/lib/atualizacoes";
import { auditarMenu } from "@/lib/auditoriaMenu";
import { pl } from "@/lib/format";
import { Handoff } from "@/components/sobre/Handoff";
import { Ideias } from "@/components/sobre/Ideias";
import { Esquemas } from "@/components/sobre/Esquemas";
import { ItemModal, type InicialItem } from "@/components/sobre/ItemProjeto";
import { copiar } from "@/components/sobre/Guardanapo";

const VERSAO = typeof __ERP_VERSAO__ !== "undefined" ? __ERP_VERSAO__ : null;
const HISTORICO = typeof __ERP_HISTORICO__ !== "undefined" ? __ERP_HISTORICO__ : [];

const ABAS = ["modulos", "atualizacoes", "esquemas", "ideias", "handoff"] as const;
type Aba = (typeof ABAS)[number];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Sobre() {
  const { tem } = usePerfil();
  const podeHandoff = tem("financeiro", "contador");
  const [aba, setAba] = useAbaUrl<Aba>("modulos", podeHandoff ? ABAS : ABAS.filter((a) => a !== "handoff"));
  const [ideia, setIdeia] = useState<InicialItem | null>(null);
  return (
    <div>
      <PageHeader title="Sobre o ERP Line"
        subtitle={VERSAO ? `Versão ${VERSAO.numero}, de ${VERSAO.quando}. O que faz cada módulo, o que mudou, esquemas para a equipe, ideias e o handoff.` : "O que faz cada módulo, o que mudou, esquemas para a equipe, ideias e o handoff."}
        actions={<Button variant="secondary" onClick={() => setIdeia({})}><Lightbulb size={16} /> Anotar ideia</Button>} />
      <Tabs value={aba} onChange={setAba} options={[
        { value: "modulos", label: "Módulos" }, { value: "atualizacoes", label: "Atualizações" }, { value: "esquemas", label: "Esquemas" },
        { value: "ideias", label: "Ideias" }, ...(podeHandoff ? [{ value: "handoff" as const, label: "Handoff" }] : []),
      ]} />
      {aba === "modulos" && <Modulos onIdeia={setIdeia} onAuditoria={() => setAba("esquemas")} />}
      {aba === "atualizacoes" && <Atualizacoes />}
      {aba === "esquemas" && <Esquemas />}
      {aba === "ideias" && <Ideias />}
      {aba === "handoff" && podeHandoff && <Handoff versao={VERSAO} onIrAba={setAba} />}
      {ideia && <ItemModal tipo="ideia" inicial={ideia} onClose={() => setIdeia(null)} />}
    </div>
  );
}

function Modulos({ onIdeia, onAuditoria }: { onIdeia: (i: InicialItem) => void; onAuditoria: () => void }) {
  const vis = useVisivel();
  const [busca, setBusca] = useState("");
  const [area, setArea] = useState("");
  const [soMeu, setSoMeu] = useState(false);
  const termo = semAcento(busca.trim());
  const combina = (i: Item) => (!soMeu || vis.item(i)) && (!termo || termo.split(/\s+/).every((p) => semAcento(`${i.label} ${SOBRE_TELAS[i.to] ?? ""} ${i.busca ?? ""}`).includes(p)));
  const todosBlocos = [
    ...grupos.map((g) => ({ id: g.id, titulo: g.titulo || "Início", texto: SOBRE_AREAS[g.id] ?? "", cor: g.cor ?? "from-[#64748b] to-[#334155]", Icone: g.icone ?? LayoutGrid, itens: g.itens })),
    { id: "outras", titulo: "Outras telas", texto: "Abertas pela engrenagem, pelos painéis, por botões dentro das telas ou pela busca do menu.", cor: "from-[#64748b] to-[#334155]", Icone: Boxes, itens: itensForaDoMenu },
  ];
  const blocos = todosBlocos.filter((b) => !area || b.id === area).map((b) => ({ ...b, itens: b.itens.filter(combina) })).filter((b) => b.itens.length);
  const todas = [...grupos.flatMap((g) => g.itens), ...itensForaDoMenu];
  const nVe = todas.filter((i) => vis.item(i)).length;
  const achados = useMemo(() => auditarMenu(grupos, itensForaDoMenu, SOBRE_TELAS, grupoDaRota).filter((a) => a.gravidade !== "info").length, []);
  const links = PAGINAS_POR_LINK.filter((p) => !area && (!termo || semAcento(`${p.nome} ${p.texto}`).includes(termo)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Áreas" valor={grupos.filter((g) => g.titulo).length} icon={LayoutGrid} sub="blocos do menu" />
        <Stat label="Telas" valor={todas.length} icon={Boxes} sub={`+ ${PAGINAS_POR_LINK.length} ${pl(PAGINAS_POR_LINK.length, "página", "páginas")} por link`} />
        <Stat label="Seu perfil abre" valor={`${nVe} de ${todas.length}`} icon={Eye} onClick={() => setSoMeu((v) => !v)} sub={soMeu ? "mostrando só as suas" : "tocar para ver só as suas"} />
        <Stat label="Pontos a melhorar no menu" valor={achados} icon={AlertTriangle} tom={achados ? "atencao" : "bom"} onClick={onAuditoria} sub="ver a auditoria em Esquemas" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-md sm:basis-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input h-10 pl-9" type="search" placeholder="Buscar tela ou assunto (ex.: boleto, frete, comissão)" aria-label="Buscar tela ou assunto"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={soMeu} onChange={(e) => setSoMeu(e.target.checked)} /> Só as que eu abro
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Área">
        {[{ id: "", titulo: "Todas" }, ...todosBlocos].map((b) => (
          <button key={b.id || "todas"} type="button" aria-pressed={area === b.id} onClick={() => setArea(b.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${area === b.id ? "bg-modulo-escuro text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {b.titulo}
          </button>
        ))}
      </div>

      {!blocos.length && !links.length && <p className="text-sm text-slate-500">Nenhuma tela {termo ? `com "${busca.trim()}"` : "com esses filtros"}.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {blocos.map(({ id, titulo, texto, cor, Icone, itens }) => (
          <Card key={id} className="min-w-0 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${cor} text-white shadow-sm`} aria-hidden><Icone size={19} /></span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-fg">{titulo} <span className="num text-sm font-semibold text-slate-500">· {itens.length}</span></h2>
                {texto && <p className="text-sm text-slate-600">{texto}</p>}
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {itens.map((i) => {
                const pode = vis.item(i);
                const Icon = i.icon;
                return (
                  <li key={i.to} className="flex gap-2.5 py-2.5">
                    <Icon size={17} className={`mt-0.5 shrink-0 ${pode ? "text-modulo" : "text-slate-400"}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      {pode ? (
                        <Link to={i.to} className="text-sm font-semibold text-fg underline-offset-2 hover:text-modulo-texto hover:underline">{i.label}</Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500" title="Seu perfil não abre esta tela">
                          {i.label} <Lock size={12} aria-label="sem acesso no seu perfil" />
                        </span>
                      )}
                      <p className="text-[13px] leading-snug text-slate-600">{SOBRE_TELAS[i.to] ?? "—"}</p>
                    </div>
                    <button type="button" onClick={() => onIdeia({ titulo: `${i.label}: `, area: id === "outras" ? (grupoDaRota(i.to) ?? "geral") : id })}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600" title={`Anotar ideia sobre ${i.label}`} aria-label={`Anotar ideia sobre ${i.label}`}>
                      <Lightbulb size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}

        {links.length > 0 && (
          <Card className="min-w-0 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0e7490] text-white shadow-sm" aria-hidden><ExternalLink size={19} /></span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-fg">Páginas por link</h2>
                <p className="text-sm text-slate-600">Abertas sem entrar no ERP, pelo link que o ERP manda a clientes, fornecedores e representantes.</p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {links.map((p) => (
                <li key={p.caminho} className="py-2.5">
                  <span className="text-sm font-semibold text-fg">{p.nome}</span> <code className="text-xs text-slate-500">{p.caminho}</code>
                  <p className="text-[13px] leading-snug text-slate-600">{p.texto}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
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
          <p className="num text-2xl font-extrabold text-fg">{VERSAO?.numero ?? "prévia"}</p>
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
                  <span className={`num rounded-lg px-2 py-0.5 text-sm font-extrabold ${i === 0 ? "bg-modulo-escuro text-white" : "bg-slate-100 text-fg"}`}>{v.numero}</span>
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
                        <li key={m.hash} className="flex gap-2.5 text-[13px] leading-snug">
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
