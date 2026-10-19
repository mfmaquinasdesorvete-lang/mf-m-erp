import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { PerfilProvider, usePerfil, type Perfil } from "@/lib/auth";
import { todosItens, useVisivel } from "@/lib/menu";
import { UnidadeProvider } from "@/lib/unidade";
import { aplicarPreferencias } from "@/lib/tema";
import { ehRepresentante, podeVer, type Tela } from "@/lib/permissoes";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/Toaster";
import { Button, Card } from "@/components/ui";
import Login, { NovaSenha } from "@/pages/Login";
import { abrirNoApp, CHAVE_APP } from "@/lib/appFinanceiro";

// Cada tela é carregada sob demanda (site mais leve no primeiro acesso).
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Pedidos = lazy(() => import("@/pages/Pedidos"));
const PainelVendas = lazy(() => import("@/pages/paineis/PainelVendas"));
const PainelFinanceiroArea = lazy(() => import("@/pages/paineis/PainelFinanceiroArea"));
const PainelNotas = lazy(() => import("@/pages/paineis/PainelNotas"));
const PainelPosVenda = lazy(() => import("@/pages/paineis/PainelPosVenda"));
const PainelProducao = lazy(() => import("@/pages/paineis/PainelProducao"));
const PainelCadastros = lazy(() => import("@/pages/paineis/PainelCadastros"));
const PainelMaquinas = lazy(() => import("@/pages/paineis/PainelMaquinas"));
const PainelProdutos = lazy(() => import("@/pages/paineis/PainelProdutos"));
const Pdv = lazy(() => import("@/pages/Pdv"));
const CotacaoPublica = lazy(() => import("@/pages/CotacaoPublica"));
const Assistencia = lazy(() => import("@/pages/Assistencia"));
const Produtos = lazy(() => import("@/pages/Produtos"));
const Financeiro = lazy(() => import("@/pages/Financeiro"));
const Aprovacoes = lazy(() => import("@/pages/Aprovacoes"));
const NotasFiscais = lazy(() => import("@/pages/NotasFiscais"));
const Clientes = lazy(() => import("@/pages/Clientes"));
const Fornecedores = lazy(() => import("@/pages/Fornecedores"));
const Transportadoras = lazy(() => import("@/pages/Transportadoras"));
const Configuracoes = lazy(() => import("@/pages/Configuracoes"));
const Usuarios = lazy(() => import("@/pages/Usuarios"));
const Implantacao = lazy(() => import("@/pages/Implantacao"));
const Importar = lazy(() => import("@/pages/Importar"));
const Garantias = lazy(() => import("@/pages/Garantias"));
const Relatorios = lazy(() => import("@/pages/Relatorios"));
const Gerencial = lazy(() => import("@/pages/Gerencial"));
const Producao = lazy(() => import("@/pages/Producao"));
const TesteGiga = lazy(() => import("@/pages/TesteGiga"));
const Loja = lazy(() => import("@/pages/Loja"));
const Transferencias = lazy(() => import("@/pages/Transferencias"));
const Email = lazy(() => import("@/pages/Email"));
const Comissoes = lazy(() => import("@/pages/Comissoes"));
const Metas = lazy(() => import("@/pages/Metas"));
const Fluxo = lazy(() => import("@/pages/Fluxo"));
const PainelExpedicao = lazy(() => import("@/pages/paineis/PainelExpedicao"));
const Margem = lazy(() => import("@/pages/Margem"));
const Contador = lazy(() => import("@/pages/Contador"));
const AnalistaFiscal = lazy(() => import("@/pages/AnalistaFiscal"));
const Parcelamentos = lazy(() => import("@/pages/Parcelamentos"));
const ImpostosPagos = lazy(() => import("@/pages/ImpostosPagos"));
const Funcionarios = lazy(() => import("@/pages/Funcionarios"));
const Documentos = lazy(() => import("@/pages/Documentos"));
const Conciliacao = lazy(() => import("@/pages/Conciliacao"));
const GastosSeparados = lazy(() => import("@/pages/GastosSeparados"));
const PartesRelacionadas = lazy(() => import("@/pages/PartesRelacionadas"));
const MercadoLivre = lazy(() => import("@/pages/MercadoLivre"));
const Auditoria = lazy(() => import("@/pages/Auditoria"));
const Fretes = lazy(() => import("@/pages/Fretes"));
const FormasPagamento = lazy(() => import("@/pages/FormasPagamento"));
const Embalagens = lazy(() => import("@/pages/Embalagens"));
const PropostaPublica = lazy(() => import("@/pages/PropostaPublica"));
const AreaCliente = lazy(() => import("@/pages/AreaCliente"));
const FichaPublica = lazy(() => import("@/pages/FichaPublica"));
const Conheca = lazy(() => import("@/pages/Conheca"));
const Tecnicos = lazy(() => import("@/pages/Tecnicos"));
const MaquinaPublica = lazy(() => import("@/pages/MaquinaPublica"));
const Portal = lazy(() => import("@/pages/Portal"));
const Sobre = lazy(() => import("@/pages/Sobre"));
const Pessoal = lazy(() => import("@/pages/Pessoal"));
const Licenciados = lazy(() => import("@/pages/Licenciados"));
const PainelLicencas = lazy(() => import("@/pages/paineis/PainelLicencas"));
const Scrum = lazy(() => import("@/pages/Scrum"));
const AppFinanceiro = lazy(() => import("@/pages/AppFinanceiro"));

