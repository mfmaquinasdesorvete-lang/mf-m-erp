import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ModuloContext, type Modulo } from "@/lib/modulo";
import {
  ArrowLeftRight, BarChart3, Bell, Boxes, Inbox, Paperclip, HandCoins, Workflow, PieChart, Calculator, Check, Factory, Palette, FileText, KeyRound, LayoutDashboard, LogOut, Menu, Moon, Settings, ShieldCheck, ShoppingCart, Sun,
  Truck, UserCog, Users, Wallet, IceCreamCone, Lock, Wrench, X, ChevronDown, Landmark, ShieldAlert, Search, Gauge,
  Store, PackageSearch, CreditCard, Package, ScanBarcode, Scale, IdCard, Plus,
  ScanFace, Sparkles,
} from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { sairDoErp } from "@/lib/sair";
import { descreverAparelho } from "@/lib/acessos";
import { usePerfil } from "@/lib/auth";
import { rotuloPapel, type Tela } from "@/lib/permissoes";
import { ATALHOS_CELULAR, RAPIDOS, abreEmOutraAba, alvoDoLink, grupoDaRota, grupos, itensForaDoMenu, painelDaArea, todosItens, useVisivel, type Item } from "@/lib/menu";
import { notify, notifyError } from "@/lib/notify";
import { aplicarDestaque, aplicarFundo, aplicarTema, DESTAQUES, lerDestaque, lerFundo, lerTema, type Destaque, type Fundo, type Tema } from "@/lib/tema";
import logo from "@/assets/logo.webp";
import { corValida, useAparencia } from "@/lib/aparencia";
import { useConfig } from "@/lib/useConfig";
import { corDoDegrade, IconeArea } from "@/components/IconeArea";
import { Button, Field, Modal, useFecharComEsc } from "./ui";
import { MeusAvisos } from "./Avisos";
import { MeuRosto } from "./Rosto";
import { usaRosto } from "@/lib/rosto";
import { ResultadosBusca } from "./BuscaGeral";
import { PerguntarIA, parecePergunta } from "./PerguntarIA";
// cotação rápida de frete (o cliente liga perguntando): abre por cima de qualquer tela, carregada só quando abre
const CotacaoRapida = lazy(() => import("./fretes/CotacaoRapida").then((m) => ({ default: m.CotacaoRapida })));
import { NotificacoesProvider, Sino } from "./Notificacoes";
import { useUnidade } from "@/lib/unidade";
import { AvisoVersao, ErroTela } from "./ErroTela";
import { Trilha } from "@/components/Trilha";
import { AlertaObrigacoes } from "@/components/contador/CalendarioObrigacoes";
import { AlertaContasDoMes } from "@/components/pessoal/ContasDoMes";

// versão gravada na montagem do site (vite.config.ts); na prévia sem git fica vazia
const VERSAO = typeof __ERP_VERSAO__ !== "undefined" ? __ERP_VERSAO__ : null;


const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const combina = (m: Item, termo: string) => {
  const t = semAcento(`${m.label} ${m.busca ?? ""}`);
  return semAcento(termo).split(/\s+/).filter(Boolean).every((p) => t.includes(p));
};

/** Botões coloridos do acesso rápido (3 por linha). */
/** E-mail ao lado do sino (saiu da fileira Início · E-mail · Scrum do menu, pedido de 23/10). */
function BotaoEmail({ onIr }: { onIr?: () => void }) {
  const vis = useVisivel();
  const item = todosItens.find((i) => i.to === "/email");
  if (!item || !vis.item(item)) return null;
  return (
    <NavLink to="/email" onClick={onIr} title="Caixa de e-mail" aria-label="Caixa de e-mail"
      className={({ isActive }) => `grid h-9 w-9 place-items-center rounded-full transition ${isActive ? "bg-white/15 text-white" : "text-nav-texto hover:bg-white/10 hover:text-white"}`}>
      <Inbox size={19} aria-hidden />
    </NavLink>
  );
}

