// Menu "⋯" de uma linha: as ações que não são a principal ficam aqui, para a linha não virar uma fileira de botões.
// O menu abre por cima da página (fora da tabela), para não ser cortado pela rolagem da lista.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export type ItemMenu = { rotulo: string; icone?: LucideIcon; onClick: () => void; perigo?: boolean; disabled?: boolean; dica?: string };

export function MenuAcoes({ itens, rotulo = "Mais ações", extra }: { itens: (ItemMenu | null | false | undefined)[]; rotulo?: string; extra?: ReactNode }) {
  const lista = itens.filter(Boolean) as ItemMenu[];
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const fechar = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    const fora = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) fechar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { fechar(); botao.current?.focus(); } };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", fechar, true); window.removeEventListener("resize", fechar);
    };
  }, [pos]);
  if (!lista.length && !extra) return null;
  function abrir() {
    if (pos) return fechar();
    const r = botao.current!.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    // perto do pé da tela: abre para cima
    setPos(r.bottom + 300 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  }
  return (
    <>
      <button ref={botao} type="button" onClick={abrir} aria-haspopup="menu" aria-expanded={!!pos} aria-label={rotulo} title={rotulo}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-fg">
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" style={{ position: "fixed", top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="z-[60] min-w-[13rem] overflow-hidden rounded-xl border border-slate-200 bg-surface py-1 shadow-pop">
          {lista.map((i) => (
            <button key={i.rotulo} type="button" role="menuitem" disabled={i.disabled} title={i.dica}
              onClick={() => { fechar(); i.onClick(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium disabled:opacity-50 ${i.perigo ? "text-red-700 hover:bg-red-50" : "text-fg hover:bg-slate-50"}`}>
              {i.icone && <i.icone size={16} aria-hidden className={i.perigo ? "" : "text-slate-500"} />} {i.rotulo}
            </button>
          ))}
          {extra}
        </div>, document.body)}
    </>
  );
}