const ROTAS: { path: string; tela: Tela; element: ReactNode }[] = [
  { path: "scrum", tela: "scrum", element: <Scrum /> },
  { path: "pedidos", tela: "pedidos", element: <Pedidos /> },
  { path: "vendas-maquinas", tela: "pedidos", element: <Pedidos area="maquinas" /> },
  { path: "mercado-livre", tela: "mercadolivre", element: <MercadoLivre /> },
  // volta do "Conectar" do Mercado Livre (o endereço cadastrado no app de lá)
  { path: "mercado-livre/retorno", tela: "mercadolivre", element: <MercadoLivre /> },
  { path: "painel/vendas", tela: "pedidos", element: <PainelVendas /> },
  { path: "painel/financeiro", tela: "financeiro", element: <PainelFinanceiroArea /> },
  { path: "painel/notas", tela: "notas", element: <PainelNotas /> },
  { path: "painel/posvenda", tela: "assistencia", element: <PainelPosVenda /> },
  { path: "painel/producao", tela: "producao", element: <PainelProducao /> },
  { path: "painel/cadastros", tela: "clientes", element: <PainelCadastros /> },
  { path: "painel/maquinas", tela: "estoque", element: <PainelMaquinas /> },
  { path: "painel/produtos", tela: "estoque", element: <PainelProdutos /> },
  { path: "assistencia", tela: "assistencia", element: <Assistencia /> },
  { path: "estoque", tela: "estoque", element: <Produtos /> },
  { path: "produtos/maquinas", tela: "estoque", element: <Produtos key="maquinas" cadastroFixo="maquinas" /> },
  { path: "produtos/pecas", tela: "estoque", element: <Produtos key="pecas" cadastroFixo="pecas" /> },
  { path: "produtos/componentes", tela: "estoque", element: <Produtos key="componentes" cadastroFixo="componentes" /> },
  { path: "produtos/servicos", tela: "estoque", element: <Produtos key="servicos" cadastroFixo="servicos" /> },
  // registro de qualidade REG-006 (teste das máquinas na bancada)
  { path: "teste-giga", tela: "testegiga", element: <TesteGiga /> },
  { path: "tecnicos", tela: "assistencia", element: <Tecnicos /> },
  { path: "financeiro", tela: "financeiro", element: <Financeiro /> },
  { path: "aprovacoes", tela: "financeiro", element: <Aprovacoes /> },
  { path: "notas", tela: "notas", element: <NotasFiscais /> },
  { path: "clientes", tela: "clientes", element: <Clientes /> },
  { path: "fornecedores", tela: "fornecedores", element: <Fornecedores tipo="fornecedores" /> },
  { path: "transportadoras", tela: "fornecedores", element: <Transportadoras /> },
  { path: "configuracoes", tela: "configuracoes", element: <Configuracoes /> },
  // extrato automático: quem cuida dos bancos também abre (o financeiro não abre as outras configurações)
  { path: "configuracoes/bancos", tela: "conciliacao", element: <Configuracoes secaoFixa="bancos" /> },
  // régua de cobrança e WhatsApp oficial: quem cobra (financeiro e vendas) também abre
  { path: "configuracoes/cobranca", tela: "financeiro", element: <Configuracoes secaoFixa="cobranca" /> },
  { path: "configuracoes/:secao", tela: "configuracoes", element: <Configuracoes /> },
  { path: "usuarios", tela: "usuarios", element: <Usuarios /> },
  { path: "implantacao", tela: "implantacao", element: <Implantacao /> },
  { path: "importar", tela: "importar", element: <Importar /> },
  { path: "garantias", tela: "garantias", element: <Garantias /> },
  { path: "relatorios", tela: "relatorios", element: <Relatorios /> },
  { path: "gerencial", tela: "relatorios", element: <Gerencial /> },
  { path: "producao", tela: "producao", element: <Producao key="producao" area="producao" /> },
  { path: "compras", tela: "producao", element: <Producao key="compras" area="compras" /> },
  { path: "transferencias", tela: "estoque", element: <Transferencias /> },
  { path: "email", tela: "email", element: <Email /> },
  { path: "comissoes", tela: "comissoes", element: <Comissoes /> },
  { path: "metas", tela: "metas", element: <Metas /> },
  { path: "fluxo", tela: "fluxo", element: <Fluxo /> },
  { path: "expedicao", tela: "expedicao", element: <PainelExpedicao /> },
  { path: "margem", tela: "margem", element: <Margem /> },
  { path: "contador", tela: "contador", element: <Contador /> },
  { path: "analista-fiscal", tela: "contador", element: <AnalistaFiscal /> },
  { path: "parcelamentos", tela: "contador", element: <Parcelamentos /> },
  { path: "funcionarios", tela: "funcionarios", element: <Funcionarios /> },
  { path: "documentos", tela: "documentos", element: <Documentos /> },
  { path: "conciliacao", tela: "conciliacao", element: <Conciliacao /> },
  { path: "gastos", tela: "financeiro", element: <GastosSeparados /> },
  { path: "impostos-pagos", tela: "financeiro", element: <ImpostosPagos /> },
  // endereços antigos (links salvos e avisos): abrem a aba certa de Gastos separados
  { path: "combustivel", tela: "financeiro", element: <ParaGastos /> },
  { path: "compras-marketplace", tela: "financeiro", element: <ParaGastos aba="marketplaces" /> },
  { path: "impostos-tarifas", tela: "financeiro", element: <ParaGastos aba="impostos" manter /> },
  { path: "partes-relacionadas", tela: "financeiro", element: <PartesRelacionadas /> },
  { path: "auditoria", tela: "auditoria", element: <Auditoria /> },
  { path: "fretes", tela: "fretes", element: <Fretes /> },
  { path: "formas-pagamento", tela: "financeiro", element: <FormasPagamento /> },
  { path: "embalagens", tela: "fretes", element: <Embalagens /> },
];

