// Acesso rápido do Início (pedido de 23/10, no jeito do app da Riachuelo): uma faixa de bolinhas que rola para o lado
// com as telas do dia a dia — Clientes, NF, Rastreio, Peças, Máquinas… —, cada uma na cor da área e com o número do
// que pede atenção. Só aparecem as telas que a pessoa pode abrir. Os menus maiores continuam no menu, para abrir.
import { useNavigate } from "react-router-dom";
import {
  Boxes, FileText, Factory, IceCreamCone, MapPinned, ShieldCheck, ShoppingCart, Truck, Users, Wallet, Wrench, Cog, type LucideIcon,
} from "lucide-react";
import { todosItens, useVisivel } from "@/lib/menu";

export type AtalhoRapido = { to: string; rotulo: string; icone: LucideIcon; cor: string; aviso?: number; state?: unknown };

/** As telas da faixa, na ordem em que aparecem (as mais usadas primeiro). */
export const ATALHOS_INICIO: AtalhoRapido[] = [
  { to: "/clientes", rotulo: "Clientes", icone: Users, cor: "#a855f7" },
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
  if (!itens.length) return null;
  return (
    <nav aria-label="Acesso rápido" className="-mx-4 md:mx-0">
      <ul className="flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:flex-wrap md:gap-4 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {itens.map((a) => {
          const n = avisos[a.to] ?? 0;
          return (
            <li key={a.to} className="shrink-0 snap-start">
              <button type="button" onClick={() => navigate(a.to)} aria-label={n ? `${a.rotulo} (${n} para ver)` : a.rotulo}
                className="group flex w-[4.5rem] flex-col items-center gap-1.5 rounded-cartao text-center focus-visible:outline-none">
                <span className="relative grid h-16 w-16 place-items-center rounded-full transition group-hover:scale-105 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-brand"
                  style={{
                    background: `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${a.cor} 38%, transparent), color-mix(in srgb, ${a.cor} 14%, transparent) 70%)`,
                    color: `color-mix(in srgb, ${a.cor} 75%, white)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${a.cor} 45%, transparent), 0 10px 22px -14px ${a.cor}`,
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
  );
}
