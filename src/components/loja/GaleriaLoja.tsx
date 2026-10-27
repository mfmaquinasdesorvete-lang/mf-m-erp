// Loja → página do produto: as fotos como no Mercado Livre. No computador, as miniaturas ficam numa coluna à
// esquerda (passar o mouse troca a foto grande) e a foto grande amplia onde o mouse está; no celular, a foto
// desliza para o lado com o contador "2/5". Clicar abre a foto na tela inteira, com setas.
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { useFecharComEsc } from "@/components/ui";

export function GaleriaLoja({ fotos, nome }: { fotos: string[]; nome: string }) {
  const [atual, setAtual] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [cheia, setCheia] = useState(false);
  const faixa = useRef<HTMLDivElement>(null);
  if (!fotos.length) {
    return <div className="grid aspect-square place-items-center rounded-2xl border border-slate-200 bg-white"><ImageOff size={48} className="text-slate-300" /></div>;
  }
  const i = Math.min(atual, fotos.length - 1);

  function mover(e: MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  }
  // celular: qual foto está no meio da faixa
  function rolou() {
    const el = faixa.current;
    if (el) setAtual(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div>
      {/* computador: miniaturas à esquerda e a foto grande com zoom */}
      <div className="hidden gap-3 md:flex">
        {fotos.length > 1 && (
          <ul className="flex max-h-[32rem] w-16 shrink-0 flex-col gap-2 overflow-y-auto" aria-label="Fotos do produto">
            {fotos.map((f, n) => (
              <li key={f}>
                <button type="button" onMouseEnter={() => setAtual(n)} onFocus={() => setAtual(n)} onClick={() => setAtual(n)} aria-label={`Foto ${n + 1}`}
                  className={`botao-toque block aspect-square w-16 overflow-hidden rounded-lg border-2 bg-white ${n === i ? "border-brand" : "border-slate-200 hover:border-slate-400"}`}>
                  <img src={f} alt="" loading="lazy" className="h-full w-full object-contain" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setCheia(true)} onMouseMove={mover} onMouseLeave={() => setZoom(null)} aria-label="Ver a foto na tela inteira"
          className="botao-toque relative aspect-square flex-1 cursor-zoom-in overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <img src={fotos[i]} alt={nome} className="h-full w-full object-contain transition-transform duration-100"
            style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
        </button>
      </div>

      {/* celular: desliza para o lado */}
      <div className="relative md:hidden">
        <div ref={faixa} onScroll={rolou} className="flex aspect-square snap-x snap-mandatory overflow-x-auto rounded-2xl border border-slate-200 bg-white [scrollbar-width:none]">
          {fotos.map((f, n) => (
            <button key={f} type="button" onClick={() => { setAtual(n); setCheia(true); }} className="botao-toque h-full w-full shrink-0 snap-center" aria-label={`Foto ${n + 1} de ${fotos.length}`}>
              <img src={f} alt={n === 0 ? nome : ""} loading={n === 0 ? undefined : "lazy"} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
        {fotos.length > 1 && <span className="num absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{i + 1}/{fotos.length}</span>}
      </div>

      {cheia && <TelaCheia fotos={fotos} inicio={i} nome={nome} onClose={() => setCheia(false)} />}
    </div>
  );
}

function TelaCheia({ fotos, inicio, nome, onClose }: { fotos: string[]; inicio: number; nome: string; onClose: () => void }) {
  const [n, setN] = useState(inicio);
  useFecharComEsc(true, onClose);
  const ir = (d: number) => setN((x) => (x + d + fotos.length) % fotos.length);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "ArrowRight") ir(1); if (e.key === "ArrowLeft") ir(-1); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });
  return (
    <div className="fixed inset-0 z-alerta grid place-items-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label={`Fotos de ${nome}`} onClick={onClose}>
      <button type="button" onClick={onClose} className="botao-claro absolute right-3 top-3 rounded-full p-2" aria-label="Fechar"><X size={22} /></button>
      <img src={fotos[n]} alt={nome} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] max-w-full rounded-lg bg-white object-contain" />
      {fotos.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); ir(-1); }} className="botao-claro absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2" aria-label="Foto anterior"><ChevronLeft size={26} /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); ir(1); }} className="botao-claro absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2" aria-label="Próxima foto"><ChevronRight size={26} /></button>
          <span className="num absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">{n + 1}/{fotos.length}</span>
        </>
      )}
    </div>
  );
}
