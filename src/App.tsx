import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { PerfilProvider, type Perfil } from "@/lib/auth";
import { UnidadeProvider } from "@/lib/unidade";
import { aplicarPreferencias } from "@/lib/tema";
import { podeVer, type Tela } from "@/lib/permissoes";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/Toaster";
import { Button, Card } from "@/components/ui";
import Login from "@/pages/Login";

// Cada tela é carregada sob demanda (site mais leve no primeiro acesso).
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Pedidos = lazy(() => import("@/pages/Pedidos"));
const Assistencia = lazy(() => import("@/pages/Assistencia"));
const Produtos = lazy(() => import("@/pages/Produtos"));
const Financeiro = lazy(() => import("@/pages/Financeiro"));
const NotasFiscais = lazy(() => import("@/pages/NotasFiscais"));
const Clientes = lazy(() => import("@/pages/Clientes"));
const Fornecedores = lazy(() => import("@/pages/Fornecedores"));
const Configuracoes = lazy(() => import("@/pages/Configuracoes"));
const Usuarios = lazy(() => import("@/pages/Usuarios"));
const Garantias = lazy(() => import("@/pages/Garantias"));
const Relatorios = lazy(() => import("@/pages/Relatorios"));
const Gerencial = lazy(() => import("@/pages/Gerencial"));
const Producao = lazy(() => import("@/pages/Producao"));
const Loja = lazy(() => import("@/pages/Loja"));
const Transferencias = lazy(() => import("@/pages/Transferencias"));
const Email = lazy(() => import("@/pages/Email"));
const Comissoes = lazy(() => import("@/pages/Comissoes"));
const Fluxo = lazy(() => import("@/pages/Fluxo"));
const Margem = lazy(() => import("@/pages/Margem"));
const Contador = lazy(() => import("@/pages/Contador"));
const Documentos = lazy(() => import("@/pages/Documentos"));
const Conciliacao = lazy(() => import("@/pages/Conciliacao"));
const Auditoria = lazy(() => import("@/pages/Auditoria"));
const Fretes = lazy(() => import("@/pages/Fretes"));
const FormasPagamento = lazy(() => import("@/pages/FormasPagamento"));
const Embalagens = lazy(() => import("@/pages/Embalagens"));
const PropostaPublica = lazy(() => import("@/pages/PropostaPublica"));
const AreaCliente = lazy(() => import("@/pages/AreaCliente"));

const ROTAS: { path: string; tela: Tela; element: ReactNode }[] = [
  { path: "pedidos", tela: "pedidos", element: <Pedidos /> },
  { path: "assistencia", tela: "assistencia", element: <Assistencia /> },
  { path: "estoque", tela: "estoque", element: <Produtos /> },
  { path: "financeiro", tela: "financeiro", element: <Financeiro /> },
  { path: "notas", tela: "notas", element: <NotasFiscais /> },
  { path: "clientes", tela: "clientes", element: <Clientes /> },
  { path: "fornecedores", tela: "fornecedores", element: <Fornecedores tipo="fornecedores" /> },
  { path: "transportadoras", tela: "fornecedores", element: <Fornecedores tipo="transportadoras" /> },
  { path: "configuracoes", tela: "configuracoes", element: <Configuracoes /> },
  { path: "usuarios", tela: "usuarios", element: <Usuarios /> },
  { path: "garantias", tela: "garantias", element: <Garantias /> },
  { path: "relatorios", tela: "relatorios", element: <Relatorios /> },
  { path: "gerencial", tela: "relatorios", element: <Gerencial /> },
  { path: "producao", tela: "producao", element: <Producao /> },
  { path: "transferencias", tela: "estoque", element: <Transferencias /> },
  { path: "email", tela: "email", element: <Email /> },
  { path: "comissoes", tela: "comissoes", element: <Comissoes /> },
  { path: "fluxo", tela: "fluxo", element: <Fluxo /> },
  { path: "margem", tela: "margem", element: <Margem /> },
  { path: "contador", tela: "contador", element: <Contador /> },
  { path: "documentos", tela: "documentos", element: <Documentos /> },
  { path: "conciliacao", tela: "conciliacao", element: <Conciliacao /> },
  { path: "auditoria", tela: "auditoria", element: <Auditoria /> },
  { path: "fretes", tela: "fretes", element: <Fretes /> },
  { path: "formas-pagamento", tela: "financeiro", element: <FormasPagamento /> },
  { path: "embalagens", tela: "fretes", element: <Embalagens /> },
];

const Carregando = () => <div className="p-8 text-slate-500">Carregando…</div>;

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    queryClient.clear(); // dados de outro usuário não podem aparecer
    if (!userId) return setPerfil(session === null ? null : undefined);
    setPerfil(undefined);
    const carregar = () => supabase.from("usuarios_erp").select("user_id, nome, papel, ativo, unidade_id, preferencias").eq("user_id", userId).maybeSingle();
    carregar().then(async ({ data }) => {
      if (!data) {
        // Primeiro acesso de um sistema novo: o primeiro usuário vira administrador.
        const nome = (session?.user.user_metadata?.nome as string) ?? "";
        const { data: virouAdmin } = await supabase.rpc("reivindicar_primeiro_admin", { p_nome: nome });
        if (virouAdmin) ({ data } = await carregar());
      }
      if (data?.ativo) aplicarPreferencias((data as any).preferencias);
      setPerfil(data?.ativo ? { ...data, email: session?.user.email ?? "" } as Perfil : null);
    });
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vitrine pública: abre sem login (é o link dos produtos no catálogo do WhatsApp)
  // Proposta comercial: o cliente abre pelo link, sem login
  if (pathname.startsWith("/proposta/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><PropostaPublica /></Suspense></>;
  }
  // Página do cliente (contas em aberto, Pix e segunda via): link da régua de cobrança, sem login
  if (pathname.startsWith("/cliente/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><AreaCliente /></Suspense></>;
  }
  if (pathname === "/loja" || pathname.startsWith("/loja/")) {
    return <><Toaster /><Suspense fallback={<Carregando />}><Loja /></Suspense></>;
  }

  if (session === undefined || (session && perfil === undefined)) return <Carregando />;

  return (
    <>
      <Toaster />
      {!session ? (
        <Login />
      ) : !perfil ? (
        <SemAcesso email={session.user.email ?? ""} />
      ) : (
        <PerfilProvider perfil={perfil}>
          <UnidadeProvider inicial={perfil.unidade_id ?? null}>
          <Suspense fallback={<Carregando />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={perfil.papel === "contador" ? <Navigate to="/contador" replace /> : <Dashboard />} />
                {ROTAS.filter((r) => podeVer(perfil.papel, r.tela)).map((r) => (
                  <Route key={r.path} path={r.path} element={r.element} />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
          </UnidadeProvider>
        </PerfilProvider>
      )}
    </>
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
