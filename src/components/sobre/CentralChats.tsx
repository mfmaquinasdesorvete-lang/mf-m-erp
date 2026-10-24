// Sobre → Chats → Central dos chats: a "sala de controle" dos chats do Claude. O ERP no centro e os chats em volta:
// o que está publicando pulsa e manda uma linha de luz até o site, o que precisa da usuária pisca em vermelho e o que
// entregou nas últimas 2 horas fica aceso. Embaixo, a linha do tempo (publicações e entregas de cada chat) e o placar.
// Dados reais: publicações = tabela publicacoes (trava); entregas = mudanças do código com a linha Claude-Session
// (lidas na hora de montar o site); precisa de você = aviso dos chats (notificações tipo "claude") sem o Ciente.
// A caixa é escura nos dois temas (cores fixas, como a linha de comando de Sistemas).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import type { EntregaChat } from "@/lib/chatsEntregas";

const ENTREGAS: EntregaChat[] = typeof __ERP_ENTREGAS_CHATS__ !== "undefined" ? __ERP_ENTREGAS_CHATS__ : [];

export type ChatCentral = { id: string; nome: string; sessao: string; cor: string; ativo: boolean };
type Publicacao = { id: string; chat: string; o_que: string; inicio: string; fim: string | null; situacao: "publicando" | "feita" | "abandonada" };
type AvisoChat = { id: number; remetente_nome: string | null; created_at: string };

