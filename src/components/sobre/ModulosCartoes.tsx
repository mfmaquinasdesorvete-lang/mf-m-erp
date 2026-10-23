// Sobre o ERP Line → Módulos: um cartão para cada tela, no estilo de vitrine — ícone, palavras-chave, nome, o que faz,
// o ganho em destaque e "Saiba mais", que abre tudo o que a tela faz (cada aba, botão, automação e integração).
// Os textos ficam em src/lib/modulos.ts (resumo) e src/lib/modulosDetalhe.ts (tudo); o teste avisa quando falta texto.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Boxes, ChevronsDownUp, ChevronsUpDown, ExternalLink, Eye, IceCreamCone, Info, LayoutGrid, Lightbulb, Lock, Search, Settings, Wallet } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { grupos, grupoDaRota, itensForaDoMenu, useVisivel, type Item } from "@/lib/menu";
import { ONDE_ABRE, PAGINAS_POR_LINK, SOBRE_AREAS, SOBRE_TELAS } from "@/lib/modulos";
import { DETALHE_TELAS } from "@/lib/modulosDetalhe";
import { auditarMenu } from "@/lib/auditoriaMenu";
import { pl } from "@/lib/format";
import type { InicialItem } from "@/components/sobre/ItemProjeto";
import { PaginasPorLink } from "./PaginasPorLink";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** As duas cores do degradê da área ("from-fixo-emerald-500 to-fixo-emerald-600"). */
const coresDe = (cor: string) => {
  const hex = cor.match(/#[0-9a-f]{6}/gi) ?? ["#64748b", "#334155"];
  return { clara: hex[0], escura: hex[1] ?? hex[0] };
};
// texto na cor da área, puxado para a cor do texto da tela: fica legível no tema claro e no escuro
const tinta = (hex: string) => `color-mix(in srgb, ${hex} 72%, currentColor)`;

/** Telas só da conta master, fora do menu: pela Retaguarda (cadeado no rodapé) e pelo botão rosa do sorvete. */
const SO_ADMIN: Item[] = [
  { to: "/retaguarda", tela: "painel", label: "Retaguarda", curto: "Retaguarda", icon: Lock },
  { to: "/pessoal", tela: "painel", label: "Painel pessoal", curto: "Pessoal", icon: Wallet },
  { to: "/licenciados", tela: "painel", label: "My Frost Sorveterias", curto: "My Frost", icon: IceCreamCone },
];

type Bloco = { id: string; titulo: string; texto: string; cor: string; Icone: typeof LayoutGrid; itens: Item[] };

export function ModulosCartoes({ onIdeia, onAuditoria }: { onIdeia: (i: InicialItem) => void; onAuditoria: () => void }) {
  const vis = useVisivel();
  const { master } = usePerfil();
  const [busca, setBusca] = useState("");
  const [area, setArea] = useState("");
  const [soMeu, setSoMeu] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [tudoAberto, setTudoAberto] = useState(false);
  const termo = semAcento(busca.trim());
  const textoDa = (i: Item) => {
    const d = DETALHE_TELAS[i.to];
    return `${i.label} ${SOBRE_TELAS[i.to] ?? ""} ${i.busca ?? ""} ${d ? [...d.tags, d.destaque, ...d.partes].join(" ") : ""}`;
  };
  const combina = (i: Item) => (!soMeu || vis.item(i)) && (!termo || termo.split(/\s+/).every((p) => semAcento(textoDa(i)).includes(p)));
  const foraDe = (id: string) => itensForaDoMenu.filter((i) => (grupoDaRota(i.to) ?? "admin") === id);
  const todosBlocos: Bloco[] = [
    ...grupos.map((g) => ({ id: g.id, titulo: g.titulo || "Início", texto: SOBRE_AREAS[g.id] ?? "", cor: g.cor ?? "from-fixo-slate-500 to-fixo-slate-700", Icone: g.icone ?? LayoutGrid, itens: [...g.itens, ...foraDe(g.id)] })),
    { id: "admin", titulo: "Configurações", texto: "Pela engrenagem no fim do menu: empresa e marca, usuários e permissões, importação de dados e categorias.", cor: "from-fixo-slate-500 to-fixo-slate-700", Icone: Settings, itens: foraDe("admin") },
    ...(master ? [{ id: "dono", titulo: "Só da conta master", texto: "Pela Retaguarda (cadeado no rodapé do menu) e pelo sorvete: contas pessoais, lojas licenciadas, usuários e configurações da empresa.", cor: "from-[#c2185b] to-fixo-violet-600", Icone: Lock, itens: SO_ADMIN }] : []),
  ];
  const blocos = todosBlocos.filter((b) => !area || b.id === area).map((b) => ({ ...b, itens: b.itens.filter(combina) })).filter((b) => b.itens.length);
  const todas = [...grupos.flatMap((g) => g.itens), ...itensForaDoMenu];
  const nVe = todas.filter((i) => vis.item(i)).length;
  const nPartes = todas.reduce((s, i) => s + (DETALHE_TELAS[i.to]?.partes.length ?? 0), 0);
  const achados = useMemo(() => auditarMenu(grupos, itensForaDoMenu, SOBRE_TELAS, grupoDaRota).filter((a) => a.gravidade !== "info").length, []);
  const alternar = (to: string) => setAbertos((s) => { const n = new Set(s); if (n.has(to)) n.delete(to); else n.add(to); return n; });
  const aberto = (to: string) => tudoAberto || abertos.has(to) || (!!termo && termo.length >= 3);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Áreas" valor={grupos.filter((g) => g.titulo).length} icon={LayoutGrid} sub="blocos do menu" />
        <Stat label="Telas" valor={todas.length} icon={Boxes} sub={`${nPartes} partes explicadas · + ${PAGINAS_POR_LINK.length} ${pl(PAGINAS_POR_LINK.length, "página", "páginas")} por link`} />
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
        <button type="button" onClick={() => { setTudoAberto((v) => !v); setAbertos(new Set()); }} aria-pressed={tudoAberto}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          {tudoAberto ? <ChevronsDownUp size={16} aria-hidden /> : <ChevronsUpDown size={16} aria-hidden />} {tudoAberto ? "Fechar tudo" : "Abrir tudo"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Área">
        {[{ id: "", titulo: "Todas" }, ...todosBlocos].map((b) => (
          <button key={b.id || "todas"} type="button" aria-pressed={area === b.id} onClick={() => setArea(b.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${area === b.id ? "bg-modulo-escuro text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {b.titulo}
          </button>
        ))}
      </div>

      {!blocos.length && <p className="text-sm text-slate-500">Nenhuma tela {termo ? `com "${busca.trim()}"` : "com esses filtros"}.</p>}

      {blocos.map(({ id, titulo, texto, cor, Icone, itens }) => {
        const { clara, escura } = coresDe(cor);
        return (
          <section key={id} aria-labelledby={`area-${id}`} className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${clara}, ${escura})` }} aria-hidden><Icone size={19} /></span>
              <div className="min-w-0">
                <h2 id={`area-${id}`} className="text-lg font-bold text-fg">{titulo} <span className="num text-sm font-semibold text-slate-500">· {itens.length} {pl(itens.length, "tela", "telas")}</span></h2>
                {texto && <p className="text-sm text-slate-600">{texto}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {itens.map((i) => (
                <CartaoTela key={i.to} item={i} clara={clara} escura={escura} pode={id === "dono" || vis.item(i)} aberto={aberto(i.to)}
                  onAlternar={() => alternar(i.to)} onIdeia={() => onIdeia({ titulo: `${i.label}: `, area: id === "admin" || id === "dono" ? "geral" : id })} />
              ))}
            </div>
          </section>
        );
      })}

      {!area && <PaginasPorLink filtro={(p) => !termo || semAcento(`${p.nome} ${p.texto} ${p.quem} ${p.onde}`).includes(termo)} />}
    </div>
  );
}

function CartaoTela({ item, clara, escura, pode, aberto, onAlternar, onIdeia }: {
  item: Item; clara: string; escura: string; pode: boolean; aberto: boolean; onAlternar: () => void; onIdeia: () => void;
}) {
  const d = DETALHE_TELAS[item.to];
  const Icon = item.icon;
  const idPartes = `partes-${item.to.replace(/\W+/g, "-")}`;
  return (
    // compacto: ícone ao lado do nome, etiquetas numa linha e a explicação em até 3 linhas (o "Saiba mais" mostra tudo)
    <article className="cartao relative flex min-w-0 flex-col p-3.5"
      style={{ backgroundImage: `radial-gradient(120% 70% at 100% 0%, ${clara}14, transparent 60%)` }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${clara}26`, color: tinta(escura) }} aria-hidden><Icon size={18} /></span>
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold leading-tight text-fg">
            {pode ? <Link to={item.to} className="hover:underline">{item.label}</Link> : <span className="inline-flex items-center gap-1.5">{item.label} <Lock size={13} className="text-slate-400" aria-label="sem acesso no seu perfil" /></span>}
          </h3>
          {d?.tags.length ? <p className="truncate text-2xs font-bold uppercase tracking-wider" style={{ color: tinta(escura) }} title={d.tags.join(" · ")}>{d.tags.join(" · ")}</p> : null}
        </div>
      </div>
      <p className={`mt-2 text-sm leading-snug text-slate-600 ${aberto ? "" : "line-clamp-3"}`} title={aberto ? undefined : SOBRE_TELAS[item.to]}>{SOBRE_TELAS[item.to] ?? "—"}</p>
      {d?.destaque && <p className={`mt-1.5 text-xs font-semibold leading-snug ${aberto ? "" : "line-clamp-2"}`} style={{ color: tinta(escura) }}>{d.destaque}</p>}

      {aberto && d && (
        <div id={idPartes} className="mt-3 border-t border-slate-200 pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Tudo o que faz · {d.partes.length} {pl(d.partes.length, "parte", "partes")}</p>
          <ul className="space-y-2">
            {d.partes.map((t) => {
              const k = t.indexOf(":");
              return (
                <li key={t} className="flex gap-2 text-xs leading-snug text-slate-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: clara }} aria-hidden />
                  <span className="min-w-0">{k > 0 && k < 60 ? <><b className="text-fg">{t.slice(0, k)}:</b>{t.slice(k + 1)}</> : t}</span>
                </li>
              );
            })}
          </ul>
          {ONDE_ABRE[item.to] && <p className="mt-3 flex gap-1.5 text-xs text-slate-500"><Info size={14} className="shrink-0" aria-hidden /> Fora da lista do menu · abre por: {ONDE_ABRE[item.to]}</p>}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
        {d && (
          <button type="button" onClick={onAlternar} aria-expanded={aberto} aria-controls={idPartes}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
            {aberto ? "Mostrar menos" : "Saiba mais"} <ArrowRight size={14} className={`transition ${aberto ? "-rotate-90" : ""}`} aria-hidden />
          </button>
        )}
        {pode && <Link to={item.to} className="text-xs font-semibold text-slate-600 hover:text-fg hover:underline">Abrir a tela</Link>}
        <button type="button" onClick={onIdeia} className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600"
          title={`Anotar ideia sobre ${item.label}`} aria-label={`Anotar ideia sobre ${item.label}`}><Lightbulb size={15} /></button>
      </div>
    </article>
  );
}
