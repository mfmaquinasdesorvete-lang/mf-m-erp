// Acesso rápido do Início (pedido de 23/10, no jeito do app da Riachuelo): uma faixa de bolinhas que rola para o lado
// com as telas do dia a dia — Clientes, NF, Rastreio, Peças, Máquinas… —, cada uma na cor da área e com o número do
// que pede atenção. Só aparecem as telas que a pessoa pode abrir. Os menus maiores continuam no menu, para abrir.
// Celular (24/10, modelo enviado pela usuária): cartõezinhos brancos em grade de 3, com o ícone numa bolinha colorida;
// mostra 8 e o 9º é "Mais", que abre o resto.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Boxes, ChevronDown, FileText, Factory, IceCreamCone, LayoutGrid, MapPinned, ShieldCheck, ShoppingCart, Truck, UserCog, Users, Wallet, Wrench, Cog, type LucideIcon,
} from "lucide-react";
import { todosItens, useVisivel } from "@/lib/menu";

export type AtalhoRapido = { to: string; rotulo: string; icone: LucideIcon; cor: string; aviso?: number; state?: unknown };

/** As telas da faixa, na ordem em que aparecem (as mais usadas primeiro). */
export const ATALHOS_INICIO: AtalhoRapido[] = [
  { to: "/clientes", rotulo: "Clientes", icone: Users, cor: "#a855f7" },
  { to: "/tecnicos", rotulo: "Técnicos", icone: UserCog, cor: "#0ea5e9" },
  { to: "/notas", rotulo: "NF", icone: FileText, cor: "#3b82f6" },
  { to: "/rastreio", rotulo: "Rastreio", icone: MapPinned, cor: "#65a30d" },
  { to: "/produtos/pecas", rotulo: "Peças", icone: Cog, cor: "#f97316" },
  { to: "/produtos/maquinas", rotulo: "Máquinas", icone: IceCreamCone, cor: "#ec4899" },
  { to: "/pedidos", rotulo: "Vendas", icone: ShoppingCart, cor: "#10b981" },
  { to: "/assistencia", rotulo: "OS", icone: Wrench, cor: "#14b8a6" },
  { to: "/financeiro", rotulo: "Contas", icone: Wallet, cor: "#f59e0b" },
  { to: "/estoque", rotulo: "Estoque", icone: Boxes, cor: "#f97316" },
  { to: "/fretes", rotulo: "Fretes", icone: Truck, cor: "#65a30d" },
  { to: "/garantias", rotulo: "Garantias", icone: ShieldCheck, cor: "#14b8a6" },
  { to: "/producao", rotulo: "Produção", icone: Factory, cor: "#ea580c" },
];

export function AcessoRapido({ avisos = {} }: { avisos?: Record<string, number> }) {
  const vis = useVisivel();
  const navigate = useNavigate();
  const itens = ATALHOS_INICIO.filter((a) => {
    const item = todosItens.find((i) => i.to === a.to);
    return !!item && vis.item(item);
  });
  const [todos, setTodos] = useState(false);
  if (!itens.length) return null;
  const NO_CELULAR = 8;
  const celular = todos || itens.length <= NO_CELULAR + 1 ? itens : itens.slice(0, NO_CELULAR);
  const sobra = itens.length - celular.length;
  return (
    <>
      {/* celular: grade de cartõezinhos */}
      <nav aria-label="Acesso rápido" className="md:hidden">
        <h2 className="mb-2 text-sm font-bold text-fg">Acesso rápido</h2>
        <ul className="grid grid-cols-3 gap-2.5">
          {celular.map((a) => {
            const n = avisos[a.to] ?? 0;
            return (
              <li key={a.to}>
                <button type="button" onClick={() => navigate(a.to)} aria-label={n ? `${a.rotulo} (${n} para ver)` : a.rotulo}
                  className="cartao relative flex w-full flex-col items-center gap-1.5 px-1 py-3 text-center transition active:scale-95">
                  <span className="grid h-11 w-11 place-items-center rounded-full"
                    style={{ background: `color-mix(in srgb, ${a.cor} 16%, transparent)`, color: a.cor }}>
                    <a.icone size={21} aria-hidden />
                  </span>
                  <span className="w-full truncate text-xs font-semibold text-slate-700">{a.rotulo}</span>
                  {n > 0 && <span className="num absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-solido-vermelho px-1 text-2xs font-bold text-white">{n > 99 ? "99+" : n}</span>}
                </button>
              </li>
            );
          })}
          {(sobra > 0 || todos) && itens.length > NO_CELULAR + 1 && (
            <li>
              <button type="button" onClick={() => setTodos((v) => !v)} aria-expanded={todos}
                className="cartao flex w-full flex-col items-center gap-1.5 px-1 py-3 text-center transition active:scale-95">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-600">
                  {todos ? <ChevronDown size={21} className="rotate-180" aria-hidden /> : <LayoutGrid size={21} aria-hidden />}
                </span>
                <span className="w-full truncate text-xs font-semibold text-slate-700">{todos ? "Menos" : `Mais ${sobra}`}</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
      {/* computador: as bolinhas */}
      <nav aria-label="Acesso rápido" className="hidden md:block">
      <ul className="flex flex-wrap gap-4">
        {itens.map((a) => {
          const n = avisos[a.to] ?? 0;
          return (
            <li key={a.to} className="shrink-0">
              <button type="button" onClick={() => navigate(a.to)} aria-label={n ? `${a.rotulo} (${n} para ver)` : a.rotulo}
                className="group flex w-[4.5rem] flex-col items-center gap-1.5 rounded-cartao text-center focus-visible:outline-none">
                <span className="relative grid h-16 w-16 place-items-center rounded-full transition group-hover:scale-105 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-brand"
                  style={{
                    // cor lisa da área (diretrizes de design: sem degradê nem sombra colorida)
                    background: `color-mix(in srgb, ${a.cor} 16%, transparent)`,
                    color: a.cor,
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${a.cor} 30%, transparent)`,
                  }}>
                  <a.icone size={26} aria-hidden />
                  {n > 0 && (
                    <span className="num absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-solido-vermelho px-1 text-2xs font-bold text-white ring-2 ring-[rgb(var(--canvas))]">{n > 99 ? "99+" : n}</span>
                  )}
                </span>
                <span className="w-full truncate text-xs font-semibold text-slate-700 group-hover:text-fg">{a.rotulo}</span>
              </button>
            </li>
          );
        })}
      </ul>
      </nav>
    </>
  );
}
