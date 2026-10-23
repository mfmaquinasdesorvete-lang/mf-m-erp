// Arrastar para ordenar uma lista: pela alça (mouse ou dedo, também no celular) ou com as setas do teclado com a
// alça em foco. A linha marcada com `linha(id)` é o lugar de soltar; a faixa colorida mostra onde o item vai cair.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";

export type Soltar = { de: string; para: string; depois: boolean };
type Alvo = { id: string; depois: boolean };

/** O elemento que rola a tela (a lista pode estar dentro de uma janela com rolagem própria). */
function rolagemDe(el: HTMLElement | null): HTMLElement | null {
  for (let e = el?.parentElement ?? null; e; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight) return e;
  }
  return null;
}

export function useArrastar(aoSoltar: (s: Soltar) => void, aoMover: (id: string, passo: -1 | 1) => void) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const atual = useRef<{ id: string; alvo: Alvo | null; rola: HTMLElement | null } | null>(null);
  const fim = () => { atual.current = null; setArrastando(null); setAlvo(null); };

  return {
    arrastando,
    /** Marca a linha como lugar de soltar (e põe a faixa de onde o item vai cair). */
    linha: (id: string) => ({ "data-arrastar": id }),
    /** Faixa colorida em cima ou embaixo da linha onde o item vai cair (a linha precisa ser `relative`). */
    marca: (id: string) => alvo?.id === id && arrastando && arrastando !== id
      ? <span aria-hidden className={`pointer-events-none absolute inset-x-0 z-10 h-1 rounded-full bg-brand ${alvo.depois ? "-bottom-0.5" : "-top-0.5"}`} />
      : null,
    /** A linha que está sendo arrastada fica apagada. */
    apagada: (id: string) => arrastando === id,
    alca: (id: string) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        atual.current = { id, alvo: null, rola: rolagemDe(e.currentTarget) };
        setArrastando(id);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const a = atual.current;
        if (!a || a.id !== id) return;
        // perto da borda da tela, rola para dar para levar o item longe
        const borda = 64, passo = 14;
        const topo = a.rola ? a.rola.getBoundingClientRect().top : 0;
        const fundo = a.rola ? a.rola.getBoundingClientRect().bottom : window.innerHeight;
        const dy = e.clientY < topo + borda ? -passo : e.clientY > fundo - borda ? passo : 0;
        if (dy) { if (a.rola) a.rola.scrollBy(0, dy); else window.scrollBy(0, dy); }
        const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-arrastar]");
        const para = el?.dataset.arrastar;
        let novo: Alvo | null = null;
        if (el && para && para !== id) {
          const r = el.getBoundingClientRect();
          novo = { id: para, depois: e.clientY > r.top + r.height / 2 };
        }
        if (novo?.id !== a.alvo?.id || novo?.depois !== a.alvo?.depois) { a.alvo = novo; setAlvo(novo); }
      },
      onPointerUp: () => {
        const a = atual.current;
        if (a?.id === id && a.alvo) aoSoltar({ de: id, para: a.alvo.id, depois: a.alvo.depois });
        fim();
      },
      onPointerCancel: fim,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        aoMover(id, e.key === "ArrowUp" ? -1 : 1);
      },
    }),
  };
}

/** A alça de arrastar (os 6 pontinhos). Com foco, as setas do teclado sobem e descem o item. */
export function AlcaArrastar({ nome, ...props }: { nome: string } & ReturnType<ReturnType<typeof useArrastar>["alca"]>) {
  return (
    <button type="button" {...props} aria-label={`Mudar a ordem de ${nome}: arraste ou use as setas para cima e para baixo`}
      title="Arraste para mudar a ordem" style={{ touchAction: "none" }}
      className="botao-icone h-8 w-6 cursor-grab p-0 text-slate-400 active:cursor-grabbing">
      <GripVertical size={16} aria-hidden />
    </button>
  );
}
