// "Instalar o app" nos apps de celular: no Android/Chrome usa o convite do próprio navegador; no iPhone (que não tem
// convite) mostra o passo a passo do Safari; já instalado, só confirma. O convite chega antes da tela abrir, por isso é
// guardado logo no início (guardarConviteInstalar, chamado no main.tsx).
import { useEffect, useState } from "react";
import { Check, Download, Share, SquarePlus } from "lucide-react";

type Convite = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let convite: Convite | null = null;
const ouvintes = new Set<() => void>();

export function guardarConviteInstalar() {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); convite = e as Convite; ouvintes.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { convite = null; ouvintes.forEach((f) => f()); });
}

const instalado = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function InstalarApp() {
  const [, render] = useState(0);
  const [passos, setPassos] = useState(false);
  useEffect(() => { const f = () => render((n) => n + 1); ouvintes.add(f); return () => { ouvintes.delete(f); }; }, []);

  if (instalado()) return (
    <p className="flex items-center gap-2 rounded-2xl border border-fixo-emerald-400/30 bg-fixo-emerald-400/10 p-4 text-sm text-fixo-emerald-300"><Check size={18} /> App instalado neste celular</p>
  );
  async function instalar() {
    if (convite) { await convite.prompt(); await convite.userChoice; convite = null; render((n) => n + 1); }
    else setPassos(true);
  }
  return (
    <div className="rounded-2xl border border-white/10 p-4 text-sm">
      <button type="button" onClick={instalar} className="flex w-full items-center justify-center gap-2 rounded-xl bg-noite-texto py-3 font-bold text-noite-fundo">
        <Download size={18} /> Instalar o app no celular
      </button>
      <p className="mt-2 text-xs text-noite-fraco">Fica com ícone na tela de início e abre sem a barra do navegador.</p>
      {passos && (ehIphone() ? (
        <ol className="mt-3 space-y-2 text-noite-medio">
          <li className="flex items-center gap-2">1. Abra este endereço no <b>Safari</b>.</li>
          <li className="flex items-center gap-2">2. Toque em <Share size={16} aria-label="Compartilhar" /> <b>Compartilhar</b> (embaixo).</li>
          <li className="flex items-center gap-2">3. Toque em <SquarePlus size={16} aria-hidden /> <b>Adicionar à Tela de Início</b>.</li>
        </ol>
      ) : (
        <p className="mt-3 text-noite-medio">No Chrome, toque nos <b>três pontinhos ⋮</b> (em cima, à direita) e em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p>
      ))}
    </div>
  );
}
