// Trilha no alto de cada tela: "← Voltar" e onde a pessoa está (Início › área › tela). A área leva ao painel dela; o
// Voltar volta para a tela anterior e, quando a tela foi aberta direto (link ou nova aba), para o painel da área.
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { grupoDaRota, grupos, painelDaArea, todosItens } from "@/lib/menu";

/** Telas fora do menu que não estão em todosItens: nome e tela de cima. */
const EXTRAS: Record<string, { label: string; pai?: { label: string; to: string } }> = {
  "/pessoal": { label: "Painel pessoal" },
  "/licenciados": { label: "My Frost Sorveterias" },
  "/sobre": { label: "Sobre o ERP Line" },
  "/portal": { label: "Portal do representante" },
};

export type Passo = { label: string; to?: string };

/** Os passos da trilha para um endereço (sem o Início). */
export function passosDaTrilha(path: string): Passo[] {
  if (path === "/") return [];
  const extra = EXTRAS[path];
  if (extra) return [...(extra.pai ? [extra.pai] : []), { label: extra.label }];
  // a tela: o item de endereço igual ou o mais comprido que começa o endereço (ex.: /clientes/123 → Clientes)
  const item = [...todosItens].filter((i) => i.to !== "/" && (path === i.to || path.startsWith(`${i.to}/`))).sort((a, b) => b.to.length - a.to.length)[0];
  const area = grupoDaRota(path);
  const g = grupos.find((x) => x.id === area);
  const passos: Passo[] = [];
  if (area === "admin") passos.push({ label: "Configurações", to: "/configuracoes" });
  else if (g?.titulo) {
    // a área leva ao painel dela (sem link quando a tela já é o painel)
    const painel = painelDaArea(g) ?? g.itens[0]?.to;
    passos.push({ label: g.titulo, to: painel === path ? undefined : painel });
  }
  if (item && !(area === "admin" && item.to === "/configuracoes")) passos.push({ label: item.label, to: path === item.to ? undefined : item.to });
  if (item && path !== item.to) passos.push({ label: "Detalhe" });
  return passos;
}

export function Trilha() {
  const { pathname, key } = useLocation();
  const navigate = useNavigate();
  if (pathname === "/") return null;
  const passos = passosDaTrilha(pathname);
  const subir = [...passos].reverse().find((p) => p.to && p.to !== pathname)?.to ?? "/";
  // a primeira tela aberta (link, nova aba ou recarregar sem histórico) tem a chave "default": sem tela anterior no ERP
  const temAnterior = key !== "default";
  return (
    <nav aria-label="Você está em" className="mb-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <button type="button" onClick={() => (temAnterior ? navigate(-1) : navigate(subir))}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-surface px-2.5 py-1 font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
        <ChevronLeft size={16} aria-hidden /> Voltar
      </button>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-slate-500">
        <li className="flex items-center">
          <Link to="/" className="inline-flex items-center gap-1 rounded px-1 hover:text-fg hover:underline"><Home size={14} aria-hidden /> Início</Link>
        </li>
        {passos.map((p, i) => (
          <li key={`${p.label}-${i}`} className="flex min-w-0 items-center gap-1">
            <ChevronRight size={14} className="shrink-0 text-slate-400" aria-hidden />
            {p.to && i < passos.length - 1
              ? <Link to={p.to} className="truncate rounded px-1 hover:text-fg hover:underline">{p.label}</Link>
              : <span aria-current={i === passos.length - 1 ? "page" : undefined} className="truncate px-1 font-semibold text-fg">{p.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
