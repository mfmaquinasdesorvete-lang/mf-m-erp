// Fluxograma do menu com a auditoria: Menu → áreas → telas (e as que ficam fora do menu), montado do próprio menu.
// Os achados ficam ao lado; tocar num achado acende as telas envolvidas no desenho.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, ClipboardCopy, Eye, Info, LayoutGrid, Link2, Lock, Search, Wrench, X } from "lucide-react";
import { Button, Card, Stat } from "@/components/ui";
import { grupos, grupoDaRota, itensForaDoMenu, useVisivel, type Item } from "@/lib/menu";
import { SOBRE_TELAS } from "@/lib/modulos";
import { auditarMenu, ROTULO_GRAVIDADE, textoAuditoria, type Achado, type Gravidade } from "@/lib/auditoriaMenu";
import { copiar } from "./Guardanapo";

const COR_GRAV: Record<Gravidade, { ponto: string; caixa: string; icone: typeof AlertTriangle }> = {
  alta: { ponto: "bg-red-500", caixa: "border-red-200 bg-red-50 text-red-800", icone: AlertTriangle },
  media: { ponto: "bg-amber-500", caixa: "border-amber-200 bg-amber-50 text-amber-900", icone: Wrench },
  info: { ponto: "bg-sky-500", caixa: "border-sky-200 bg-sky-50 text-sky-900", icone: Info },
};
const PESO: Record<Gravidade, number> = { alta: 0, media: 1, info: 2 };
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function FluxoMenu() {
  const vis = useVisivel();
  const achados = useMemo(() => auditarMenu(grupos, itensForaDoMenu, SOBRE_TELAS, grupoDaRota), []);
  const [grav, setGrav] = useState<Gravidade | "">("");
  const [foco, setFoco] = useState<Achado | null>(null);
  const [soMeu, setSoMeu] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = semAcento(busca.trim());

  const areas = grupos.filter((g) => g.titulo);
  const nTelas = grupos.reduce((s, g) => s + g.itens.length, 0);
  const todos = [...grupos.flatMap((g) => g.itens), ...itensForaDoMenu];
  const nVe = todos.filter((i) => vis.item(i)).length;
  const conta = (g: Gravidade) => achados.filter((a) => a.gravidade === g).length;
  const doItem = (to: string) => achados.filter((a) => a.rotas.includes(to));
  const lista = achados.filter((a) => !grav || a.gravidade === grav);
  const resumo = { areas: areas.length, telas: nTelas, fora: itensForaDoMenu.length };
  const mostra = (i: Item) => (!soMeu || vis.item(i)) && (!termo || semAcento(`${i.label} ${i.busca ?? ""}`).includes(termo));

  const colunas = [
    ...grupos.map((g) => ({ id: g.id, titulo: g.titulo || "Início", cor: g.cor ?? "from-[#64748b] to-[#334155]", Icone: g.icone ?? LayoutGrid, itens: g.itens, fora: false })),
    { id: "fora", titulo: "Fora do menu", cor: "from-[#94a3b8] to-[#64748b]", Icone: Boxes, itens: itensForaDoMenu, fora: true },
  ].map((c) => ({ ...c, visiveis: c.itens.filter(mostra) })).filter((c) => c.visiveis.length || !termo);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Áreas" valor={areas.length} icon={LayoutGrid} />
        <Stat label="Telas no menu" valor={nTelas} icon={Boxes} sub={`+ ${itensForaDoMenu.length} fora do menu`} />
        <Stat label="Seu perfil abre" valor={`${nVe} de ${todos.length}`} icon={Eye} onClick={() => setSoMeu((v) => !v)} sub={soMeu ? "mostrando só as suas" : "tocar para ver só as suas"} />
        <Stat label={ROTULO_GRAVIDADE.alta} valor={conta("alta")} icon={AlertTriangle} tom={conta("alta") ? "critico" : "bom"} onClick={() => setGrav(grav === "alta" ? "" : "alta")} sub="endereço repetido" />
        <Stat label={ROTULO_GRAVIDADE.media} valor={conta("media")} icon={Wrench} tom={conta("media") ? "atencao" : "bom"} onClick={() => setGrav(grav === "media" ? "" : "media")} sub="confunde quem usa" />
        <Stat label={ROTULO_GRAVIDADE.info} valor={conta("info")} icon={Info} tom="info" onClick={() => setGrav(grav === "info" ? "" : "info")} sub="vale olhar" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input h-10 pl-9" type="search" placeholder="Buscar tela no desenho" aria-label="Buscar tela no desenho" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={soMeu} onChange={(e) => setSoMeu(e.target.checked)} /> Só o que meu perfil abre
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => copiar(`${window.location.origin}/sobre?aba=esquemas&esquema=menu`, "Link copiado")}><Link2 size={16} /> Copiar link</Button>
          <Button onClick={() => copiar(textoAuditoria(achados, resumo), "Auditoria copiada")}><ClipboardCopy size={16} /> Copiar auditoria</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* o fluxograma */}
        <Card className="min-w-0 p-4 sm:p-5 xl:col-span-2">
          <div className="flex flex-col items-center">
            <span className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white shadow-card">Menu do ERP Line</span>
            <span className="h-5 w-0.5 bg-slate-300" aria-hidden />
          </div>
          {foco && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COR_GRAV[foco.gravidade].ponto}`} aria-hidden />
              <span className="min-w-0 flex-1"><b>Em destaque:</b> {foco.titulo}</span>
              <button type="button" onClick={() => setFoco(null)} className="shrink-0 text-slate-500 hover:text-fg" aria-label="Tirar o destaque"><X size={16} /></button>
            </div>
          )}
          <div className="grid gap-3 border-t-2 border-slate-300 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {colunas.map((c) => (
              <div key={c.id} className="relative min-w-0">
                <span className="absolute -top-4 left-1/2 h-4 w-0.5 -translate-x-1/2 bg-slate-300" aria-hidden />
                <div className={`flex items-center gap-2 rounded-xl bg-gradient-to-br ${c.cor} px-3 py-2 text-white shadow-sm ${c.fora ? "opacity-80" : ""}`}>
                  <c.Icone size={16} aria-hidden /><span className="min-w-0 flex-1 truncate text-sm font-bold">{c.titulo}</span>
                  <span className="num rounded-full bg-white/25 px-1.5 text-xs font-bold">{c.itens.length}</span>
                </div>
                {c.fora && <p className="mt-1 text-[11px] text-slate-500">Abertas por botões, pela engrenagem ou pela busca do menu.</p>}
                <ul className={`ml-3 mt-1 border-l-2 pl-3 ${c.fora ? "border-dashed border-slate-300" : "border-slate-200"}`}>
                  {c.visiveis.map((i) => {
                    const meus = doItem(i.to);
                    const pior = meus.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade])[0];
                    const aceso = foco ? foco.rotas.includes(i.to) : true;
                    const abre = vis.item(i);
                    return (
                      <li key={i.to} className={`relative py-1 transition ${aceso ? "" : "opacity-30"}`}>
                        <span className="absolute -left-3 top-1/2 h-0.5 w-2.5 bg-slate-200" aria-hidden />
                        <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[13px] ${foco && aceso ? "border-red-400 ring-2 ring-red-300" : "border-slate-200 bg-surface"}`}
                          title={meus.map((a) => `${ROTULO_GRAVIDADE[a.gravidade]}: ${a.titulo}`).join("\n") || undefined}>
                          <i.icon size={14} className="shrink-0 text-slate-500" aria-hidden />
                          {abre ? <Link to={i.to} className="min-w-0 flex-1 truncate font-semibold text-fg hover:text-modulo-texto hover:underline">{i.label}</Link>
                            : <span className="min-w-0 flex-1 truncate font-semibold text-slate-500">{i.label} <Lock size={11} className="inline" aria-label="seu perfil não abre" /></span>}
                          {pior && (
                            <button type="button" onClick={() => setFoco(pior)} className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR_GRAV[pior.gravidade].ponto}`}
                              aria-label={`${meus.length} ${meus.length === 1 ? "achado" : "achados"}: ${pior.titulo}`} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {(["alta", "media", "info"] as Gravidade[]).map((g) => <span key={g} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${COR_GRAV[g].ponto}`} />{ROTULO_GRAVIDADE[g]}</span>)}
            <span className="inline-flex items-center gap-1"><Lock size={11} /> seu perfil não abre</span>
          </p>
        </Card>

        {/* os achados */}
        <Card className="min-w-0 p-4 sm:p-5">
          <h2 className="text-base font-bold text-fg">Auditoria do menu</h2>
          <p className="text-sm text-slate-600">Feita sobre o menu de agora: muda sozinha quando o menu muda. Toque num achado para ver as telas no desenho.</p>
          {!lista.length && <p className="mt-3 text-sm text-slate-500">Nada {grav ? `em "${ROTULO_GRAVIDADE[grav]}"` : "a apontar"}.</p>}
          <ul className="mt-3 space-y-2">
            {lista.map((a) => {
              const C = COR_GRAV[a.gravidade];
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => setFoco(foco?.id === a.id ? null : a)} aria-pressed={foco?.id === a.id}
                    className={`w-full rounded-xl border p-3 text-left transition ${C.caixa} ${foco?.id === a.id ? "ring-2 ring-brand" : "hover:brightness-[0.98]"}`}>
                    <span className="flex items-start gap-2">
                      <C.icone size={15} className="mt-0.5 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold leading-snug">{a.titulo}</span>
                        <span className="block text-[12px] leading-snug opacity-90">{a.detalhe}</span>
                        {a.sugestao && <span className="mt-1 block text-[12px] font-semibold leading-snug">→ {a.sugestao}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
