// Notificações na tela: pop-up na hora (pagamento recebido, pedido da loja, e-mail novo) e o sino com o histórico.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, FileSignature, Mail, ShoppingBag, Wallet, X, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";

export type Notificacao = { id: number; tipo: string; titulo: string; texto: string | null; link: string | null; created_at: string };

const ESTILO: Record<string, { icon: LucideIcon; cor: string }> = {
  pagamento: { icon: Wallet, cor: "var(--kpi-verde)" },
  pedido_loja: { icon: ShoppingBag, cor: "var(--kpi-ciano)" },
  email: { icon: Mail, cor: "var(--kpi-roxo)" },
  proposta: { icon: FileSignature, cor: "var(--kpi-ciano)" },
  outro: { icon: BellRing, cor: "var(--kpi-laranja)" },
};

type Ctx = { lista: Notificacao[]; naoVistas: number; abrirPainel: () => void };
const NotifCtx = createContext<Ctx>({ lista: [], naoVistas: 0, abrirPainel: () => {} });
export const useNotificacoes = () => useContext(NotifCtx);

/** Som curto de aviso (sem arquivo de áudio). */
function tocar() {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.16 + 0.22);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + i * 0.16); o.stop(ac.currentTime + i * 0.16 + 0.25);
    });
  } catch { /* navegador sem áudio */ }
}

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const perfil = usePerfil();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [popups, setPopups] = useState<Notificacao[]>([]);
  const [painel, setPainel] = useState(false);
  const vistos = useRef(new Set<number>());

  const { data: lista = [] } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notificacoes").select("*").order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      return data as Notificacao[];
    },
    refetchInterval: 60_000, // segurança caso a conexão em tempo real caia
  });
  const { data: eu } = useQuery({
    queryKey: ["usuarios_erp", "vistas", perfil.user_id],
    queryFn: async () => (await supabase.from("usuarios_erp").select("notificacoes_vistas_em").eq("user_id", perfil.user_id).single()).data,
  });
  const vistasEm = eu?.notificacoes_vistas_em ?? new Date().toISOString();
  const naoVistas = lista.filter((n) => n.created_at > vistasEm).length;

  function mostrar(n: Notificacao) {
    if (vistos.current.has(n.id)) return;
    vistos.current.add(n.id);
    setPopups((p) => [n, ...p].slice(0, 3));
    tocar();
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(n.titulo, { body: n.texto ?? "", icon: "/logo-192.png", tag: `erp-${n.id}` }); } catch { /* sem suporte */ }
    }
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== n.id)), 15_000);
  }

  // Tempo real: cada notificação nova (que a pessoa pode ver) aparece na hora
  useEffect(() => {
    lista.forEach((n) => vistos.current.add(n.id)); // as que já existiam não viram pop-up
    const canal = supabase.channel("erp-notificacoes")
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "notificacoes" }, (payload: any) => {
        mostrar(payload.new as Notificacao);
        qc.invalidateQueries({ queryKey: ["notificacoes"] });
        if (payload.new?.tipo === "pagamento") qc.invalidateQueries({ queryKey: ["contas_receber"] });
        if (payload.new?.tipo === "pedido_loja" || payload.new?.tipo === "proposta") qc.invalidateQueries({ queryKey: ["pedidos"] });
        if (payload.new?.tipo === "email") qc.invalidateQueries({ queryKey: ["emails"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [lista.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrirPainel() {
    setPainel(true);
    await supabase.rpc("marcar_notificacoes_vistas");
    setTimeout(() => qc.invalidateQueries({ queryKey: ["usuarios_erp", "vistas"] }), 1500);
  }
  const abrir = (n: Notificacao) => { setPopups((p) => p.filter((x) => x.id !== n.id)); setPainel(false); if (n.link) navigate(n.link); };

  return (
    <NotifCtx.Provider value={{ lista, naoVistas, abrirPainel }}>
      {children}

      {/* Pop-ups */}
      <div className="pointer-events-none fixed inset-x-3 top-[70px] z-[60] flex flex-col items-end gap-2 md:inset-x-auto md:right-5 md:top-5" aria-live="assertive">
        {popups.map((n) => {
          const e = ESTILO[n.tipo] ?? ESTILO.outro;
          return (
            <div key={n.id} role="alert"
              className="pointer-events-auto flex w-full max-w-sm animate-[entrar_.35s_ease-out] items-start gap-3 rounded-2xl border bg-surface p-4 shadow-pop"
              style={{ borderColor: `color-mix(in srgb, ${e.cor} 45%, transparent)`, boxShadow: `0 18px 40px -18px ${e.cor}` }}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${e.cor} 20%, transparent)`, color: e.cor }}><e.icon size={22} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold leading-tight text-fg">{n.titulo}</div>
                {n.texto && <div className="mt-0.5 line-clamp-2 text-sm text-slate-600">{n.texto}</div>}
                {n.link && <button type="button" onClick={() => abrir(n)} className="mt-2 text-sm font-bold text-brand hover:underline">Abrir →</button>}
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setPopups((p) => p.filter((x) => x.id !== n.id))} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
          );
        })}
      </div>

      {/* Histórico */}
      {painel && (
        <div className="fixed inset-0 z-[55] bg-ink/40 backdrop-blur-[1px]" onClick={() => setPainel(false)}>
          <div className="absolute inset-x-3 top-[70px] max-h-[75vh] overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-3 shadow-pop md:left-auto md:right-5 md:top-5 md:w-96"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-bold text-fg">Notificações</span>
              <button type="button" aria-label="Fechar" onClick={() => setPainel(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            {"Notification" in window && Notification.permission === "default" && (
              <button type="button" onClick={() => Notification.requestPermission()} className="mb-2 w-full rounded-xl bg-brand-light px-3 py-2 text-left text-sm font-semibold text-fg">
                🔔 Avisar também quando o ERP estiver minimizado
              </button>
            )}
            {lista.length ? (
              <ul className="space-y-1">
                {lista.map((n) => {
                  const e = ESTILO[n.tipo] ?? ESTILO.outro;
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => abrir(n)} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-slate-50">
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${e.cor} 18%, transparent)`, color: e.cor }}><e.icon size={17} /></span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm leading-tight ${n.created_at > vistasEm ? "font-bold text-fg" : "font-semibold text-slate-700"}`}>{n.titulo}</span>
                          {n.texto && <span className="block truncate text-xs text-slate-500">{n.texto}</span>}
                          <span className="block text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="p-6 text-center text-sm text-slate-500">Nada por aqui ainda.</p>}
          </div>
        </div>
      )}
    </NotifCtx.Provider>
  );
}

/** Sino com o número de notificações novas. */
export function Sino({ claro }: { claro?: boolean }) {
  const { naoVistas, abrirPainel } = useNotificacoes();
  return (
    <button type="button" onClick={abrirPainel} aria-label={naoVistas ? `${naoVistas} notificações novas` : "Notificações"}
      className={`relative rounded-xl p-2 ${claro ? "text-slate-600 hover:bg-slate-100" : "text-white hover:bg-white/10"}`}>
      <Bell size={21} />
      {naoVistas > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{naoVistas > 9 ? "9+" : naoVistas}</span>}
    </button>
  );
}
