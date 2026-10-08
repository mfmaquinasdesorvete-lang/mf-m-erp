import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "./ui";

/** Campo de assinatura com o dedo ou mouse. Devolve um PNG (data URL) ou null quando vazio. */
export function Assinatura({ valor, onChange, disabled }: { valor: string | null; onChange: (png: string | null) => void; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [vazio, setVazio] = useState(!valor);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const escala = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * escala;
    c.height = c.offsetHeight * escala;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0d1b2e";
    if (valor) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.offsetWidth, c.offsetHeight);
      img.src = valor;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ponto = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  function inicio(e: React.PointerEvent) {
    if (disabled) return;
    desenhando.current = true;
    canvas.current!.setPointerCapture(e.pointerId);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(...ponto(e));
  }
  function mover(e: React.PointerEvent) {
    if (!desenhando.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    ctx.lineTo(...ponto(e));
    ctx.stroke();
  }
  function fim() {
    if (!desenhando.current) return;
    desenhando.current = false;
    setVazio(false);
    onChange(canvas.current!.toDataURL("image/png"));
  }
  function limpar() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setVazio(true);
    onChange(null);
  }

  return (
    <div>
      <div className="relative">
        <canvas ref={canvas} onPointerDown={inicio} onPointerMove={mover} onPointerUp={fim} onPointerLeave={fim}
          className={`h-36 w-full touch-none rounded-lg border-2 border-dashed ${disabled ? "border-slate-200 bg-[#f1f5f9]" : "border-slate-300 bg-[#ffffff]"}`} />
        {vazio && !disabled && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Assine aqui com o dedo ou o mouse</span>
        )}
      </div>
      {!disabled && !vazio && (
        <Button type="button" variant="ghost" className="mt-1" onClick={limpar}><Eraser size={15} /> Limpar assinatura</Button>
      )}
    </div>
  );
}