/** PDV no cartão do alto do menu: botão fino, na cor dele (abre em outra aba). */
function BotaoPdv({ ve, onIr }: { ve: (i: Item) => boolean; onIr: () => void }) {
  const r = RAPIDOS.find((x) => x.to === "/pdv");
  const item = todosItens.find((i) => i.to === "/pdv");
  if (!r || !item || !ve(item)) return null;
  return (
    <NavLink to="/pdv" onClick={onIr} title={r.label} {...alvoDoLink("/pdv")}
      className={`mt-2 flex items-center justify-center gap-2 rounded-botao bg-gradient-to-r ${r.cor} px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:brightness-110`}>
      <ScanBarcode size={15} aria-hidden /> {r.label}
    </NavLink>
  );
}

/** Logo do topo: tocar volta ao início (a tela inicial do perfil). */
function Marca({ compacta, onIr }: { compacta?: boolean; onIr?: () => void }) {
  const logoErp = useAparencia().logo_erp;
  return (
    <Link to="/" onClick={() => { onIr?.(); window.scrollTo({ top: 0 }); }} aria-label="ERP Line: voltar ao início" title="Voltar ao início"
      className={`flex shrink-0 items-center rounded-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ice ${compacta ? "gap-2" : "gap-3"}`}>
      <img src={logoErp || logo} alt="" className={`${compacta ? "h-9 w-9" : "h-10 w-10"} rounded-xl object-cover ring-1 ring-white/10`} />
      {/* celular estreito (menos de 380 px): só o logo, para o cabeçalho não passar da tela */}
      <span className={`${compacta ? "hidden min-[440px]:inline" : ""} whitespace-nowrap leading-tight`}>
        <span className="block text-lg font-bold tracking-tight text-white">ERP <span className="text-brand-ice">Line</span></span>
        <span className={`${compacta ? "hidden min-[420px]:block" : "block"} text-2xs font-semibold uppercase tracking-selo text-nav-fraco`}>MF Máquinas</span>
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
  // configurações da empresa carregadas em toda tela: trazem a aparência (cores, fontes e logo) de Sobre → Design
  useConfig();
  const vis = useVisivel();
  const location = useLocation();
  // trocou de tela (ex.: tocou num aviso do painel): começa do alto, e não no meio da página de antes
  useEffect(() => { window.scrollTo({ top: 0 }); document.querySelector("main")?.scrollTo?.({ top: 0 }); }, [location.pathname]);
  const [aberto, setAberto] = useState(false);
  const [criar, setCriar] = useState(false);
  const [busca, setBusca] = useState("");
  const [pergunta, setPergunta] = useState<string | null>(null);
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
  const [cotarFrete, setCotarFrete] = useState(false);
  const [meuRosto, setMeuRosto] = useState(false);
  const iniciais = perfil.nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  // foto do usuário (Configurações → Usuários); cada um lê a própria
  const { data: minhaFoto } = useQuery({
    queryKey: ["usuarios_erp", "minha-foto", perfil.user_id], staleTime: 300_000,
    queryFn: async () => ((await supabase.from("usuarios_erp").select("foto").eq("user_id", perfil.user_id).maybeSingle()).data?.foto as string | null) ?? null,
  });

  useEffect(() => { setAberto(false); setBusca(""); }, [location.pathname]);
  // Ctrl+K (ou ⌘K) leva à busca do menu de qualquer tela; no celular abre o menu antes
  const buscaRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      setAberto(true);
      requestAnimationFrame(() => buscaRef.current?.focus());
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);
  // PDV sempre em outra aba: também os links de dentro das telas (painéis, Sobre…) que apontam para ele
  useEffect(() => {
    const clique = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented || e.button !== 0) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !abreEmOutraAba(url.pathname)) return;
      e.preventDefault(); e.stopPropagation();
      setAberto(false);
      window.open(url.pathname + url.search, "_blank", "noopener");
    };
    document.addEventListener("click", clique, true);
    return () => document.removeEventListener("click", clique, true);
  }, []);
  useFecharComEsc(criar, () => setCriar(false));
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

  // registro dos acessos (Usuários → topo): marca a entrada e, com a tela aberta e visível, um sinal a cada 5 minutos
  useEffect(() => {
    if (!perfil.user_id) return;
    const { dispositivo, navegador } = descreverAparelho(navigator.userAgent);
    // parado: sem mexer no mouse, teclado ou tela nos últimos 5 minutos (o banco soma esse tempo)
    let mexeu = Date.now();
    const atividade = () => { mexeu = Date.now(); };
    const EVENTOS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    EVENTOS.forEach((e) => window.addEventListener(e, atividade, { passive: true }));
    const sinal = () => {
      if (document.hidden) return;
      const p_ativo = Date.now() - mexeu < 5 * 60_000;
      supabase.rpc("registrar_acesso", { p_dispositivo: dispositivo, p_navegador: navegador, p_ativo }).then(() => {}, () => {});
    };
    sinal();
    const t = setInterval(sinal, 5 * 60_000);
    const voltou = () => { if (!document.hidden) { mexeu = Date.now(); sinal(); } };
    document.addEventListener("visibilitychange", voltou);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", voltou); EVENTOS.forEach((e) => window.removeEventListener(e, atividade)); };
  }, [perfil.user_id]);

  // engrenagem do rodapé: Configurações (ou, para quem não as vê, Usuários ou Importar dados)
  const engrenagem = [["configuracoes", "/configuracoes"], ["usuarios", "/usuarios"], ["importar", "/importar"]]
    .find(([t, to]) => vis.ve(t as Tela, to))?.[1] ?? null;
  const atalhos = (ATALHOS_CELULAR[perfil.papel] ?? ATALHOS_CELULAR.admin)
    .map((to) => todosItens.find((i) => i.to === to)!)
    .filter((i) => i && vis.item(i));

  // "+" da barra do celular: as ações diretas das áreas que a pessoa pode fazer
  const acoesRapidas = grupos.flatMap((g) => g.acao && vis.ve(g.acao.tela, g.acao.to) && perfil.pode(g.acao.pode) ? [{ g, acao: g.acao }] : []);
  const meioBarra = Math.ceil(atalhos.length / 2);

  return (
    <NotificacoesProvider>
    {/* primeiro Tab da página: pula o menu e vai direto ao conteúdo da tela */}
    <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-alerta focus:rounded-botao focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-fg">Pular para o conteúdo</a>
    <div className="min-h-screen md:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/5 bg-ink/85 px-4 py-2.5 backdrop-blur-xl md:hidden" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top, 0px))" }}>
        <Marca compacta onIr={() => setAberto(false)} />
        <div className="ml-auto flex items-center gap-1"><SeletorUnidade compacto /><BotaoEmail onIr={() => setAberto(false)} /><Sino /></div>
        <button onClick={() => setAberto(!aberto)} aria-label={aberto ? "Fechar menu" : "Abrir menu"} className="rounded-lg p-2 text-white hover:bg-white/10">
          {aberto ? <X /> : <Menu />}
        </button>
      </header>

      <aside className={`${aberto ? "fixed inset-x-0 bottom-0 top-[61px] z-30 flex flex-col pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0" : "hidden"} bg-ink text-nav-texto md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 2xl:w-72 md:flex-col md:border-r md:border-ink-line`}>
        {/* topo do menu (23/10): cartão de vidro com aurora — marca, e-mail e sino; a unidade e o PDV embaixo */}
        <div className="hidden px-3 pb-3 pt-3 md:block">
          <div className="relative overflow-hidden rounded-painel border border-white/10 p-3 shadow-lg"
            style={{ background: "linear-gradient(140deg, rgb(168 85 247 / 0.28) 0%, rgb(236 72 153 / 0.14) 45%, rgb(37 99 235 / 0.18) 100%)" }}>
            <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-fixo-pink-500/30 blur-2xl" aria-hidden />
            <div className="relative flex items-center gap-1">
              <Marca />
              <span className="ml-auto flex items-center"><BotaoEmail /><Sino /></span>
            </div>
            <div className="relative mt-3"><SeletorUnidade /></div>
            <div className="relative"><BotaoPdv ve={vis.item} onIr={() => setAberto(false)} /></div>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <form className="px-3 pb-3 pt-2 md:pt-0" role="search" onSubmit={(e) => {
          e.preventDefault();
          const primeiro = todosItens.find((m) => vis.item(m) && combina(m, busca));
          if (primeiro && abreEmOutraAba(primeiro.to)) window.open(primeiro.to, "_blank", "noopener");
          else if (primeiro) navigate(primeiro.to);
        }}>
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-nav-fraco" />
            <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setBusca("")}
              placeholder="Buscar tela, cliente, venda, nota…" aria-label="Buscar no menu (Ctrl+K)" aria-keyshortcuts="Control+K"
              className="w-full rounded-cartao border border-white/10 bg-white/[.06] py-2 pl-9 pr-14 text-sm text-white placeholder:text-nav-fraco focus:border-brand-ice focus:bg-white/10 focus:outline-none" />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-chip border border-white/15 px-1.5 py-0.5 font-sans text-2xs font-semibold text-nav-fraco md:block" aria-hidden>Ctrl K</kbd>
          </label>
        </form>
        {/* celular: o PDV fica embaixo da busca (no computador está no cartão do alto) */}
        <div className="px-3 pb-2 md:hidden"><BotaoPdv ve={vis.item} onIr={() => setAberto(false)} /></div>
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
                {...alvoDoLink(to)}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition [@media(min-width:768px)_and_(max-height:860px)]:py-[6px] [@media(min-width:768px)_and_(max-height:860px)]:text-sm ${
                    isActive ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-nav-texto hover:bg-white/5 hover:text-white"
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
            // Início e e-mail não aparecem mais em fileira (23/10): o logo volta ao início e o e-mail fica ao lado do sino;
            // na busca eles continuam aparecendo
            if (!g.titulo && !buscando) return null;
            if (!g.titulo) return (
              <div key={g.id} className={`mb-3 grid gap-1 ${itens.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {itens.length < 3 ? itens.map(link) : itens.map(({ to, curto, label, icon: Icon }) => (
                  <NavLink key={to} to={to} end={to === "/"} onClick={() => setAberto(false)} title={label} {...alvoDoLink(to)}
                    className={({ isActive }) => `flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-xs font-medium transition ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"}`}>
                    {({ isActive }) => <><Icon size={18} className={isActive ? "text-modulo" : "text-nav-fraco"} />{curto}</>}
                  </NavLink>
                ))}
              </div>
            );
            const aberta = buscando || areaAberta === g.id;
            const Icone = g.icone ?? Boxes;
            // o "+" só aparece para quem pode fazer (antes o contador via "+ Conta" e "+ NF-e" sem poder lançar)
            const acao = g.acao && vis.ve(g.acao.tela, g.acao.to) && perfil.pode(g.acao.pode) ? g.acao : null;
            return (
              <section key={g.id} className={`mb-1 overflow-hidden rounded-cartao border transition ${aberta ? "border-white/10 bg-white/[0.05]" : "border-transparent"}`}>
                <div className="flex items-center gap-1 pr-1.5">
                  <button type="button" aria-expanded={aberta}
                    onClick={() => {
                      // computador: o nome da área abre o painel dela (no celular só abre a lista, onde o painel é o primeiro item)
                      const alvo = painelDaArea(g);
                      const painel = alvo ? itens.find((i) => i.to === alvo) : undefined;
                      if (painel && !buscando && location.pathname !== painel.to && window.matchMedia("(min-width: 768px)").matches) {
                        setAreaAberta(g.id);
                        navigate(painel.to);
                        return;
                      }
                      setAreaAberta(aberta && !buscando ? null : g.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-cartao px-2 py-1.5 text-left hover:bg-white/5">
                    <IconeArea id={g.id} Icone={Icone} tamanho={16} caixa="h-7 w-7 rounded-botao" degrade={g.cor} suave />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{g.titulo}</span>
                    <ChevronDown size={16} className={`shrink-0 text-nav-fraco transition ${aberta ? "rotate-180" : ""}`} />
                  </button>
                  {acao && (
                    <button type="button" title={acao.dica} onClick={() => { setAberto(false); navigate(acao.to, { state: acao.state }); }}
                      style={{ background: `color-mix(in srgb, ${corDoDegrade(g.cor) ?? "#64748b"} 22%, transparent)`, color: `color-mix(in srgb, ${corDoDegrade(g.cor) ?? "#64748b"} 70%, white)` }}
                      className="shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-2xs font-bold transition hover:brightness-125">
                      + {acao.label}
                    </button>
                  )}
                </div>
                {aberta && <div className="space-y-0.5 px-1.5 pb-2">{itens.map(link)}</div>}
              </section>
            );
          })}
          {/* My Frost Sorveterias (as unidades licenciadas): botão rosinha no fim do menu, só para a conta master */}
          {perfil.master && (!busca.trim() || semAcento("my frost sorveterias licenciados unidades lojas quiosques sorvete").includes(semAcento(busca.trim()))) && (
            <NavLink to="/licenciados" onClick={() => setAberto(false)}
              className={({ isActive }) => `mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-fixo-pink-200 to-fixo-pink-300 px-2 py-2.5 text-sm font-bold text-fixo-pink-900 shadow-sm transition hover:brightness-105 ${isActive ? "ring-2 ring-white/80 ring-offset-2 ring-offset-[#071528]" : ""}`}>
              <IceCreamCone size={19} aria-hidden /> My Frost Sorveterias
            </NavLink>
          )}
          {/* telas que não estão na lista (Configurações, Usuários, painéis de máquinas e produtos…) aparecem na busca */}
          {busca.trim() && itensForaDoMenu.some((m) => vis.item(m) && combina(m, busca)) && (
            <section className="mb-2 rounded-xl border border-white/15 bg-white/[0.04] px-1.5 pb-2 pt-1">
              <h2 className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-nav-fraco">Outras telas</h2>
              {itensForaDoMenu.filter((m) => vis.item(m) && combina(m, busca)).map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={() => setAberto(false)} {...alvoDoLink(to)}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"}`}>
                  <Icon size={18} className="text-nav-fraco" /> {label}
                </NavLink>
              ))}
            </section>
          )}
          {parecePergunta(busca) && (
            <button type="button" onClick={() => setPergunta(busca)}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-brand-ice/40 bg-white/[0.06] px-3 py-2 text-left text-sm text-white hover:bg-white/10">
              <Sparkles size={16} className="shrink-0 text-brand-ice" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block font-semibold">Perguntar à IA</span><span className="block truncate text-xs text-nav-fraco">"{busca.trim()}"</span></span>
            </button>
          )}
          {busca.trim().length >= 2 && <ResultadosBusca termo={busca} onIr={() => { setAberto(false); setBusca(""); }} />}
        </nav>
          {maisAbaixo && (
            <button type="button" onClick={() => navRef.current?.scrollBy({ top: 240, behavior: "smooth" })} aria-label="Ver mais itens do menu"
              className="absolute inset-x-0 bottom-0 flex h-6 items-end justify-center bg-gradient-to-t from-ink/90 to-transparent text-nav-fraco hover:text-white">
              {/* só uma setinha na beirada (a pílula "mais opções" cobria o nome da área de baixo) */}
              <ChevronDown size={16} className="motion-safe:animate-bounce" aria-hidden />
            </button>
          )}
        </div>
        <div className="border-t border-ink-line p-3">
          {/* duas linhas: quem está logado em cima, os botões embaixo (numa linha só o nome sumia no notebook) */}
          <div className="flex items-center gap-2 px-1">
            {minhaFoto ? <img src={minhaFoto} alt="" aria-hidden className="h-9 w-9 shrink-0 rounded-full object-cover" />
              : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-soft text-sm font-bold text-brand-ice">{iniciais}</span>}
            <span className="min-w-0 flex-1 leading-tight" title={perfil.nome}>
              <span className="block truncate text-sm font-semibold text-white">{perfil.nome}</span>
              <span className="block truncate text-xs text-nav-fraco">{[perfil.papel, ...(perfil.papeis_extras ?? [])].map(rotuloPapel).join(" · ")}</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-1">
            {([
              // engrenagem: Configurações (e, dentro dela, usuários e formas de pagamento)
              ...(engrenagem ? [["Configurações", Settings, () => { setAberto(false); navigate(engrenagem); }] as const] : []),
              // cadeado: Retaguarda (carteira pessoal, My Frost, usuários, configurações), só a conta master
              ...(perfil.master ? [["Retaguarda", Lock, () => { setAberto(false); navigate("/retaguarda"); }] as const] : []),
              ...(perfil.tem("vendas", "financeiro", "expedicao") ? [["Cotação rápida de frete", Truck, () => setCotarFrete(true)] as const] : []),
              ["Meus avisos", Bell, () => setMeusAvisos(true)],
              ["Aparência", Palette, () => setAparencia(true)],
              ["Trocar senha", KeyRound, () => setTrocarSenha(true)],
              ...(!DEMO && usaRosto(perfil.papel, perfil.papeis_extras) ? [["Meu rosto", ScanFace, () => setMeuRosto(true)] as const] : []),
              ["Sair", LogOut, () => { void sairDoErp(); }],
            ] as const).map(([rotulo, Icone, acao]) => (
              <button key={rotulo} onClick={acao} title={rotulo} aria-label={rotulo}
                className="grid h-9 flex-1 place-items-center rounded-lg text-nav-fraco hover:bg-ink-soft hover:text-white">
                <Icone size={17} />
              </button>
            ))}
          </div>
          {/* versão em uso, com data e hora: abre o Sobre no Resumo (com as atualizações dia a dia) */}
          <div className="mt-1 flex items-center justify-between gap-2 px-1 text-2xs leading-tight text-nav-fraco">
            <Link to="/sobre" onClick={() => setAberto(false)} title="Sobre o ERP Line: o resumo, com as atualizações dia a dia" className="min-w-0 truncate hover:text-white">
              ERP Line {VERSAO ? <>v{VERSAO.numero} · {VERSAO.quando}</> : "· prévia"}
            </Link>
            <Link to="/sobre" onClick={() => setAberto(false)} title="Sobre o ERP Line: módulos, atualizações, esquemas e ideias" className="shrink-0 font-semibold hover:text-white">Sobre</Link>
          </div>
        </div>
      </aside>

      <main id="conteudo" tabIndex={-1} className="fundo-modulo relative min-w-0 flex-1 focus:outline-none px-4 pb-32 pt-3 md:px-6 md:pb-10 md:pt-8 2xl:px-8">
        {/* assinatura das empresas desde 2009 */}
        <span className="assinatura pointer-events-none absolute right-4 top-1.5 hidden select-none text-xl text-modulo-texto/70 md:block 2xl:right-8" aria-hidden>Sopro Divino</span>
        <ModuloContext.Provider value={modulo}>
        <div className="mx-auto max-w-7xl">
          {DEMO && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 sm:mb-5 sm:px-4 sm:py-2.5 sm:text-sm">
              <b>Prévia com dados de exemplo.</b><span className="hidden sm:inline"> Pode clicar à vontade: nada é salvo e as notas fiscais são simuladas.
              Use <b>Sair</b> para trocar de perfil.</span><span className="sm:hidden"> Nada é salvo.</span>
            </div>
          )}
          {/* trilha: Voltar e onde a pessoa está (Início › área › tela) */}
          <Trilha />
          <ErroTela key={location.pathname}><Outlet /></ErroTela>
        </div>
        </ModuloContext.Provider>
      </main>
      <AvisoVersao />

      {/* Celular: barra flutuante embaixo, ao alcance do polegar, com o "+" no meio (criar venda, OS, conta, NF-e…) */}
      {criar && <div aria-hidden className="fixed inset-0 z-gaveta bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setCriar(false)} />}
      {criar && (
        <div role="dialog" aria-label="Criar" className="fixed inset-x-3 z-janela rounded-3xl border border-white/10 bg-ink-soft/95 p-3 shadow-2xl backdrop-blur-xl md:hidden"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))", animation: "entrar .18s ease-out" }}>
          <p className="px-2 pb-2 pt-1 text-2xs font-semibold uppercase tracking-wider text-nav-fraco">Criar agora</p>
          <div className="grid grid-cols-2 gap-2">
            {acoesRapidas.map(({ g, acao }) => {
              const Icone = g.icone ?? Boxes;
              return (
                <button key={g.id} type="button" onClick={() => { setCriar(false); setAberto(false); navigate(acao.to, { state: acao.state }); }}
                  className="flex items-center gap-2.5 rounded-2xl bg-white/5 p-3 text-left text-white active:scale-[.98]">
                  <IconeArea id={g.id} Icone={Icone} tamanho={18} caixa="h-9 w-9 rounded-xl" degrade={g.cor} />
                  <span className="min-w-0"><span className="block text-sm font-semibold">{acao.label}</span><span className="block truncate text-2xs font-normal text-nav-fraco">{acao.dica}</span></span>
                </button>
              );
            })}
            <button type="button" onClick={() => { setCriar(false); setAberto(true); }}
              className={`flex items-center gap-2.5 rounded-2xl bg-white/5 p-3 text-left text-white active:scale-[.98] ${acoesRapidas.length % 2 === 0 ? "col-span-2" : ""}`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10"><Menu size={18} /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold">Todas as telas</span><span className="block truncate text-2xs font-normal text-nav-fraco">abre o menu completo</span></span>
            </button>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-3 z-gaveta flex items-center rounded-[1.75rem] border border-white/10 bg-ink/85 px-1.5 shadow-[0_12px_40px_-8px_rgb(0_0_0/0.6)] backdrop-blur-xl md:hidden"
        style={{ bottom: "calc(0.6rem + env(safe-area-inset-bottom, 0px))" }}>
        {atalhos.map(({ to, curto, icon: Icon }, i) => (
          <div key={to} className="flex min-w-0 flex-1" style={{ order: i < meioBarra ? 0 : 2 }}>
            <NavLink to={to} end={to === "/"} onClick={() => { setAberto(false); setCriar(false); }} {...alvoDoLink(to)}
              className={({ isActive }) => `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2.5 text-2xs font-semibold ${isActive ? "text-white" : "text-nav-fraco"}`}>
              {({ isActive }) => (<>
                <span className={`grid h-8 w-12 place-items-center rounded-full transition ${isActive ? "bg-modulo/25 text-modulo" : ""}`}><Icon size={20} /></span>
                <span className="max-w-full truncate">{curto}</span>
              </>)}
            </NavLink>
          </div>
        ))}
        <div className="flex shrink-0 justify-center px-1" style={{ order: 1 }}>
          <button type="button" onClick={() => { setAberto(false); setCriar(!criar); }} aria-expanded={criar} aria-label={criar ? "Fechar" : "Criar"}
            className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-fixo-violet-500 to-fixo-blue-500 text-white shadow-[0_10px_25px_-5px_rgb(124_58_237/0.7)] ring-4 ring-canvas transition active:scale-95">
            <Plus size={26} className={`transition ${criar ? "rotate-45" : ""}`} />
          </button>
        </div>
      </nav>

      {trocarSenha && <AlterarSenha onClose={() => setTrocarSenha(false)} />}
      {aparencia && <Aparencia onClose={() => setAparencia(false)} />}
      {meusAvisos && <MeusAvisos onClose={() => setMeusAvisos(false)} />}
      {cotarFrete && (
        <Modal open title="Cotação rápida de frete" onClose={() => setCotarFrete(false)} wide>
          <Suspense fallback={<p className="text-sm text-slate-500">Carregando…</p>}><CotacaoRapida /></Suspense>
        </Modal>
      )}
      {meuRosto && <MeuRosto onClose={() => setMeuRosto(false)} />}
      {(perfil.tem("financeiro") || perfil.papel === "contador") && <AlertaObrigacoes />}
      {perfil.master && <AlertaContasDoMes />}
      {pergunta !== null && <PerguntarIA inicial={pergunta} onClose={() => { setPergunta(null); setBusca(""); setAberto(false); }} />}
    </div>
    </NotificacoesProvider>
  );
}

