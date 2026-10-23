// Fluxograma do menu com a auditoria: Menu → áreas → telas (e as que ficam fora do menu), montado do próprio menu,
// com as entradas (acesso rápido, barra do celular, botões "+") e "ver como" cada perfil. Os achados ficam ao lado;
// tocar num achado acende as telas envolvidas no desenho.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, ClipboardCopy, Eye, Info, LayoutGrid, Link2, Lock, Plus, Search, Smartphone, Wrench, X, Zap } from "lucide-react";
import { Button, Card, Stat } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { ATALHOS_CELULAR, RAPIDOS, grupos, grupoDaRota, itensForaDoMenu, useVisivel, type Item } from "@/lib/menu";
import { SOBRE_TELAS } from "@/lib/modulos";
import { PAPEIS_INTERNOS, acoesDoPapel, itemVisivel, type MenuOculto, type Papel, type Tela } from "@/lib/permissoes";
import { auditarMenu, auditarNavegacao, menuDoPerfil, ROTULO_GRAVIDADE, textoAuditoria, type Achado, type Gravidade, type PerfilAud } from "@/lib/auditoriaMenu";
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
  const { pode, papel } = usePerfil();
  const { data: cfg } = useConfig();
  const oculto = (cfg?.menu_oculto ?? {}) as MenuOculto;
  // cada perfil interno, com o que vê (incluindo o que foi escondido em Usuários → Perfis) e o que pode fazer
  const perfis = useMemo<PerfilAud[]>(() => PAPEIS_INTERNOS.map((p) => ({
    id: p.value, nome: p.label, ve: (i) => itemVisivel(p.value as Papel, [], i.tela as Tela, i.to, oculto), pode: (a) => acoesDoPapel(p.value as Papel).includes(a as never),
  })), [oculto]);
  const eu: PerfilAud = { id: "eu", nome: "Você", ve: (i) => vis.item(i as Item), pode: (a) => pode(a as never) };
  const [comoId, setComoId] = useState("eu");
  const como = comoId === "eu" ? eu : perfis.find((p) => p.id === comoId) ?? eu;
  const entradas = { rapidos: RAPIDOS, atalhos: ATALHOS_CELULAR };
  const achados = useMemo(() => [
    ...auditarMenu(grupos, itensForaDoMenu, SOBRE_TELAS, grupoDaRota),
    ...auditarNavegacao(grupos, itensForaDoMenu, entradas, perfis.filter((p) => p.id !== "admin")),
  ].sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade]), [perfis]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Você": o que a pessoa logada vê, com a barra do celular do papel dela
  const menuComo = menuDoPerfil(grupos, itensForaDoMenu, entradas, comoId === "eu" ? { ...eu, id: papel } : como);
  const [grav, setGrav] = useState<Gravidade | "">("");
  const [foco, setFoco] = useState<Achado | null>(null);
  const [soVe, setSoVe] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = semAcento(busca.trim());

  const areas = grupos.filter((g) => g.titulo);
  const nTelas = grupos.reduce((s, g) => s + g.itens.length, 0);
  const todos = [...grupos.flatMap((g) => g.itens), ...itensForaDoMenu];
  const nVe = todos.filter((i) => como.ve(i)).length;
  const conta = (g: Gravidade) => achados.filter((a) => a.gravidade === g).length;
  const doItem = (to: string) => achados.filter((a) => a.rotas.includes(to));
  const lista = achados.filter((a) => !grav || a.gravidade === grav);
  const resumo = { areas: areas.length, telas: nTelas, fora: itensForaDoMenu.length };
  const mostra = (i: Item) => (!soVe || como.ve(i)) && (!termo || semAcento(`${i.label} ${i.busca ?? ""}`).includes(termo));

  const colunas = [
    ...grupos.map((g) => ({ id: g.id, titulo: g.titulo || "Início", cor: g.cor ?? "from-fixo-slate-500 to-fixo-slate-700", Icone: g.icone ?? LayoutGrid, itens: g.itens, fora: false })),
    { id: "fora", titulo: "Fora do menu", cor: "from-fixo-slate-400 to-fixo-slate-500", Icone: Boxes, itens: itensForaDoMenu, fora: true },
  ].map((c) => ({ ...c, visiveis: c.itens.filter(mostra) })).filter((c) => c.visiveis.length || (!termo && !soVe));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Áreas" valor={areas.length} icon={LayoutGrid} sub={`${grupos.filter((g) => g.acao).length} com botão "+"`} />
        <Stat label="Telas no menu" valor={nTelas} icon={Boxes} sub={`+ ${itensForaDoMenu.length} fora do menu`} />
        <Stat label={comoId === "eu" ? "Seu perfil abre" : `${como.nome} abre`} valor={`${nVe} de ${todos.length}`} icon={Eye} onClick={() => setSoVe((v) => !v)} sub={soVe ? "mostrando só essas" : "tocar para ver só essas"} />
        <Stat label={ROTULO_GRAVIDADE.alta} valor={conta("alta")} icon={AlertTriangle} tom={conta("alta") ? "critico" : "bom"} onClick={() => setGrav(grav === "alta" ? "" : "alta")} sub="quebra o uso" />
        <Stat label={ROTULO_GRAVIDADE.media} valor={conta("media")} icon={Wrench} tom={conta("media") ? "atencao" : "bom"} onClick={() => setGrav(grav === "media" ? "" : "media")} sub="confunde quem usa" />
        <Stat label={ROTULO_GRAVIDADE.info} valor={conta("info")} icon={Info} tom="info" onClick={() => setGrav(grav === "info" ? "" : "info")} sub="vale olhar" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 text-sm font-semibold text-slate-600">
          Ver como
          <select className="h-8 rounded-md border-0 bg-transparent font-bold text-fg focus:outline-none" value={comoId} onChange={(e) => setComoId(e.target.value)} aria-label="Ver o menu como">
            <option value="eu">Você</option>
            {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <div className="relative min-w-0 flex-1 basis-48 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input h-10 pl-9" type="search" placeholder="Buscar tela no desenho" aria-label="Buscar tela no desenho" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={soVe} onChange={(e) => setSoVe(e.target.checked)} /> Só o que {comoId === "eu" ? "eu abro" : "o perfil abre"}
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => copiar(`${window.location.origin}/sobre?aba=esquemas&esquema=menu`, "Link copiado")}><Link2 size={16} /> Copiar link</Button>
          <Button onClick={() => copiar(textoAuditoria(achados, resumo), "Auditoria copiada")}><ClipboardCopy size={16} /> Copiar auditoria</Button>
        </div>
      </div>

      {/* as entradas do menu para o perfil escolhido */}
      <div className="grid gap-3 md:grid-cols-3">
        <Entrada icone={Zap} titulo="Acesso rápido" sub="botões coloridos no alto do menu" vazio="Nenhum botão para este perfil."
          itens={menuComo.rapidos.map((r) => r.label)} />
        <Entrada icone={Smartphone} titulo="Barra do celular" sub={menuComo.barraPropria ? 'atalhos de baixo + "Mais"' : "emprestada do administrador"} vazio={'Vazia: só o botão "Mais".'}
          itens={menuComo.barra.map((i) => i.curto ?? i.label)} alerta={!menuComo.barra.length} />
        <Entrada icone={Plus} titulo='Botões "+" das áreas' sub="criar direto do menu" vazio="Nenhum (o perfil não cria pelo menu)."
          itens={menuComo.areas.filter((a) => a.mais).map((a) => `+ ${a.mais} (${a.titulo})`)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* o fluxograma */}
        <Card className="min-w-0 p-4 sm:p-5 xl:col-span-2">
          <div className="flex flex-col items-center">
            <span className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white shadow-card">Menu do ERP Line{comoId !== "eu" ? ` · como ${como.nome}` : ""}</span>
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
            {colunas.map((c) => {
              const area = menuComo.areas.find((a) => a.id === c.id);
              return (
                <div key={c.id} className="relative min-w-0">
                  <span className="absolute -top-4 left-1/2 h-4 w-0.5 -translate-x-1/2 bg-slate-300" aria-hidden />
                  <div className={`flex items-center gap-2 rounded-xl bg-gradient-to-br ${c.cor} px-3 py-2 text-white shadow-sm ${c.fora ? "opacity-80" : ""} ${area && !area.itens.length ? "opacity-40" : ""}`}>
                    <c.Icone size={16} aria-hidden /><span className="min-w-0 flex-1 truncate text-sm font-bold">{c.titulo}</span>
                    {area?.mais && <span className="rounded-md bg-white/25 px-1.5 text-2xs font-bold">+ {area.mais}</span>}
                    <span className="num rounded-full bg-white/25 px-1.5 text-xs font-bold" title={`${como.nome} vê ${area ? area.itens.length : c.itens.filter(como.ve).length} de ${c.itens.length}`}>
                      {area ? `${area.itens.length}/${c.itens.length}` : `${c.itens.filter(como.ve).length}/${c.itens.length}`}
                    </span>
                  </div>
                  {c.fora && <p className="mt-1 text-2xs text-slate-500">Abertas por botões, pela engrenagem ou pela busca do menu.</p>}
                  <ul className={`ml-3 mt-1 border-l-2 pl-3 ${c.fora ? "border-dashed border-slate-300" : "border-slate-200"}`}>
                    {c.visiveis.map((i) => {
                      const meus = doItem(i.to);
                      const pior = [...meus].sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade])[0];
                      const aceso = foco ? foco.rotas.includes(i.to) : true;
                      const ve = como.ve(i);
                      const abro = vis.item(i);
                      return (
                        <li key={i.to} className={`relative py-1 transition ${aceso ? "" : "opacity-30"}`}>
                          <span className="absolute -left-3 top-1/2 h-0.5 w-2.5 bg-slate-200" aria-hidden />
                          <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${foco && aceso ? "border-red-400 ring-2 ring-red-300" : ve ? "border-slate-200 bg-surface" : "border-dashed border-slate-300"}`}
                            title={meus.map((a) => `${ROTULO_GRAVIDADE[a.gravidade]}: ${a.titulo}`).join("\n") || undefined}>
                            <i.icon size={14} className={`shrink-0 ${ve ? "text-slate-500" : "text-slate-300"}`} aria-hidden />
                            {ve && abro ? <Link to={i.to} className="min-w-0 flex-1 truncate font-semibold text-fg hover:text-modulo-texto hover:underline">{i.label}</Link>
                              : <span className={`min-w-0 flex-1 truncate font-semibold ${ve ? "text-fg" : "text-slate-400"}`}>{i.label} {!ve && <Lock size={11} className="inline" aria-label={`${como.nome} não abre`} />}</span>}
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
              );
            })}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-slate-500">
            {(["alta", "media", "info"] as Gravidade[]).map((g) => <span key={g} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${COR_GRAV[g].ponto}`} />{ROTULO_GRAVIDADE[g]}</span>)}
            <span className="inline-flex items-center gap-1"><Lock size={11} /> {comoId === "eu" ? "seu perfil" : como.nome} não abre</span>
          </p>
        </Card>

        {/* os achados */}
        <Card className="min-w-0 p-4 sm:p-5">
          <h2 className="text-base font-bold text-fg">Auditoria do menu</h2>
          <p className="text-sm text-slate-600">Feita sobre o menu de agora e sobre o que cada perfil vê: muda sozinha quando o menu ou os perfis mudam. Toque num achado para ver as telas no desenho.</p>
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
                        <span className="block text-xs font-bold leading-snug">{a.titulo}</span>
                        <span className="block text-xs leading-snug opacity-90">{a.detalhe}</span>
                        {a.sugestao && <span className="mt-1 block text-xs font-semibold leading-snug">→ {a.sugestao}</span>}
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

function Entrada({ icone: Icone, titulo, sub, itens, vazio, alerta }: { icone: typeof Zap; titulo: string; sub: string; itens: string[]; vazio: string; alerta?: boolean }) {
  return (
    <Card className={`min-w-0 p-3 ${alerta ? "ring-2 ring-red-300" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icone size={16} aria-hidden /></span>
        <span className="min-w-0"><span className="block text-sm font-bold text-fg">{titulo}</span><span className="block text-2xs text-slate-500">{sub}</span></span>
      </div>
      {itens.length ? (
        <div className="mt-2 flex flex-wrap gap-1">{itens.map((t) => <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{t}</span>)}</div>
      ) : <p className={`mt-2 text-xs ${alerta ? "font-semibold text-red-700" : "text-slate-500"}`}>{vazio}</p>}
    </Card>
  );
}
