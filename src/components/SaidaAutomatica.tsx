// Sai do ERP depois de alguns minutos sem uso (Usuários → Segurança do acesso; 0 = nunca).
// A última atividade fica guardada no navegador: vale para todas as abas abertas e também
// quando o computador fica fechado (ao voltar depois do prazo, a pessoa já entra pela tela de login).
import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { Button } from "./ui";

const CHAVE = "erp-ultima-atividade";
const AVISO_MS = 60_000;
const ler = () => { try { return Number(localStorage.getItem(CHAVE)) || 0; } catch { return 0; } };
const gravar = (t: number) => { try { localStorage.setItem(CHAVE, String(t)); } catch { /* aba privada: conta só nesta aba */ } };

/** Tempo sem uso até sair (pura, para os testes). */
export function situacaoInatividade(agora: number, ultima: number, minutos: number): { sair: boolean; restamSeg: number | null } {
  if (!minutos) return { sair: false, restamSeg: null };
  const limite = minutos * 60_000;
  const ocioso = agora - ultima;
  if (ocioso >= limite) return { sair: true, restamSeg: 0 };
  if (ocioso >= limite - AVISO_MS) return { sair: false, restamSeg: Math.ceil((limite - ocioso) / 1000) };
  return { sair: false, restamSeg: null };
}

export function SaidaAutomatica({ minutos, entrouEm }: { minutos: number; entrouEm?: string | null }) {
  const [restam, setRestam] = useState<number | null>(null);
  const ultima = useRef(0);

  useEffect(() => {
    if (!minutos) return;
    // login novo depois da última atividade guardada: começa a contar agora
    const guardada = ler();
    const entrada = entrouEm ? Date.parse(entrouEm) : 0;
    ultima.current = guardada && guardada > entrada ? guardada : Date.now();
    gravar(ultima.current);

    let gravadaEm = 0;
    const atividade = () => {
      const agora = Date.now();
      ultima.current = agora;
      if (agora - gravadaEm > 10_000) { gravadaEm = agora; gravar(agora); }   // grava no máximo a cada 10 s
    };
    const outraAba = (e: StorageEvent) => { if (e.key === CHAVE && e.newValue) ultima.current = Math.max(ultima.current, Number(e.newValue) || 0); };
    let saindo = false;
    const conferir = () => {
      const s = situacaoInatividade(Date.now(), Math.max(ultima.current, ler()), minutos);
      if (s.sair && !saindo) {
        saindo = true;
        supabase.auth.signOut().finally(() => notify(`Você saiu do ERP depois de ${minutos} minutos sem uso. Entre de novo para continuar.`, "erro"));
      }
      setRestam(s.restamSeg);
    };
    const eventos = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"] as const;
    eventos.forEach((ev) => window.addEventListener(ev, atividade, { passive: true, capture: true }));
    window.addEventListener("storage", outraAba);
    // voltou para a aba (ou o computador acordou): confere na hora
    const voltou = () => { if (document.visibilityState === "visible") conferir(); };
    document.addEventListener("visibilitychange", voltou);
    conferir();
    const t = window.setInterval(conferir, 5_000);
    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, atividade, { capture: true }));
      window.removeEventListener("storage", outraAba);
      document.removeEventListener("visibilitychange", voltou);
      window.clearInterval(t);
    };
  }, [minutos, entrouEm]);

  if (restam === null) return null;
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Saída por falta de uso"
      className="fixed inset-x-3 bottom-24 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-amber-300 bg-surface p-4 shadow-pop md:bottom-6">
      <Timer size={22} className="shrink-0 text-amber-600" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-fg">
        Sem uso há um tempo. O ERP fecha em <b className="num">{restam} s</b> para proteger os dados.
      </p>
      <Button onClick={() => { const agora = Date.now(); ultima.current = agora; gravar(agora); setRestam(null); }}>Continuar</Button>
    </div>
  );
}