export function AlterarSenha({ onClose }: { onClose: () => void }) {
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
  const corMarca = useAparencia().cor_marca;
  const [fundo, setFundo] = useState<Fundo>(lerFundo());
  // salva no perfil: a mesma aparência aparece em qualquer aparelho em que a pessoa entrar
  const salvar = (p: Record<string, string>) => { supabase.rpc("salvar_preferencias", { p }).then(() => null); };
  const escolherTema = (t: Tema) => { aplicarTema(t); setTema(t); salvar({ tema: t }); };
  const escolherCor = (d: Destaque) => { aplicarDestaque(d); setCor(d); salvar({ destaque: d }); };
  const escolherFundo = (f: Fundo) => { aplicarFundo(f); setFundo(f); salvar({ fundo3: f }); };

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
        {tema === "escuro" && (
          <div>
            <div className="mb-2 text-sm font-bold text-fg">Fundo do tema escuro</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {([["aurora", "Aurora 2026", "vidro, degradês e brilho (padrão)", "#3b1d6e", "#120a2a"], ["app", "App", "azul-noite com brilho, o de antes", "#191b33", "#0a0b1a"], ["grafite", "Grafite", "neutro, mais fácil de ler", "#1b1e24", "#101216"], ["marinho", "Azul-marinho", "o de antes", "#0c213e", "#050e1e"]] as const).map(([v, label, dica, c1, c2]) => (
                <button key={v} type="button" onClick={() => escolherFundo(v)}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${fundo === v ? "border-brand" : "border-slate-200 hover:border-slate-300"}`}>
                  <span className="relative flex">
                    <span className="h-9 w-9 rounded-full ring-2 ring-white/20" style={{ background: c2 }} />
                    <span className="-ml-3 h-9 w-9 rounded-full ring-2 ring-white/20" style={{ background: c1 }} />
                  </span>
                  <span className="flex-1 text-sm"><b className="block text-fg">{label}</b><span className="text-xs text-slate-500">{dica}</span></span>
                  {fundo === v && <Check size={18} className="text-brand" />}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-2 text-sm font-bold text-fg">Cor de destaque</div>
          <div className="grid grid-cols-2 gap-3">
            {DESTAQUES.filter((d) => d.value !== "marca" || corValida(corMarca)).map((d) => ({ ...d, cor: d.value === "marca" ? corMarca! : d.cor })).map((d) => (
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
