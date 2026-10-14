import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ModuloContext, type Modulo } from "@/lib/modulo";
import {
  ArrowLeftRight, BarChart3, Bell, Boxes, Inbox, Paperclip, HandCoins, Workflow, PieChart, Calculator, Check, Factory, Palette, FileText, KeyRound, LayoutDashboard, LogOut, Menu, Moon, Settings, ShieldCheck, ShoppingCart, Sun,
  Truck, UserCog, Users, Wallet, Wrench, X, ChevronDown, Landmark, ShieldAlert, Search, Gauge,
  Store, PackageSearch, CreditCard, Package, ScanBarcode, Scale, IdCard,
} from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { rotuloPapel, type Tela } from "@/lib/permissoes";
import { grupoDaRota, grupos, itensForaDoMenu, todosItens, useVisivel, type Item } from "@/lib/menu";
import { notify, notifyError } from "@/lib/notify";
import { aplicarDestaque, aplicarTema, DESTAQUES, lerDestaque, lerTema, type Destaque, type Tema } from "@/lib/tema";
import logo from "@/assets/logo.webp";
import { Button, Field, Modal } from "./ui";
import { MeusAvisos } from "./Avisos";
import { ResultadosBusca } from "./BuscaGeral";
import { NotificacoesProvider, Sino } from "./Notificacoes";
import { useUnidade } from "@/lib/unidade";
import { AvisoVersao, ErroTela } from "./ErroTela";


/** Acesso rápido: os botões coloridos no alto do menu (as telas mais usadas no dia a dia). */
const RAPIDOS: { to: string; label: string; cor: string }[] = [
  { to: "/painel/vendas", label: "Vendas", cor: "from-[#10b981] to-[#059669]" },
  { to: "/painel/notas", label: "Notas fiscais", cor: "from-[#0ea5e9] to-[#2563eb]" },
  { to: "/painel/financeiro", label: "Financeiro", cor: "from-[#f59e0b] to-[#ea580c]" },
  { to: "/clientes", label: "Clientes", cor: "from-[#a855f7] to-[#6d28d9]" },
  { to: "/estoque", label: "Produtos", cor: "from-[#f97316] to-[#dc2626]" },
  { to: "/painel/posvenda", label: "Assistência", cor: "from-[#14b8a6] to-[#0e7490]" },
];

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const combina = (m: Item, termo: string) => {
  const t = semAcento(`${m.label} ${m.busca ?? ""}`);
  return semAcento(termo).split(/\s+/).filter(Boolean).every((p) => t.includes(p));
};

/** Atalhos da barra inferior do celular, na ordem de prioridade de cada papel. */
const ATALHOS: Record<string, string[]> = {
  admin: ["/", "/pedidos", "/assistencia", "/financeiro"],
  vendas: ["/", "/pedidos", "/clientes", "/garantias"],
  financeiro: ["/", "/financeiro", "/conciliacao", "/notas"],
  tecnico: ["/", "/assistencia", "/garantias", "/producao"],
  contador: ["/contador", "/notas", "/financeiro", "/documentos"],
  expedicao: ["/expedicao", "/fluxo"],
};