const Carregando = () => <div className="p-8 text-slate-500">Carregando…</div>;

/** Endereço antigo de combustível, marketplaces ou impostos: vai para a aba de Gastos separados (`manter`: a aba do endereço vale lá). */
function ParaGastos({ aba, manter }: { aba?: string; manter?: boolean }) {
  const q = new URLSearchParams(useLocation().search);
  if (!(manter && q.get("aba"))) { if (aba) q.set("aba", aba); else q.delete("aba"); }
  const busca = q.toString();
  return <Navigate to={`/gastos${busca ? `?${busca}` : ""}`} replace />;
}

// Volta do link "Esqueci minha senha" (lido antes de o Supabase limpar o endereço)
const LINK_RECUPERACAO = typeof window !== "undefined" && (/[?&]nova-senha=1/.test(window.location.search) || /type=recovery/.test(window.location.hash));
const LINK_EXPIRADO = typeof window !== "undefined" && /error_code=otp_expired|error=access_denied/.test(window.location.hash + window.location.search);

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const [novaSenha, setNovaSenha] = useState(LINK_RECUPERACAO && !LINK_EXPIRADO);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      if (evento === "PASSWORD_RECOVERY" && !window.location.pathname.startsWith("/loja")) setNovaSenha(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    queryClient.clear(); // dados de outro usuário não podem aparecer
    if (!userId) return setPerfil(session === null ? null : undefined);
    setPerfil(undefined);
    setErroPerfil(null);
    const carregar = () => supabase.from("usuarios_erp").select("user_id, nome, papel, papeis_extras, trocar_senha, ativo, unidade_id, preferencias").eq("user_id", userId).maybeSingle();
    carregar().then(async ({ data, error }) => {
      // sem internet ou servidor fora do ar: não é falta de acesso, é só tentar de novo
      if (error) return setErroPerfil(error.message);
      if (!data) {
        // Primeiro acesso de um sistema novo: o primeiro usuário vira administrador.
        const nome = (session?.user.user_metadata?.nome as string) ?? "";
        const { data: virouAdmin } = await supabase.rpc("reivindicar_primeiro_admin", { p_nome: nome });
        if (virouAdmin) ({ data } = await carregar());
      }
      if (data?.ativo) aplicarPreferencias((data as any).preferencias);
      setPerfil(data?.ativo ? { ...data, email: session?.user.email ?? "" } as Perfil : null);
    });
  }, [userId, tentativa]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vitrine pública: abre sem login (é o link dos produtos no catálogo do WhatsApp)
  // Apresentação do ERP Line para empresas e contadores (venda por indicação), sem login
  if (pathname === "/conheca") {
    return <Suspense fallback={<Carregando />}><Conheca /></Suspense>;
  }
  // Proposta comercial: o cliente abre pelo link, sem login
  if (pathname.startsWith("/proposta/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><PropostaPublica /></Suspense></>;
  }
  // Página do cliente (contas em aberto, Pix e segunda via): link da régua de cobrança, sem login
  if (pathname.startsWith("/cliente/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><AreaCliente /></Suspense></>;
  }
  // Pedido de cotação: o fornecedor informa os preços pelo link, sem login
  if (pathname.startsWith("/cotacao/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><CotacaoPublica /></Suspense></>;
  }
  // Ficha cadastral: o cliente confere, corrige e assina pelo link, sem login
  if (pathname.startsWith("/ficha/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><FichaPublica /></Suspense></>;
  }
  // Máquina do cliente: manuais, dicas, garantia e o botão da assistência, pelo link mandado no WhatsApp, sem login
  if (pathname.startsWith("/maquina/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><MaquinaPublica /></Suspense></>;
  }
  if (pathname === "/loja" || pathname.startsWith("/loja/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><Loja /></Suspense></>;
  }

  if (session === undefined) return <Carregando />;
  if (novaSenha && session) return <><Toaster /><NovaSenha onPronto={() => setNovaSenha(false)} /></>;
  if (session && erroPerfil) return <SemConexao detalhe={erroPerfil} onTentar={() => setTentativa((t) => t + 1)} />;
  if (session && perfil === undefined) return <Carregando />;
  // senha provisória (usuário novo ou senha redefinida pelo administrador): troca antes de entrar
  if (session && perfil?.trocar_senha) return <><Toaster /><NovaSenha obrigatoria onPronto={() => setPerfil({ ...perfil, trocar_senha: false })} /></>;

  return (
    <>
      <Toaster />
      {!session ? (
        <Login linkExpirado={LINK_EXPIRADO} />
      ) : !perfil ? (
        <SemAcesso email={session.user.email ?? ""} />
      ) : ehRepresentante(perfil.papel) ? (
        // representante externo: só o portal (/portal), sem o menu e sem as telas do ERP
        <PerfilProvider perfil={perfil}>
          <Suspense fallback={<Carregando />}>
            <Routes>
              <Route path="portal/*" element={<Portal />} />
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </Routes>
          </Suspense>
        </PerfilProvider>
      ) : (
        <PerfilProvider perfil={perfil}>
          <UnidadeProvider inicial={perfil.unidade_id ?? null}>
          <Suspense fallback={<Carregando />}>
            <RotasERP />
          </Suspense>
          </UnidadeProvider>
        </PerfilProvider>
      )}
    </>
  );
}

/**
 * Rotas do ERP para quem entrou: só as telas que o papel acessa e que não foram escondidas para ele em Usuários → Perfis.
 * O início é o painel; contador vai para o fechamento e a expedição para a separação (ou a primeira tela que a pessoa vê).
 */
// Tela que abre ao entrar, pela função principal (só na entrada: depois "Início" leva ao painel geral)
const INICIO_DO_PAPEL: Partial<Record<string, { to: string; tela: Tela }>> = {
  vendas: { to: "/painel/vendas", tela: "pedidos" },
  financeiro: { to: "/painel/financeiro", tela: "financeiro" },
  tecnico: { to: "/painel/posvenda", tela: "assistencia" },
  compras: { to: "/compras", tela: "producao" },
};
let inicioFeitoPara: string | null = null; // quem já foi levado à tela inicial nesta aba

function RotasERP() {
  const { papel, user_id } = usePerfil();
  const vis = useVisivel();
  const location = useLocation();
  const navigate = useNavigate();
  const inicio = papel === "contador" && vis.ve("contador", "/contador") ? "/contador"
    : papel === "expedicao" && vis.ve("expedicao", "/expedicao") ? "/expedicao"
    : papel === "marketplace" && vis.ve("estoque", "/estoque") ? "/estoque"
    : vis.ve("painel", "/") ? null
    // "Início" escondido no perfil: abre o painel da área (financeiro → Painel do financeiro), senão a primeira tela que a pessoa vê
    : INICIO_DO_PAPEL[papel] && vis.ve(INICIO_DO_PAPEL[papel]!.tela, INICIO_DO_PAPEL[papel]!.to) ? INICIO_DO_PAPEL[papel]!.to
    : todosItens.find((i) => i.to !== "/" && vis.item(i))?.to ?? null;
  // só em desenvolvimento: as varreduras de tela (Playwright) navegam por aqui, sem recarregar a demonstração
  useEffect(() => { if (import.meta.env.DEV) (window as any).__ir = navigate; });
  useEffect(() => {
    if (inicioFeitoPara === user_id) return;
    inicioFeitoPara = user_id;
    // no celular, quem cuida do financeiro abre direto no app (saldos e aprovar); a escolha fica no aparelho
    let escolha: string | null = null;
    try { escolha = localStorage.getItem(CHAVE_APP); } catch { /* sem armazenamento */ }
    if (location.pathname === "/" && vis.ve("financeiro", "/financeiro") && abrirNoApp(escolha, window.innerWidth, papel === "financeiro"))
    { navigate("/app", { replace: true }); return; }
    const casa = INICIO_DO_PAPEL[papel];
    if (casa && location.pathname === "/" && vis.ve(casa.tela, casa.to)) navigate(casa.to, { replace: true });
  }, [user_id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Routes>
      {/* PDV em tela própria (erp.myfrost.ai/pdv), sem o menu do ERP */}
      {vis.ve("pedidos", "/pdv") && <Route path="pdv" element={<Pdv />} />}
      {/* app do financeiro no celular (saldos e aprovar), sem o menu do ERP */}
      {vis.ve("financeiro", "/financeiro") && <Route path="app" element={<AppFinanceiro />} />}
      <Route element={<Layout />}>
        <Route index element={inicio ? <Navigate to={inicio} replace /> : <Dashboard />} />
        {ROTAS.filter((r) => vis.ve(r.tela, `/${r.path}`)).map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
        {/* Sobre o ERP Line (módulos e atualizações): todos que entram no ERP abrem, pela versão no fim do menu */}
        <Route path="sobre" element={<Sobre />} />
        {/* painel pessoal do dono: só o administrador abre (e o banco só mostra as linhas de quem criou) */}
        {papel === "admin" && <Route path="pessoal" element={<Pessoal />} />}
        {/* carteira dos licenciados My Frost Sorveterias: também só o administrador (e só o dono lê as linhas) */}
        {papel === "admin" && <Route path="licenciados" element={<Licenciados />} />}
        {papel === "admin" && <Route path="painel/licencas" element={<PainelLicencas />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function SemConexao({ detalhe, onTentar }: { detalhe: string; onTentar: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink bg-[radial-gradient(ellipse_at_top,_rgb(var(--brand-nav)/0.22)_0%,_#071528_60%)] p-4">
      <Card className="max-w-sm p-6 text-center">
        <h1 className="mb-2 text-lg font-semibold" role="alert">Sem conexão com o ERP</h1>
        <p className="mb-2 text-sm text-slate-600">Não foi possível falar com o servidor. Confira a internet e tente de novo.</p>
        <p className="mb-5 break-words text-xs text-slate-400">{detalhe}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={onTentar}>Tentar de novo</Button>
          <Button variant="secondary" onClick={() => supabase.auth.signOut()}>Sair</Button>
        </div>
      </Card>
    </div>
  );
}

function SemAcesso({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink bg-[radial-gradient(ellipse_at_top,_rgb(var(--brand-nav)/0.22)_0%,_#071528_60%)] p-4">
      <Card className="max-w-sm p-6 text-center">
        <h1 className="mb-2 text-lg font-semibold">Acesso não liberado</h1>
        <p className="mb-5 text-sm text-slate-600">
          O usuário <b>{email}</b> não está ativo no ERP. Peça ao administrador para liberar o seu acesso.
        </p>
        <Button variant="secondary" onClick={() => supabase.auth.signOut()}>Sair</Button>
      </Card>
    </div>
  );
}
