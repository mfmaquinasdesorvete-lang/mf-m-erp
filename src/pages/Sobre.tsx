// Sobre o ERP Line: o que faz cada módulo e as versões dia a dia (aberta pela versão no fim do menu).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Boxes, ExternalLink, History, LayoutGrid, Lock, Search, Sparkles } from "lucide-react";
import { Card, PageHeader, Tabs } from "@/components/ui";
import { useAbaUrl } from "@/lib/abaUrl";
import { grupos, itensForaDoMenu, useVisivel, type Item } from "@/lib/menu";
import { PAGINAS_POR_LINK, SOBRE_AREAS, SOBRE_TELAS } from "@/lib/modulos";
import { versoesDoHistorico } from "@/lib/atualizacoes";
import { pl } from "@/lib/format";

const VERSAO = typeof __ERP_VERSAO__ !== "undefined" ? __ERP_VERSAO__ : null;
const HISTORICO = typeof __ERP_HISTORICO__ !== "undefined" ? __ERP_HISTORICO__ : [];

const ABAS = ["modulos", "atualizacoes"] as const;
type Aba = (typeof ABAS)[number];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Sobre() {
  const [aba, setAba] = useAbaUrl<Aba>("modulos", ABAS);
  return (
    <div>
      <PageHeader title="Sobre o ERP Line"
        subtitle={VERSAO ? `Versão ${VERSAO.numero}, de ${VERSAO.quando}. O que faz cada módulo e o que mudou em cada dia.` : "O que faz cada módulo e o que mudou em cada dia."} />
      <Tabs value={aba} onChange={setAba} options={[{ value: "modulos", label: "Módulos" }, { value: "atualizacoes", label: "Atualizações" }]} />
      {aba === "modulos" ? <Modulos /> : <Atualizacoes />}
    </div>
  );
}

function Modulos() {
  const vis = useVisivel();
  const [busca, setBusca] = useState("");
  const termo = semAcento(busca.trim());
  const combina = (i: Item) => !termo || termo.split(/\s+/).every((p) => semAcento(`${i.label} ${SOBRE_TELAS[i.to] ?? ""} ${i.busca ?? ""}`).includes(p));
  const blocos = [
    ...grupos.map((g) => ({ id: g.id, titulo: g.titulo || "Início", texto: SOBRE_AREAS[g.id] ?? "", cor: g.cor ?? "from-[#64748b] to-[#334155]", Icone: g.icone ?? LayoutGrid, itens: g.itens })),
    { id: "outras", titulo: "Outras telas", texto: "Abertas pela engrenagem, pelos painéis, por botões dentro das telas ou pela busca do menu.", cor: "from-[#64748b] to-[#334155]", Icone: Boxes, itens: itensForaDoMenu },
  ].map((b) => ({ ...b, itens: b.itens.filter(combina) })).filter((b) => b.itens.length);
  const nTelas = grupos.reduce((s, g) => s + g.itens.length, 0) + itensForaDoMenu.length;
  const links = PAGINAS_POR_LINK.filter((p) => !termo || semAcento(`${p.nome} ${p.texto}`).includes(termo));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-md sm:basis-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input h-10 pl-9" type="search" placeholder="Buscar tela ou assunto (ex.: boleto, frete, comissão)" aria-label="Buscar tela ou assunto"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <p className="text-sm text-slate-600">
          <b className="text-fg">{grupos.filter((g) => g.titulo).length}</b> áreas · <b className="text-fg">{nTelas}</b> telas · <b className="text-fg">{PAGINAS_POR_LINK.length}</b> páginas por link
        </p>
      </div>

      {!blocos.length && !links.length && <p className="text-sm text-slate-500">Nenhuma tela com "{busca.trim()}".</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {blocos.map(({ id, titulo, texto, cor, Icone, itens }) => (
          <Card key={id} className="min-w-0 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${cor} text-white shadow-sm`} aria-hidden><Icone size={19} /></span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-fg">{titulo}</h2>
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
                    <div className="min-w-0">
                      {pode ? (
                        <Link to={i.to} className="text-sm font-semibold text-fg underline-offset-2 hover:text-modulo-texto hover:underline">{i.label}</Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500" title="Seu perfil não abre esta tela">
                          {i.label} <Lock size={12} aria-label="sem acesso no seu perfil" />
                        </span>
                      )}
                      <p className="text-[13px] leading-snug text-slate-600">{SOBRE_TELAS[i.to] ?? "—"}</p>
                    </div>
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

function Atualizacoes() {
  const versoes = useMemo(() => versoesDoHistorico(HISTORICO), []);
  const total = versoes.reduce((s, v) => s + v.mudancas.length, 0);
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
          {total > 0 && <> Desde {versoes.length ? diaPorExtenso(versoes[versoes.length - 1].dia).replace(/^[^,]+, /, "") : ""}: <b>{total.toLocaleString("pt-BR")}</b> {pl(total, "mudança", "mudanças")} em <b>{versoes.length}</b> {pl(versoes.length, "dia", "dias")}.</>}
        </p>
      </Card>

      <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4 sm:pl-6">
        {versoes.map((v, i) => (
          <li key={v.dia} className="relative">
            <span className={`absolute -left-[23px] top-5 h-3 w-3 rounded-full sm:-left-[31px] ${i === 0 ? "bg-modulo" : "bg-slate-300"}`} aria-hidden />
            <Card className="min-w-0 p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={`num rounded-lg px-2 py-0.5 text-sm font-extrabold ${i === 0 ? "bg-modulo-escuro text-white" : "bg-slate-100 text-fg"}`}>{v.numero}</span>
                <span className="text-sm font-semibold capitalize text-slate-600">{diaPorExtenso(v.dia)}</span>
                {i === 0 && VERSAO && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">em uso</span>}
              </div>
              {v.titulo && <h2 className="mt-1.5 text-base font-bold text-fg">{v.titulo}</h2>}
              {v.itens.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 marker:text-modulo">
                  {v.itens.map((t) => <li key={t}>{t}</li>)}
                </ul>
              )}
              {v.mudancas.length > 0 && (
                <details className="group mt-3" open={!v.itens.length}>
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <History size={13} aria-hidden /> {v.mudancas.length} {pl(v.mudancas.length, "mudança", "mudanças")} do dia
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
        ))}
      </ol>
    </div>
  );
}