/** Botões coloridos do acesso rápido (3 por linha). */
function AcessoRapido({ ve, onIr }: { ve: (i: Item) => boolean; onIr: () => void }) {
  // painel da área: o botão mostra o ícone da área (o do item "Painel" é o mesmo em todas)
  const itens = RAPIDOS.map((r) => ({ ...r, item: todosItens.find((i) => i.to === r.to)! })).filter((r) => r.item && ve(r.item))
    .map((r) => ({ ...r, item: { ...r.item, icon: r.to.startsWith("/painel/") ? grupos.find((g) => g.itens.includes(r.item))?.icone ?? r.item.icon : r.item.icon } }));
  if (!itens.length) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5 px-3 pb-3 pt-2 md:pt-0" aria-label="Acesso rápido">
      {itens.map(({ to, label, cor, item: { icon: Icon } }) => (
        <NavLink key={to} to={to} onClick={onIr} title={label}
          className={({ isActive }) => `flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br ${cor} px-1 py-2 text-center text-[11.5px] font-bold leading-tight text-white shadow-sm transition hover:brightness-110 ${isActive ? "ring-2 ring-white/80 ring-offset-2 ring-offset-[#071528]" : "opacity-95"}`}>
          <Icon size={18} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </div>
  );
}

/** Logo do topo: tocar volta ao início (a tela inicial do perfil). */
function Marca({ compacta, onIr }: { compacta?: boolean; onIr?: () => void }) {
  return (
    <Link to="/" onClick={() => { onIr?.(); window.scrollTo({ top: 0 }); }} aria-label="ERP Line: voltar ao início" title="Voltar ao início"
      className={`flex shrink-0 items-center rounded-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ice ${compacta ? "gap-2" : "gap-3"}`}>
      <img src={logo} alt="" className={`${compacta ? "h-9 w-9" : "h-10 w-10"} rounded-xl ring-1 ring-white/10`} />
      {/* celular estreito (menos de 380 px): só o logo, para o cabeçalho não passar da tela */}
      <span className={`${compacta ? "hidden min-[380px]:inline" : ""} whitespace-nowrap leading-tight`}>
        <span className="block text-lg font-extrabold tracking-tight text-white">ERP <span className="text-brand-ice">Line</span></span>
        <span className={`${compacta ? "hidden min-[420px]:block" : "block"} text-[11px] font-semibold uppercase tracking-[0.16em] text-nav-fraco`}>MF Máquinas</span>
      </span>
    </Link>
  );
}

/** Escolha da unidade: Todas (só ver) · SC · SP. Novos lançamentos vão para a unidade escolhida. */
function SeletorUnidade({ compacto }: { compacto?: boolean }) {
  const { unidades, atual, setAtual } = useUnidade();
  if (unidades.length < 2) return null;
  const opcoes = [{ id: null as string | null, rotulo: "Todas", titulo: "Ver as duas unidades" },
    ...unidades.map((u) => ({ id: u.id as string | null, rotulo: compacto ? u.codigo : u.nome, titulo: u.nome }))];
  return (
    <div role="radiogroup" aria-label="Unidade" className={`flex gap-0.5 rounded-xl bg-ink-soft p-0.5 ${compacto ? "" : "w-full"}`}>
      {opcoes.map((o) => (
        <button key={o.id ?? "todas"} type="button" role="radio" aria-checked={atual === o.id} title={o.titulo} onClick={() => setAtual(o.id)}
          className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-bold transition ${atual === o.id ? "bg-brand-ice text-ink" : "text-nav-texto hover:text-white"}`}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Layout() {
  const perfil = usePerfil();
  const vis = useVisivel();
  const location = useLocation();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const navigate = useNavigate();
  // menu maior que a tela (notebook 1366x768): mostra "mais opções" enquanto houver itens escondidos embaixo
  const navRef = useRef<HTMLElement>(null);
  const [maisAbaixo, setMaisAbaixo] = useState(false);
  const medirNav = useCallback(() => {
    const n = navRef.current;
    setMaisAbaixo(!!n && n.scrollHeight - n.scrollTop - n.clientHeight > 8);
  }, []);
  useEffect(() => {
    medirNav();
    const n = navRef.current;
    if (!n || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medirNav);
    ro.observe(n);
    return () => ro.disconnect();
  }, [medirNav, aberto]);
  // área aberta no menu: a da tela atual (as outras ficam fechadas, só o título)
  const [areaAberta, setAreaAberta] = useState<string | null>(() => grupoDaRota(location.pathname));
  useEffect(() => { const g = grupoDaRota(location.pathname); if (g) setAreaAberta(g); }, [location.pathname]);
  const [trocarSenha, setTrocarSenha] = useState(false);
  const [aparencia, setAparencia] = useState(false);
  const [meusAvisos, setMeusAvisos] = useState(false);
  const iniciais = perfil.nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => { setAberto(false); setBusca(""); }, [location.pathname]);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  // área da tela atual: dá a cor (data-modulo no <html>, também nas janelas) e o ícone do título
  const modulo = useMemo<Modulo>(() => {
    const path = location.pathname;
    const item = todosItens.filter((i) => i.to === path || (i.to !== "/" && path.startsWith(i.to + "/"))).sort((a, b) => b.to.length - a.to.length)[0];
    const id = grupoDaRota(path) ?? "inicio";
    const g = grupos.find((x) => x.id === id);
    // Configurações e Usuários ficam na engrenagem (fora das áreas do menu), com a cor cinza
    return { id, titulo: g?.titulo ?? (id === "admin" ? "Configurações" : ""), icone: item?.icon ?? g?.icone };
  }, [location.pathname]);
  useEffect(() => { document.documentElement.dataset.modulo = modulo.id; }, [modulo.id]);

  // engrenagem do rodapé: Configurações (ou, para quem não as vê, Usuários ou Importar dados)
  const engrenagem = [["configuracoes", "/configuracoes"], ["usuarios", "/usuarios"], ["importar", "/importar"]]
    .find(([t, to]) => vis.ve(t as Tela, to))?.[1] ?? null;
  const atalhos = (ATALHOS[perfil.papel] ?? ATALHOS.admin)
    .map((to) => todosItens.find((i) => i.to === to)!)
    .filter((i) => i && vis.item(i));

  return (
    <NotificacoesProvider>
    <div className="min-h-screen md:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-ink-line bg-ink px-4 py-2.5 md:hidden">
        <Marca compacta onIr={() => setAberto(false)} />
        <div className="ml-auto flex items-center gap-1"><SeletorUnidade compacto /><Sino /></div>
        <button onClick={() => setAberto(!aberto)} aria-label={aberto ? "Fechar menu" : "Abrir menu"} className="rounded-lg p-2 text-white hover:bg-white/10">
          {aberto ? <X /> : <Menu />}
        </button>
      </header>

      <aside className={`${aberto ? "fixed inset-x-0 bottom-0 top-[61px] z-30 flex flex-col pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0" : "hidden"} bg-ink text-nav-texto md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 2xl:w-72 md:flex-col md:border-r md:border-ink-line`}>
        <div className="hidden px-5 pb-4 pt-6 md:block [@media(min-width:768px)_and_(max-height:860px)]:pb-3 [@media(min-width:768px)_and_(max-height:860px)]:pt-4"><div className="flex items-center justify-between gap-2"><Marca /><Sino /></div><div className="mt-4"><SeletorUnidade /></div></div>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <AcessoRapido ve={vis.item} onIr={() => setAberto(false)} />
        <form className="px-3 pb-2 pt-2 md:pt-0" role="search" onSubmit={(e) => {
          e.preventDefault();
          const primeiro = todosItens.find((m) => vis.item(m) && combina(m, busca));
          if (primeiro) navigate(primeiro.to);
        }}>
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-nav-fraco" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setBusca("")}
              placeholder="Buscar tela, cliente, venda, nota…" aria-label="Buscar no menu"
              className="w-full rounded-lg border border-ink-line bg-ink-soft py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-nav-fraco focus:border-brand-ice focus:outline-none" />
          </label>
        </form>
        <nav ref={navRef} onScroll={medirNav} className="flex-1 overflow-y-auto px-3 pb-4">
          {busca.trim() && !todosItens.some((m) => vis.item(m) && combina(m, busca)) && (
            <p className="px-3 py-2 text-sm text-nav-fraco">Nenhuma tela com "{busca.trim()}".</p>
          )}
          {grupos.map((g) => {
            const buscando = !!busca.trim();
            const itens = g.itens.filter((m) => vis.item(m) && (!buscando || combina(m, busca)));
            if (!itens.length) return null;
            const link = ({ to, label, curto, icon: Icon }: Item) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setAberto(false)}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] font-medium transition [@media(min-width:768px)_and_(max-height:860px)]:py-[6px] [@media(min-width:768px)_and_(max-height:860px)]:text-sm ${
                    isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-modulo" aria-hidden />}
                    <Icon size={18} className={isActive ? "text-modulo" : "text-nav-fraco group-hover:text-nav-texto"} />
                    {g.titulo ? label : curto}
                  </>
                )}
              </NavLink>
            );
            // Painel e e-mail: soltos no alto
            if (!g.titulo) return <div key={g.id} className="mb-3 grid grid-cols-2 gap-1">{itens.map(link)}</div>;
            const aberta = buscando || areaAberta === g.id;
            const Icone = g.icone ?? Boxes;
            const acao = g.acao && vis.ve(g.acao.tela, g.acao.to) ? g.acao : null;
            return (
              <section key={g.id} className={`mb-2 overflow-hidden rounded-xl border transition ${aberta ? "border-white/15 bg-white/[0.04]" : "border-transparent"}`}>
                <div className="flex items-center gap-1 pr-1.5">
                  <button type="button" aria-expanded={aberta}
                    onClick={() => {
                      // computador: o nome da área abre o painel dela (no celular só abre a lista, onde o painel é o primeiro item)
                      const painel = itens.find((i) => i.to.startsWith("/painel/")) ?? (g.id === "analises" ? itens.find((i) => i.to === "/gerencial") : undefined);
                      if (painel && !buscando && location.pathname !== painel.to && window.matchMedia("(min-width: 768px)").matches) {
                        setAreaAberta(g.id);
                        navigate(painel.to);
                        return;
                      }
                      setAreaAberta(aberta && !buscando ? null : g.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/5 2xl:gap-2.5">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${g.cor} text-white shadow-sm`}><Icone size={16} /></span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-white">{g.titulo}</span>
                    <ChevronDown size={16} className={`shrink-0 text-nav-fraco transition ${aberta ? "rotate-180" : ""}`} />
                  </button>
                  {acao && (
                    <button type="button" title={acao.dica} onClick={() => { setAberto(false); navigate(acao.to, { state: acao.state }); }}
                      className={`shrink-0 whitespace-nowrap rounded-lg bg-gradient-to-br ${g.cor} px-2 py-1 text-[11px] font-bold text-white shadow-sm hover:brightness-110`}>
                      + {acao.label}
                    </button>
                  )}
                </div>
                {aberta && <div className="space-y-0.5 px-1.5 pb-2">{itens.map(link)}</div>}
              </section>
            );
          })}
          {/* telas que não estão na lista (Configurações, Usuários, painéis de máquinas e produtos…) aparecem na busca */}
          {busca.trim() && itensForaDoMenu.some((m) => vis.item(m) && combina(m, busca)) && (
            <section className="mb-2 rounded-xl border border-white/15 bg-white/[0.04] px-1.5 pb-2 pt-1">
              <h2 className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-nav-fraco">Outras telas</h2>
              {itensForaDoMenu.filter((m) => vis.item(m) && combina(m, busca)).map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={() => setAberto(false)}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] font-medium transition ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"}`}>
                  <Icon size={18} className="text-nav-fraco" /> {label}
                </NavLink>
              ))}
            </section>
          )}
          {busca.trim().length >= 2 && <ResultadosBusca termo={busca} onIr={() => { setAberto(false); setBusca(""); }} />}
        </nav>
          {maisAbaixo && (
            <button type="button" onClick={() => navRef.current?.scrollBy({ top: 240, behavior: "smooth" })} aria-label="Ver mais itens do menu"
              className="absolute inset-x-0 bottom-0 flex h-8 items-end justify-center bg-gradient-to-t from-ink to-transparent pb-1 text-xs font-semibold text-nav-texto hover:text-white">
              {/* faixa baixa e botão sólido: antes o degradê alto cobria metade de um item, que parecia desativado */}
              <span className="flex items-center gap-1 rounded-full border border-white/10 bg-ink-line px-2.5 py-0.5 shadow"><ChevronDown size={14} /> mais opções</span>
            </button>
          )}
        </div>
        <div className="border-t border-ink-line p-3">
          {/* duas linhas: quem está logado em cima, os botões embaixo (numa linha só o nome sumia no notebook) */}
          <div className="flex items-center gap-2 px-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-soft text-sm font-bold text-brand-ice">{iniciais}</span>
            <span className="min-w-0 flex-1 leading-tight" title={perfil.nome}>
              <span className="block truncate text-sm font-semibold text-white">{perfil.nome}</span>
              <span className="block truncate text-xs text-nav-fraco">{[perfil.papel, ...(perfil.papeis_extras ?? [])].map(rotuloPapel).join(" · ")}</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-1">
            {([
              // engrenagem: Configurações (e, dentro dela, usuários e formas de pagamento)
              ...(engrenagem ? [["Configurações", Settings, () => { setAberto(false); navigate(engrenagem); }] as const] : []),
              ["Meus avisos", Bell, () => setMeusAvisos(true)],
              ["Aparência", Palette, () => setAparencia(true)],
              ["Trocar senha", KeyRound, () => setTrocarSenha(true)],
              ["Sair", LogOut, () => supabase.auth.signOut()],
            ] as const).map(([rotulo, Icone, acao]) => (
              <button key={rotulo} onClick={acao} title={rotulo} aria-label={rotulo}
                className="grid h-9 flex-1 place-items-center rounded-lg text-nav-fraco hover:bg-ink-soft hover:text-white">
                <Icone size={17} />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="fundo-modulo min-w-0 flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10 md:pt-8 2xl:px-8">
        <ModuloContext.Provider value={modulo}>
        <div className="mx-auto max-w-7xl">
          {DEMO && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 sm:mb-5 sm:px-4 sm:py-2.5 sm:text-sm">
              <b>Prévia com dados de exemplo.</b><span className="hidden sm:inline"> Pode clicar à vontade: nada é salvo e as notas fiscais são simuladas.
              Use <b>Sair</b> para trocar de perfil.</span><span className="sm:hidden"> Nada é salvo.</span>
            </div>
          )}
          <ErroTela key={location.pathname}><Outlet /></ErroTela>
        </div>
        </ModuloContext.Provider>
      </main>
      <AvisoVersao />

      {/* Celular: atalhos fixos embaixo, ao alcance do polegar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-ink-line bg-ink/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${atalhos.length + 1}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {atalhos.map(({ to, curto, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={() => setAberto(false)}
            className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isActive ? "text-modulo before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-b before:bg-modulo" : "text-nav-fraco"}`}>
            <Icon size={21} /> {curto}
          </NavLink>
        ))}
        <button onClick={() => setAberto(!aberto)} aria-expanded={aberto} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${aberto ? "text-brand-ice" : "text-nav-fraco"}`}>
          <Menu size={21} /> Mais
        </button>
      </nav>

      {trocarSenha && <AlterarSenha onClose={() => setTrocarSenha(false)} />}
      {aparencia && <Aparencia onClose={() => setAparencia(false)} />}
      {meusAvisos && <MeusAvisos onClose={() => setMeusAvisos(false)} />}
    </div>
    </NotificacoesProvider>
  );
}

function AlterarSenha({ onClose }: { onClose: () => void }) {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return notify("A senha precisa ter ao menos 8 caracteres", "erro");
    if (senha !== confirma) return notify("As senhas não conferem", "erro");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Senha alterada");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Alterar minha senha">
      <form onSubmit={salvar} className="space-y-3">
        <Field label="Nova senha"><input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus /></Field>
        <Field label="Repita a nova senha"><input className="input" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Tema (escuro/claro) e cor de destaque, salvos neste aparelho. */
function Aparencia({ onClose }: { onClose: () => void }) {
  const [tema, setTema] = useState<Tema>(lerTema());
  const [cor, setCor] = useState<Destaque>(lerDestaque());
  // salva no perfil: a mesma aparência aparece em qualquer aparelho em que a pessoa entrar
  const salvar = (p: Record<string, string>) => { supabase.rpc("salvar_preferencias", { p }).then(() => null); };
  const escolherTema = (t: Tema) => { aplicarTema(t); setTema(t); salvar({ tema: t }); };
  const escolherCor = (d: Destaque) => { aplicarDestaque(d); setCor(d); salvar({ destaque: d }); };

  return (
    <Modal open onClose={onClose} title="Aparência">
      <div className="space-y-6">
        <div>
          <div className="mb-2 text-sm font-bold text-fg">Tema</div>
          <div className="grid grid-cols-2 gap-3">
            {([["escuro", "Escuro", Moon], ["claro", "Claro", Sun]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" onClick={() => escolherTema(v)}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 p-4 text-base font-semibold transition ${tema === v ? "border-brand bg-brand-light text-fg" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                <Icon size={20} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-bold text-fg">Cor de destaque</div>
          <div className="grid grid-cols-2 gap-3">
            {DESTAQUES.map((d) => (
              <button key={d.value} type="button" onClick={() => escolherCor(d.value)}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${cor === d.value ? "border-brand" : "border-slate-200 hover:border-slate-300"}`}>
                <span className="relative flex">
                  <span className="h-9 w-9 rounded-full ring-2 ring-white/20" style={{ background: d.par }} />
                  <span className="-ml-3 h-9 w-9 rounded-full ring-2 ring-white/20" style={{ background: d.cor }} />
                </span>
                <span className="flex-1 text-sm font-semibold text-fg">{d.label}</span>
                {cor === d.value && <Check size={18} className="text-brand" />}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">Fica salvo no seu usuário: vale no computador e no celular. Cada pessoa da equipe escolhe a sua.</p>
      </div>
    </Modal>
  );
}
