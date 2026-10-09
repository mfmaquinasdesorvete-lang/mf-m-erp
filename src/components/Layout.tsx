import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight, BarChart3, Bell, Boxes, Inbox, Paperclip, HandCoins, Workflow, PieChart, Calculator, Check, Factory, Palette, FileText, KeyRound, LayoutDashboard, LogOut, Menu, Moon, Settings, ShieldCheck, ShoppingCart, Sun,
  Truck, UserCog, Users, Wallet, Wrench, X, ChevronDown, Landmark, ShieldAlert, Search, Gauge,
  Store, PackageSearch, CreditCard, Package,
} from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { PAPEIS, type Tela } from "@/lib/permissoes";
import { notify, notifyError } from "@/lib/notify";
import { aplicarDestaque, aplicarTema, DESTAQUES, lerDestaque, lerTema, type Destaque, type Tema } from "@/lib/tema";
import logo from "@/assets/logo.webp";
import { Button, Field, Modal } from "./ui";
import { MeusAvisos } from "./Avisos";
import { NotificacoesProvider, Sino } from "./Notificacoes";
import { useUnidade } from "@/lib/unidade";

type Item = { to: string; tela: Tela; label: string; curto: string; icon: typeof Boxes; busca?: string };

// Menu por área, na ordem do trabalho: vender → atender → estoque/compras → financeiro → fiscal → análises.
// "busca" são outros nomes que as pessoas usam para achar a tela (campo Buscar no menu).
const grupos: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "",
    itens: [
      { to: "/", tela: "painel", label: "Painel", curto: "Início", icon: LayoutDashboard, busca: "início dashboard resumo" },
      { to: "/email", tela: "email", label: "Caixa de e-mail", curto: "E-mail", icon: Inbox, busca: "email mensagens" },
    ],
  },
  {
    titulo: "Vendas",
    itens: [
      { to: "/pedidos", tela: "pedidos", label: "Vendas e orçamentos", curto: "Vendas", icon: ShoppingCart, busca: "pedido orçamento proposta venda" },
      { to: "/fluxo", tela: "fluxo", label: "Fluxo de pedidos", curto: "Fluxo", icon: Workflow, busca: "expedição separar embalar despachar entrega" },
      { to: "/fretes", tela: "fretes", label: "Fretes e envios", curto: "Fretes", icon: PackageSearch, busca: "frete cotação transportadora coleta rastreio entrega comprovante ocorrência cte painel" },
      { to: "/comissoes", tela: "comissoes", label: "Comissões", curto: "Comissões", icon: HandCoins, busca: "vendedor representante" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { to: "/clientes", tela: "clientes", label: "Clientes", curto: "Clientes", icon: Users, busca: "cadastro contato cpf cnpj" },
      { to: "/estoque", tela: "estoque", label: "Produtos e estoque", curto: "Produtos", icon: Boxes, busca: "produto peça máquina inventário ncm categoria kit" },
      { to: "/fornecedores", tela: "fornecedores", label: "Fornecedores", curto: "Fornec.", icon: Store, busca: "fornecedor peças compra cotação" },
      { to: "/transportadoras", tela: "fornecedores", label: "Transportadoras", curto: "Transp.", icon: Truck, busca: "transportadora frete coleta cotação" },
      { to: "/formas-pagamento", tela: "financeiro", label: "Formas de pagamento", curto: "Pagto.", icon: CreditCard, busca: "pix boleto cartão parcelas taxa condição de pagamento" },
      { to: "/embalagens", tela: "fretes", label: "Embalagens", curto: "Embal.", icon: Package, busca: "caixa engradado palete medidas peso cubagem" },
    ],
  },
  {
    titulo: "Fiscal",
    itens: [
      { to: "/notas", tela: "notas", label: "Notas fiscais", curto: "Notas", icon: FileText, busca: "nf nfe xml danfe sefaz tributação ibs cbs icms focus" },
      { to: "/contador", tela: "contador", label: "Painel do contador", curto: "Contador", icon: Calculator, busca: "fechamento contabilidade" },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { to: "/financeiro", tela: "financeiro", label: "Contas a pagar e receber", curto: "Contas", icon: Wallet, busca: "boleto pix pagamento recebimento cobrança parcela dre fluxo de caixa" },
      { to: "/conciliacao", tela: "conciliacao", label: "Bancos e conciliação", curto: "Bancos", icon: Landmark, busca: "extrato ofx caixa saldo" },
      { to: "/auditoria", tela: "auditoria", label: "Auditoria financeira", curto: "Auditoria", icon: ShieldAlert, busca: "checklist exceções histórico alterações" },
    ],
  },
  {
    titulo: "Pós-venda",
    itens: [
      { to: "/assistencia", tela: "assistencia", label: "Assistência técnica", curto: "OS", icon: Wrench, busca: "os ordem de serviço conserto técnico" },
      { to: "/garantias", tela: "garantias", label: "Garantias e manutenção", curto: "Garantias", icon: ShieldCheck, busca: "preventiva equipamento" },
    ],
  },
  {
    titulo: "Produção e estoque",
    itens: [
      { to: "/producao", tela: "producao", label: "Produção e compras", curto: "Produção", icon: Factory, busca: "ordem de produção pedido de compra fábrica ficha técnica" },
      { to: "/transferencias", tela: "estoque", label: "Transferências SC ↔ SP", curto: "Transf.", icon: ArrowLeftRight, busca: "matriz filial" },
    ],
  },
  {
    titulo: "Análises",
    itens: [
      { to: "/gerencial", tela: "relatorios", label: "Painel gerencial", curto: "Gerencial", icon: Gauge, busca: "decisão curva abc clientes inativos parados tendência gargalos comparativo ano anterior" },
      { to: "/relatorios", tela: "relatorios", label: "Relatórios", curto: "Relatórios", icon: BarChart3, busca: "faturamento dre fluxo de caixa" },
      { to: "/margem", tela: "margem", label: "Margem de contribuição", curto: "Margem", icon: PieChart, busca: "lucro custo rentabilidade" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { to: "/documentos", tela: "documentos", label: "Documentos", curto: "Docs", icon: Paperclip, busca: "anexos arquivos" },
      { to: "/usuarios", tela: "usuarios", label: "Usuários", curto: "Usuários", icon: UserCog, busca: "acesso senha permissões papel" },
      { to: "/configuracoes", tela: "configuracoes", label: "Configurações", curto: "Ajustes", icon: Settings, busca: "empresa unidades focus tiny importar integração" },
    ],
  },
];

/** Acesso rápido: os botões coloridos no alto do menu (as telas mais usadas no dia a dia). */
const RAPIDOS: { to: string; label: string; cor: string }[] = [
  { to: "/pedidos", label: "Vendas", cor: "from-[#10b981] to-[#059669]" },
  { to: "/notas", label: "Notas fiscais", cor: "from-[#0ea5e9] to-[#2563eb]" },
  { to: "/financeiro", label: "Financeiro", cor: "from-[#f59e0b] to-[#ea580c]" },
  { to: "/clientes", label: "Clientes", cor: "from-[#a855f7] to-[#6d28d9]" },
  { to: "/estoque", label: "Produtos", cor: "from-[#f97316] to-[#dc2626]" },
  { to: "/assistencia", label: "Assistência", cor: "from-[#14b8a6] to-[#0e7490]" },
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
  financeiro: ["/", "/financeiro", "/producao", "/notas"],
  tecnico: ["/", "/assistencia", "/garantias", "/producao"],
  contador: ["/contador", "/notas", "/financeiro", "/documentos"],
};
const todosItens = grupos.flatMap((g) => g.itens);

/** Botões coloridos do acesso rápido (3 por linha). */
function AcessoRapido({ podeVer, onIr }: { podeVer: (t: Tela) => boolean; onIr: () => void }) {
  const itens = RAPIDOS.map((r) => ({ ...r, item: todosItens.find((i) => i.to === r.to)! })).filter((r) => r.item && podeVer(r.item.tela));
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

function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <div className={`flex shrink-0 items-center ${compacta ? "gap-2" : "gap-3"}`}>
      <img src={logo} alt="" className={`${compacta ? "h-9 w-9" : "h-10 w-10"} rounded-xl ring-1 ring-white/10`} />
      <span className="whitespace-nowrap leading-tight">
        <span className="block text-lg font-extrabold tracking-tight text-white">ERP <span className="text-brand-ice">Line</span></span>
        <span className={`${compacta ? "hidden min-[420px]:block" : "block"} text-[11px] font-semibold uppercase tracking-[0.16em] text-nav-fraco`}>MF Máquinas</span>
      </span>
    </div>
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

  const atalhos = (ATALHOS[perfil.papel] ?? ATALHOS.admin)
    .map((to) => todosItens.find((i) => i.to === to)!)
    .filter((i) => i && perfil.podeVer(i.tela));

  return (
    <NotificacoesProvider>
    <div className="min-h-screen md:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-ink-line bg-ink px-4 py-2.5 md:hidden">
        <Marca compacta />
        <div className="ml-auto flex items-center gap-1"><SeletorUnidade compacto /><Sino /></div>
        <button onClick={() => setAberto(!aberto)} aria-label={aberto ? "Fechar menu" : "Abrir menu"} className="rounded-lg p-2 text-white hover:bg-white/10">
          {aberto ? <X /> : <Menu />}
        </button>
      </header>

      <aside className={`${aberto ? "fixed inset-x-0 bottom-0 top-[61px] z-30 flex flex-col pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0" : "hidden"} bg-ink text-nav-texto md:sticky md:top-0 md:flex md:h-screen md:w-72 md:shrink-0 md:flex-col md:border-r md:border-ink-line`}>
        <div className="hidden px-5 pb-4 pt-6 md:block [@media(min-width:768px)_and_(max-height:860px)]:pb-3 [@media(min-width:768px)_and_(max-height:860px)]:pt-4"><div className="flex items-center justify-between gap-2"><Marca /><Sino /></div><div className="mt-4"><SeletorUnidade /></div></div>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <AcessoRapido podeVer={perfil.podeVer} onIr={() => setAberto(false)} />
        <form className="px-3 pb-2 pt-2 md:pt-0" role="search" onSubmit={(e) => {
          e.preventDefault();
          const primeiro = todosItens.find((m) => perfil.podeVer(m.tela) && combina(m, busca));
          if (primeiro) navigate(primeiro.to);
        }}>
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-nav-fraco" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setBusca("")}
              placeholder="Buscar no menu" aria-label="Buscar no menu"
              className="w-full rounded-lg border border-ink-line bg-ink-soft py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-nav-fraco focus:border-brand-ice focus:outline-none" />
          </label>
        </form>
        <nav ref={navRef} onScroll={medirNav} className="flex-1 overflow-y-auto px-3 pb-4">
          {busca.trim() && !todosItens.some((m) => perfil.podeVer(m.tela) && combina(m, busca)) && (
            <p className="px-3 py-2 text-sm text-nav-fraco">Nada com "{busca.trim()}".</p>
          )}
          {grupos.map((g, gi) => {
            const itens = g.itens.filter((m) => perfil.podeVer(m.tela) && (!busca.trim() || combina(m, busca)));
            if (!itens.length) return null;
            return (
              <div key={gi} className="mt-4 first:mt-0 [@media(min-width:768px)_and_(max-height:860px)]:mt-2.5">
                {g.titulo && <div className="px-3 pb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-nav-titulo [@media(min-width:768px)_and_(max-height:860px)]:pb-1 [@media(min-width:768px)_and_(max-height:860px)]:text-[11px]">{g.titulo}</div>}
                {itens.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    onClick={() => setAberto(false)}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition [@media(min-width:768px)_and_(max-height:860px)]:py-[7px] [@media(min-width:768px)_and_(max-height:860px)]:text-sm ${
                        isActive ? "bg-ink-soft text-white" : "hover:bg-ink-soft/70 hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-brand-ice" aria-hidden />}
                        <Icon size={19} className={isActive ? "text-brand-ice" : "text-nav-fraco group-hover:text-nav-texto"} />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
          {maisAbaixo && (
            <button type="button" onClick={() => navRef.current?.scrollBy({ top: 240, behavior: "smooth" })} aria-label="Ver mais itens do menu"
              className="absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-ink via-ink/90 to-transparent pb-1 text-xs font-semibold text-nav-fraco hover:text-white">
              <span className="flex items-center gap-1"><ChevronDown size={14} /> mais opções</span>
            </button>
          )}
        </div>
        <div className="border-t border-ink-line p-3">
          <div className="flex items-center gap-2 px-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-soft text-sm font-bold text-brand-ice">{iniciais}</span>
            <span className="min-w-0 flex-1 leading-tight" title={perfil.nome}>
              <span className="block truncate text-sm font-semibold text-white">{perfil.nome}</span>
              <span className="block truncate text-xs text-nav-fraco">{PAPEIS.find((p) => p.value === perfil.papel)?.label}</span>
            </span>
            {([
              ["Meus avisos", Bell, () => setMeusAvisos(true)],
              ["Aparência", Palette, () => setAparencia(true)],
              ["Trocar senha", KeyRound, () => setTrocarSenha(true)],
              ["Sair", LogOut, () => supabase.auth.signOut()],
            ] as const).map(([rotulo, Icone, acao]) => (
              <button key={rotulo} onClick={acao} title={rotulo} aria-label={rotulo}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-nav-fraco hover:bg-ink-soft hover:text-white">
                <Icone size={17} />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-7xl">
          {DEMO && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 sm:mb-5 sm:px-4 sm:py-2.5 sm:text-sm">
              <b>Prévia com dados de exemplo.</b><span className="hidden sm:inline"> Pode clicar à vontade: nada é salvo e as notas fiscais são simuladas.
              Use <b>Sair</b> para trocar de perfil.</span><span className="sm:hidden"> Nada é salvo.</span>
            </div>
          )}
          <Outlet />
        </div>
      </main>

      {/* Celular: atalhos fixos embaixo, ao alcance do polegar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-ink-line bg-ink/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${atalhos.length + 1}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {atalhos.map(({ to, curto, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={() => setAberto(false)}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isActive ? "text-brand-ice" : "text-nav-fraco"}`}>
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
