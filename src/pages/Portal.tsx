// Portal do representante (/portal): tela própria, simples e feita para o celular.
// O representante é externo: não vê o menu nem as telas do ERP. Tudo vem das funções portal_* do banco,
// que mostram só o que é dele (vendedor ligado ao login).
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ClipboardList, HandCoins, KeyRound, LayoutDashboard, LogOut, Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import type { AcessoPortal } from "@/lib/portal";
import logo from "@/assets/logo.webp";
import { Button, Card } from "@/components/ui";
import { AlterarSenha } from "@/components/Layout";
import { usePortal } from "@/components/portal/dados";
import { PortalResumo } from "@/components/portal/PortalResumo";
import { PortalPedido, PortalPedidos } from "@/components/portal/PortalPedidos";
import { PortalOrcamento } from "@/components/portal/PortalOrcamento";
import { PortalComissoes } from "@/components/portal/PortalComissoes";
import { PortalClientes } from "@/components/portal/PortalClientes";

const MENU = [
  { to: "/portal", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/portal/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/portal/novo", label: "Orçamento", icon: Plus, destaque: true },
  { to: "/portal/comissoes", label: "Comissões", icon: HandCoins },
  { to: "/portal/clientes", label: "Clientes", icon: Users },
];

export default function Portal() {
  const perfil = usePerfil();
  const { data: acesso, isLoading, error, refetch } = usePortal<AcessoPortal>("portal_acesso");
  const [senha, setSenha] = useState(false);
  // cor de destaque do portal: a das vendas
  useEffect(() => { document.documentElement.dataset.modulo = "vendas"; }, []);

  const nome = acesso?.vinculado ? acesso.nome : perfil.nome;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-line bg-ink">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
          <Link to="/portal" className="flex min-w-0 items-center gap-2.5" aria-label="Portal do representante: início">
            <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-white/10" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold text-white">Portal do representante</span>
              <span className="block truncate text-xs text-nav-fraco">{nome} · MF Máquinas</span>
            </span>
          </Link>
          <span className="ml-auto flex shrink-0 gap-1">
            <button type="button" onClick={() => setSenha(true)} title="Trocar senha" aria-label="Trocar senha" className="grid h-10 w-10 place-items-center rounded-lg text-nav-fraco hover:bg-white/10 hover:text-white"><KeyRound size={18} /></button>
            <button type="button" onClick={() => supabase.auth.signOut()} title="Sair" aria-label="Sair" className="grid h-10 w-10 place-items-center rounded-lg text-nav-fraco hover:bg-white/10 hover:text-white"><LogOut size={18} /></button>
          </span>
        </div>
        {acesso?.vinculado && (
          <nav className="mx-auto hidden max-w-3xl gap-1 px-4 pb-2 md:flex" aria-label="Portal">
            {MENU.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive ? "bg-white/10 text-white" : "text-nav-texto hover:text-white"}`}>
                <Icon size={16} aria-hidden /> {label === "Orçamento" ? "Novo orçamento" : label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-6">
        {isLoading ? <p className="py-10 text-center text-slate-500">Carregando…</p>
          : error ? (
            <Card className="space-y-3 p-6 text-center">
              <p className="text-red-700" role="alert">{(error as Error).message}</p>
              <Button variant="secondary" onClick={() => refetch()}>Tentar de novo</Button>
            </Card>
          ) : !acesso?.vinculado ? (
            <Card className="space-y-3 p-6 text-center">
              <h1 className="text-lg font-bold text-fg">Acesso ainda não liberado</h1>
              <p className="text-sm text-slate-600">Seu login ainda não está ligado ao seu cadastro de representante. Peça à empresa para liberar em Comissões → Vendedores.</p>
              <Button variant="secondary" onClick={() => supabase.auth.signOut()}><LogOut size={16} aria-hidden /> Sair</Button>
            </Card>
          ) : (
            <Routes>
              <Route index element={<PortalResumo nome={acesso.nome} />} />
              <Route path="pedidos" element={<PortalPedidos />} />
              <Route path="pedidos/:id" element={<PortalPedido />} />
              <Route path="novo" element={<PortalOrcamento />} />
              <Route path="comissoes" element={<PortalComissoes />} />
              <Route path="clientes" element={<PortalClientes />} />
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </Routes>
          )}
      </main>

      {/* Celular: atalhos fixos embaixo, ao alcance do polegar */}
      {acesso?.vinculado && (
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ink-line bg-ink/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label="Portal">
          {MENU.map(({ to, label, icon: Icon, end, destaque }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-2xs font-semibold ${isActive ? "text-brand-ice" : "text-nav-fraco"}`}>
              {destaque
                ? <span className="-mt-4 grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-fg shadow-pop ring-4 ring-ink"><Icon size={22} aria-hidden /></span>
                : <Icon size={21} aria-hidden />}
              {label}
            </NavLink>
          ))}
        </nav>
      )}
      {senha && <AlterarSenha onClose={() => setSenha(false)} />}
    </div>
  );
}