export const NEON: Record<string, string> = {
  slate: "#94a3b8", azul: "#38bdf8", verde: "#34d399", teal: "#2dd4bf", ambar: "#fbbf24",
  rosa: "#f472b6", violeta: "#a78bfa", vermelho: "#f87171", indigo: "#818cf8",
};
const curto = (nome: string) => nome.replace(/^ERP Line – /, "");
const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** A publicação guarda o nome que o chat escreveu: liga ao chat da lista pelo nome (inteiro ou pedaço). */
const doChat = (texto: string | null, c: ChatCentral) => !!texto && (sem(texto).includes(sem(curto(c.nome))) || sem(c.nome).includes(sem(texto.replace(/^ERP Line – /, ""))));
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const ha = (iso: string, agora: number) => {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  return min < 1 ? "agora" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)} h` : `há ${Math.floor(min / 1440)} d`;
};

export function CentralChats({ chats }: { chats: ChatCentral[] }) {
  const { user_id: eu } = usePerfil();
  const [agora, setAgora] = useState(Date.now());
  const [periodo, setPeriodo] = useState<"hoje" | "semana">("hoje");
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const desde = new Date(Date.now() - 8 * 864e5).toISOString();
  const { data: pubs = [] } = useQuery({
    queryKey: ["publicacoes", "central"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("publicacoes").select("*").gte("inicio", desde).order("inicio");
      if (error) throw error;
      return data as Publicacao[];
    },
  });
  const { data: avisos = [] } = useQuery({
    queryKey: ["notificacoes", "claude-pendentes", eu],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("notificacoes").select("id, remetente_nome, created_at").eq("tipo", "claude").gte("created_at", desde);
      if (error) throw error;
      const lista = data as AvisoChat[];
      if (!lista.length) return [];
      const { data: ci } = await supabase.from("notificacoes_ciencia").select("notificacao_id").eq("user_id", eu).in("notificacao_id", lista.map((a) => a.id));
      const vistos = new Set((ci ?? []).map((c: { notificacao_id: number }) => c.notificacao_id));
      return lista.filter((a) => !vistos.has(a.id));
    },
  });

  const ativos = chats.filter((c) => c.ativo);
  const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
  const ini = periodo === "hoje" ? inicioHoje.getTime() : agora - 7 * 864e5;
  const noPeriodo = (iso: string) => new Date(iso).getTime() >= ini;
  const publicando = pubs.find((p) => p.situacao === "publicando");

  const estado = useMemo(() => ativos.map((c) => {
    const entregas = ENTREGAS.filter((e) => e.sessao === c.sessao);
    const minhas = pubs.filter((p) => doChat(p.chat, c));
    const datas = [entregas[0]?.quando, minhas[minhas.length - 1]?.inicio].filter(Boolean).sort() as string[];
    const ultima = datas[datas.length - 1];
    return {
      c, entregas, minhas, ultima,
      publicandoAgora: !!publicando && doChat(publicando.chat, c),
      precisa: avisos.filter((a) => doChat(a.remetente_nome, c)).length,
      aceso: !!ultima && agora - new Date(ultima).getTime() < 2 * 3600e3,
    };
  }), [ativos, pubs, avisos, publicando, agora]); // eslint-disable-line react-hooks/exhaustive-deps

  const entregasPeriodo = ENTREGAS.filter((e) => noPeriodo(e.quando)).length;
  const pubsPeriodo = pubs.filter((p) => noPeriodo(p.inicio)).length;
  const precisaTotal = estado.reduce((s, x) => s + x.precisa, 0);

  // órbita (maior e interativa, 23/10): chats num círculo em volta do ERP; o nome fica para fora, alinhado pelo lado,
  // para não encavalar. Passar o mouse (ou o foco do teclado) acende o chat; tocar abre o cartão dele ao lado.
  const W = 800, H = 540, CX = 400, CY = 270, R = 185;
  const pos = (i: number) => {
    const a = (i / Math.max(1, estado.length)) * 2 * Math.PI - Math.PI / 2;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) };
  };
  const [sobre, setSobre] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const foco = sobre ?? escolhido;
  const sel = estado.find((x) => x.c.id === escolhido) ?? null;
  const urlSessao = (s: string) => (/^session_[A-Za-z0-9]+$/.test(s) ? `https://claude.ai/code/${s}` : null);

  return (
    <div className="overflow-hidden rounded-2xl text-fixo-slate-200 shadow-pop" style={{ background: "#1e1b4b" }}>
      <style>{`
        @keyframes cc-pulso { 0%,100% { opacity: .35; transform: scale(1) } 50% { opacity: .9; transform: scale(1.35) } }
        @keyframes cc-fluxo { to { stroke-dashoffset: -24 } }
        @keyframes cc-pisca { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        @keyframes cc-gira { to { transform: rotate(360deg) } }
        .cc-pulso { transform-box: fill-box; transform-origin: center; animation: cc-pulso 1.6s ease-in-out infinite }
        .cc-fluxo { animation: cc-fluxo .8s linear infinite }
        .cc-pisca { animation: cc-pisca 1s ease-in-out infinite }
        .cc-gira { transform-box: fill-box; transform-origin: center; animation: cc-gira 18s linear infinite }
        .cc-no { cursor: pointer; outline: none }
        .cc-no .cc-bola { transition: r .2s ease, fill-opacity .2s ease }
        .cc-no:focus-visible .cc-anel { stroke: #fff; stroke-width: 2 }
        @media (prefers-reduced-motion: reduce) { .cc-pulso, .cc-fluxo, .cc-pisca, .cc-gira { animation: none } .cc-no .cc-bola { transition: none } }
      `}</style>

      {/* faixa do "agora" */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${publicando ? "cc-pisca bg-fixo-cyan-400 shadow-[0_0_12px_#22d3ee]" : "bg-fixo-emerald-400 shadow-[0_0_10px_#34d399]"}`} aria-hidden />
        <p className="min-w-0 flex-1 text-sm sm:text-base" aria-live="polite">
          {publicando
            ? <><span className="font-mono text-xs uppercase tracking-widest text-fixo-cyan-400">Agora · </span><b>{curto(publicando.chat)}</b> está publicando <b>{publicando.o_que}</b> <span className="text-fixo-slate-400">({ha(publicando.inicio, agora)})</span></>
            : <><span className="font-mono text-xs uppercase tracking-widest text-fixo-emerald-400">Agora · </span>Ninguém publicando. Caminho livre.</>}
        </p>
        <div className="flex rounded-full bg-white/10 p-0.5 text-xs font-semibold" role="group" aria-label="Período">
          {(["hoje", "semana"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}
              className={`rounded-full px-3 py-1 ${periodo === p ? "bg-white text-[#0b1020]" : "text-fixo-slate-300 hover:text-white"}`}>{p === "hoje" ? "Hoje" : "7 dias"}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* órbita */}
        <div className="min-w-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full" role="group" aria-label="Mapa dos chats em volta do ERP: toque num chat para ver o que ele está fazendo"
            onMouseLeave={() => setSobre(null)}>
            <defs>
              <radialGradient id="cc-nucleo"><stop offset="0%" stopColor="#a78bfa" /><stop offset="70%" stopColor="#6d28d9" /><stop offset="100%" stopColor="#312e81" /></radialGradient>
            </defs>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#ffffff1f" strokeDasharray="2 6" />
            <circle cx={CX} cy={CY} r={R + 24} fill="none" stroke="#ffffff0f" className="cc-gira" strokeDasharray="1 10" />
            {estado.map((x, i) => {
              const p = pos(i), cor = NEON[x.c.cor] ?? NEON.slate;
              const luz = foco === x.c.id;
              return (
                <line key={`l${x.c.id}`} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={x.publicandoAgora ? "#22d3ee" : cor}
                  strokeOpacity={luz ? 1 : foco ? 0.06 : x.publicandoAgora ? 0.95 : x.aceso ? 0.45 : 0.15} strokeWidth={luz || x.publicandoAgora ? 2.5 : 1}
                  strokeDasharray={x.publicandoAgora || luz ? "6 6" : undefined} className={x.publicandoAgora || luz ? "cc-fluxo" : undefined} />
              );
            })}
            <g className="cc-no" role="button" tabIndex={0} aria-label="ERP Line: limpar a escolha" onClick={() => setEscolhido(null)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEscolhido(null); } }}>
              <circle cx={CX} cy={CY} r={52} fill="url(#cc-nucleo)" />
              <circle className="cc-anel" cx={CX} cy={CY} r={52} fill="none" stroke="#c4b5fd" strokeOpacity=".6" />
              {publicando && <circle cx={CX} cy={CY} r={52} fill="none" stroke="#c4b5fd" strokeOpacity=".6" className="cc-pulso" />}
              <text x={CX} y={CY - 2} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff">ERP Line</text>
              <text x={CX} y={CY + 18} textAnchor="middle" fontSize="12" fill="#ddd6fe">{publicando ? "recebendo…" : "no ar"}</text>
            </g>
            {estado.map((x, i) => {
              const p = pos(i), cor = NEON[x.c.cor] ?? NEON.slate;
              const rotulo = curto(x.c.nome).replace(/ \(.*\)$/, "");
              const luz = foco === x.c.id, apagado = !!foco && !luz;
              const vivo = x.aceso || x.publicandoAgora;
              // nome para fora do círculo: à direita começa no nó, à esquerda termina nele, em cima e embaixo centralizado
              const lado = p.cos > 0.25 ? "start" : p.cos < -0.25 ? "end" : "middle";
              const tx = p.x + p.cos * 24 + (lado === "start" ? 4 : lado === "end" ? -4 : 0);
              const ty = p.y + p.sin * 24 + (lado === "middle" ? (p.sin > 0 ? 10 : -2) : 5);
              const escolher = () => setEscolhido((v) => (v === x.c.id ? null : x.c.id));
              return (
                <g key={x.c.id} className="cc-no" role="button" tabIndex={0} aria-pressed={escolhido === x.c.id}
                  aria-label={`${curto(x.c.nome)}: ${x.publicandoAgora ? "publicando agora" : x.precisa ? "precisa de você" : vivo ? "ativo nas últimas 2 horas" : "parado"}`}
                  opacity={apagado ? 0.35 : 1}
                  onMouseEnter={() => setSobre(x.c.id)} onFocus={() => setSobre(x.c.id)} onBlur={() => setSobre(null)} onClick={escolher}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); escolher(); } }}>
                  <title>{curto(x.c.nome)}</title>
                  {/* área de toque maior que a bolinha */}
                  <circle cx={p.x} cy={p.y} r={26} fill="transparent" />
                  {x.publicandoAgora && <circle cx={p.x} cy={p.y} r={26} fill="#22d3ee" fillOpacity=".25" className="cc-pulso" />}
                  {x.precisa > 0 && <circle cx={p.x} cy={p.y} r={23} fill="none" stroke="#f43f5e" strokeWidth="3" className="cc-pisca" />}
                  <circle className="cc-anel" cx={p.x} cy={p.y} r={luz ? 21 : 17} fill="none" stroke={cor} strokeOpacity={luz ? 0.9 : 0} />
                  <circle className="cc-bola" cx={p.x} cy={p.y} r={luz ? 17 : 14} fill={cor} fillOpacity={vivo || luz ? 1 : 0.35}
                    style={{ filter: vivo || luz ? `drop-shadow(0 0 ${luz ? 12 : 7}px ${cor})` : undefined }} />
                  {x.precisa > 0 && <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#0b1020">{x.precisa}</text>}
                  <text x={tx} y={ty} textAnchor={lado} fontSize={luz ? 16 : 14} fontWeight={luz ? 800 : 600} fill={luz || vivo ? "#f8fafc" : "#94a3b8"}>
                    {rotulo.length > 24 ? `${rotulo.slice(0, 23)}…` : rotulo}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fixo-slate-400">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-fixo-cyan-400" /> publicando</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full ring-2 ring-fixo-rose-500" /> precisa de você</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-fixo-violet-400" /> ativo nas últimas 2 h</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-fixo-violet-400/35" /> parado</span>
            <span className="text-fixo-slate-500">· toque num chat para ver o que ele faz</span>
          </div>
        </div>

        {/* cartão do chat escolhido (ou os números do período) + linha do tempo */}
        <div className="min-w-0 space-y-4">
          {sel ? (() => {
            const cor = NEON[sel.c.cor] ?? NEON.slate;
            const e = sel.entregas.filter((y) => noPeriodo(y.quando));
            const pb = sel.minhas.filter((y) => noPeriodo(y.inicio));
            const url = urlSessao(sel.c.sessao);
            return (
              <section aria-live="polite" className="rounded-2xl border p-4" style={{ borderColor: `${cor}66`, background: `${cor}1a` }}>
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: cor, boxShadow: `0 0 12px ${cor}` }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-white">{curto(sel.c.nome)}</h3>
                    <p className="text-sm text-fixo-slate-300">
                      {sel.publicandoAgora ? <span className="font-semibold text-fixo-cyan-400">Publicando agora</span>
                        : sel.precisa ? <span className="font-semibold text-fixo-rose-400">Precisa de você ({sel.precisa})</span>
                        : sel.ultima ? `Última atividade ${ha(sel.ultima, agora)}` : "Sem atividade registrada"}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEscolhido(null)} className="rounded-full px-2 text-lg leading-none text-fixo-slate-400 hover:text-white" aria-label="Fechar">×</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/5 p-2.5 text-center"><div className="font-mono text-2xl font-bold" style={{ color: cor }}>{e.length}</div><div className="text-2xs text-fixo-slate-400">entregas no código</div></div>
                  <div className="rounded-xl bg-white/5 p-2.5 text-center"><div className="font-mono text-2xl font-bold text-fixo-cyan-400">{pb.length}</div><div className="text-2xs text-fixo-slate-400">publicações</div></div>
                </div>
                {pb.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-fixo-slate-300">
                    {pb.slice(-4).reverse().map((y) => <li key={y.id} className="truncate"><span className="font-mono text-fixo-slate-500">{hora(y.inicio)}</span> · {y.o_que}</li>)}
                  </ul>
                )}
                {url && <a href={url} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0b1020] hover:bg-fixo-slate-200">Abrir o chat ↗</a>}
              </section>
            );
          })() : (
            <div className="grid grid-cols-3 gap-2">
              {[
                { n: pubsPeriodo, t: "publicações", cor: "#22d3ee" },
                { n: entregasPeriodo, t: "entregas no código", cor: "#a78bfa" },
                { n: precisaTotal, t: "precisam de você", cor: precisaTotal ? "#f43f5e" : "#34d399" },
              ].map((k) => (
                <div key={k.t} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                  <div className="font-mono text-2xl font-bold sm:text-3xl" style={{ color: k.cor, textShadow: `0 0 18px ${k.cor}66` }}>{k.n}</div>
                  <div className="text-2xs leading-tight text-fixo-slate-400">{k.t}</div>
                </div>
              ))}
            </div>
          )}
          <LinhaDoTempo estado={estado} ini={ini} fimMs={agora} periodo={periodo} />
        </div>
      </div>

      {/* placar */}
      <div className="grid gap-2 border-t border-white/10 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {estado.map((x) => {
          const cor = NEON[x.c.cor] ?? NEON.slate;
          const e = x.entregas.filter((y) => noPeriodo(y.quando)).length;
          const pb = x.minhas.filter((y) => noPeriodo(y.inicio)).length;
          return (
            <button key={x.c.id} type="button" onClick={() => setEscolhido((v) => (v === x.c.id ? null : x.c.id))} aria-pressed={escolhido === x.c.id}
              onMouseEnter={() => setSobre(x.c.id)} onMouseLeave={() => setSobre(null)}
              className={`linha-clicavel flex min-w-0 items-center gap-3 border px-3 py-2 ${escolhido === x.c.id ? "border-white/40 bg-white/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"}`}>
              <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: cor, boxShadow: `0 0 10px ${cor}` }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{curto(x.c.nome)}</div>
                <div className="truncate text-2xs text-fixo-slate-400">
                  {x.publicandoAgora ? <span className="font-semibold text-fixo-cyan-400">publicando agora</span>
                    : x.precisa ? <span className="font-semibold text-fixo-rose-400">precisa de você</span>
                    : x.ultima ? `última atividade ${ha(x.ultima, agora)}` : "sem atividade registrada"}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono text-xs leading-tight">
                <div style={{ color: cor }}>{e} entr.</div>
                <div className="text-fixo-cyan-400">{pb} publ.</div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="px-4 pb-4 text-2xs text-fixo-slate-500 sm:px-5">
        Entregas: mudanças no código de cada chat, até a última publicação do site. Publicações e "precisa de você": ao vivo.
      </p>
    </div>
  );
}

type Estado = { c: ChatCentral; entregas: EntregaChat[]; minhas: Publicacao[] };

/** Linha do tempo: uma faixa por chat; barra = publicação (do começo ao fim), ponto = entrega no código. */
function LinhaDoTempo({ estado, ini, fimMs, periodo }: { estado: Estado[]; ini: number; fimMs: number; periodo: "hoje" | "semana" }) {
  const W = 320, rotulo = 0, faixa = 18, topo = 14;
  const H = topo + estado.length * faixa + 6;
  const x = (iso: string | number) => {
    const t = typeof iso === "number" ? iso : new Date(iso).getTime();
    return Math.max(0, Math.min(W, ((t - ini) / Math.max(1, fimMs - ini)) * W));
  };
  const marcas = periodo === "hoje"
    ? [0, 6, 12, 18].map((h) => { const d = new Date(ini); d.setHours(h); return { t: d.getTime(), r: `${h}h` }; }).filter((m) => m.t <= fimMs)
    : Array.from({ length: 7 }, (_, i) => { const d = new Date(ini + i * 864e5); d.setHours(0, 0, 0, 0); return { t: d.getTime(), r: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "") }; }).filter((m) => m.t >= ini);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="mb-1 font-mono text-2xs uppercase tracking-widest text-fixo-slate-400">Linha do tempo · {periodo === "hoje" ? "hoje" : "7 dias"}</div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W + 4} ${H}`} className="w-full min-w-[280px]" role="img" aria-label="Publicações e entregas de cada chat no período">
          {marcas.map((m) => (
            <g key={m.t}>
              <line x1={x(m.t)} x2={x(m.t)} y1={topo - 4} y2={H} stroke="#ffffff14" />
              <text x={x(m.t) + 2} y={8} fontSize="7" fill="#64748b">{m.r}</text>
            </g>
          ))}
          {estado.map((s, i) => {
            const y = topo + i * faixa, cor = NEON[s.c.cor] ?? NEON.slate;
            return (
              <g key={s.c.id}>
                <line x1={rotulo} x2={W} y1={y + faixa / 2} y2={y + faixa / 2} stroke="#ffffff0d" />
                <text x={2} y={y + 6} fontSize="6.5" fill={cor} fillOpacity=".75">{curto(s.c.nome).replace(/ \(.*\)$/, "")}</text>
                {s.minhas.filter((p) => new Date(p.fim ?? fimMs).getTime() >= ini).map((p) => (
                  <rect key={p.id} x={x(p.inicio)} y={y + 4} width={Math.max(3, x(p.fim ?? fimMs) - x(p.inicio))} height={faixa - 8} rx={3}
                    fill={p.situacao === "abandonada" ? "#64748b" : "#22d3ee"} fillOpacity={p.situacao === "publicando" ? 1 : 0.8}>
                    <title>{`${p.o_que} · ${hora(p.inicio)}${p.fim ? `–${hora(p.fim)}` : " (publicando)"}`}</title>
                  </rect>
                ))}
                {s.entregas.filter((e) => new Date(e.quando).getTime() >= ini).map((e) => (
                  <circle key={e.hash} cx={x(e.quando)} cy={y + faixa / 2} r={2.6} fill={cor}><title>{`${hora(e.quando)} · ${e.assunto}`}</title></circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-2xs text-fixo-slate-400">
        <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-fixo-cyan-400" /> publicação</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-fixo-violet-400" /> entrega no código (cor do chat)</span>
      </div>
    </div>
  );
}
