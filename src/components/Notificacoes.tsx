// Notificações na tela: pop-up na hora (pagamento recebido, pedido da loja, e-mail novo), o sino com o histórico
// e os avisos entre usuários. Aviso normal aparece no canto; importante e urgente aparecem no meio da tela e pedem "Ciente"
// (o urgente toca de novo até a pessoa confirmar). Quem mandou vê quem já deu ciente. Aviso de uma pessoa pode ser
// respondido: a resposta vai para quem participa da conversa, com a mesma escolha de urgência.
// Aviso dos chats do Claude (tipo "claude", só para a conta master): no meio da tela em roxo, com som próprio que
// repete até o "Ciente", a voz lê o resumo do que é preciso fazer e o botão abre o chat.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, BellRing, Bot, Check, CheckCheck, ChevronLeft, ChevronRight, FileSignature, Mail, Megaphone, Reply, Send, ShoppingBag, Siren, Speaker, Volume2, VolumeX, Wallet, X, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { notify, notifyError } from "@/lib/notify";
import { rotuloPapel, type Papel } from "@/lib/permissoes";
import { lerVerComo } from "@/lib/verComo";
import { Button, Field, Modal, chip, useFecharComEsc } from "@/components/ui";
import { guardarVoz, melhorVoz, nomeVozEscolhida, pontuarVoz, vozesPortugues } from "@/lib/voz";

export type Urgencia = "normal" | "importante" | "urgente";
export type Notificacao = {
  id: number; tipo: string; titulo: string; texto: string | null; link: string | null; created_at: string;
  urgencia?: Urgencia; destinatarios?: string[]; papeis?: string[]; remetente_id?: string | null; remetente_nome?: string | null; exige_ciencia?: boolean;
  conversa_id?: number | null; resposta_de?: number | null;
};
type Ciencia = { notificacao_id: number; user_id: string; ciente_em: string };

const ESTILO: Record<string, { icon: LucideIcon; cor: string }> = {
  pagamento: { icon: Wallet, cor: "var(--kpi-verde)" },
  pedido_loja: { icon: ShoppingBag, cor: "var(--kpi-ciano)" },
  email: { icon: Mail, cor: "var(--kpi-roxo)" },
  proposta: { icon: FileSignature, cor: "var(--kpi-ciano)" },
  claude: { icon: Bot, cor: "var(--kpi-roxo)" },
  outro: { icon: BellRing, cor: "var(--kpi-laranja)" },
};
const NIVEL: Record<Urgencia, { rotulo: string; ajuda: string; icon: LucideIcon; cor: string; faixa: string }> = {
  normal: { rotulo: "Normal", ajuda: "Aparece no canto da tela, com um toque", icon: Megaphone, cor: "var(--kpi-azul)", faixa: "from-fixo-sky-500 to-fixo-blue-600" },
  importante: { rotulo: "Importante", ajuda: "No meio da tela, com som; a pessoa confirma que leu", icon: AlertTriangle, cor: "var(--kpi-laranja)", faixa: "from-fixo-amber-500 to-fixo-orange-600" },
  urgente: { rotulo: "Urgente", ajuda: "No meio da tela, em vermelho; o som repete até a pessoa clicar em Ciente", icon: Siren, cor: "var(--kpi-rosa)", faixa: "from-fixo-red-500 to-fixo-red-700" },
};
const ehClaude = (n: Notificacao) => n.tipo === "claude";
const estiloDe = (n: Notificacao) => ehClaude(n) ? ESTILO.claude : n.remetente_id ? { icon: NIVEL[n.urgencia ?? "normal"].icon, cor: NIVEL[n.urgencia ?? "normal"].cor } : ESTILO[n.tipo] ?? ESTILO.outro;

type Ctx = { lista: Notificacao[]; naoVistas: number; abrirPainel: () => void; novoAviso: (para?: string[]) => void };
const NotifCtx = createContext<Ctx>({ lista: [], naoVistas: 0, abrirPainel: () => {}, novoAviso: () => {} });
export const useNotificacoes = () => useContext(NotifCtx);

const CHAVE_SOM = "erp.avisos.som";
const somLigado = () => { try { return localStorage.getItem(CHAVE_SOM) !== "off"; } catch { return true; } };

/**
 * Som de aviso sem arquivo de áudio: normal = dois toques; importante = três toques subindo; urgente = sirene curta.
 * `sempre`: toca mesmo com o som dos avisos desligado (a tela que chama tem o seu próprio liga/desliga).
 */
export function tocar(nivel: Urgencia = "normal", sempre = false) {
  if (nivel !== "urgente" && !sempre && !somLigado()) return; // urgente toca sempre
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notas = nivel === "urgente" ? [988, 740, 988, 740, 988, 740] : nivel === "importante" ? [660, 880, 1175] : [880, 1320];
    const passo = nivel === "urgente" ? 0.22 : 0.16, vol = nivel === "normal" ? 0.2 : 0.32;
    notas.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * passo;
      o.frequency.value = f; o.type = nivel === "urgente" ? "square" : "sine";
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(nivel === "urgente" ? vol * 0.5 : vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + passo + 0.06);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + passo + 0.1);
    });
    setTimeout(() => ac.close().catch(() => {}), (notas.length * passo + 0.5) * 1000);
  } catch { /* navegador sem áudio */ }
}

const CHAVE_VOZ = "erp.avisos.voz";
const vozLigada = () => { try { return localStorage.getItem(CHAVE_VOZ) !== "off"; } catch { return true; } };

/** Som dos avisos dos chats do Claude: um carrilhão que sobe e desce (diferente dos outros avisos). */
export function tocarClaude() {
  if (!somLigado()) return; // "Desligar o som" na janela do aviso também cala o carrilhão dos chats
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notas = [523, 659, 784, 1047, 784, 1047];
    notas.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.18;
      o.frequency.value = f; o.type = "triangle";
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.55);
    });
    setTimeout(() => ac.close().catch(() => {}), 2000);
  } catch { /* navegador sem áudio */ }
}

/** As vozes do aparelho (no Chrome elas chegam um pouco depois de abrir a página). */
function carregarVozes(): Promise<SpeechSynthesisVoice[]> {
  const ja = window.speechSynthesis.getVoices();
  if (ja.length) return Promise.resolve(ja);
  return new Promise((ok) => {
    const fim = () => ok(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", fim, { once: true });
    setTimeout(fim, 1500);
  });
}

/** Lê o texto em voz alta com a voz mais natural em português do Brasil (ou a escolhida no sino).
 *  O navegador só fala depois de a pessoa ter tocado na tela ao menos uma vez. */
export async function falar(texto: string, nomeVoz = nomeVozEscolhida(), mesmoDesligada = false) {
  try {
    if (!("speechSynthesis" in window) || (!mesmoDesligada && !vozLigada())) return;
    const voz = melhorVoz(await carregarVozes(), nomeVoz);
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = voz?.lang ?? "pt-BR"; u.rate = 1; u.pitch = 1;
    if (voz) u.voice = voz;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* sem voz */ }
}

/** Nome curto da voz (sem "Microsoft" e sem "- Portuguese (Brazil)"). */
const nomeCurtoVoz = (nome: string) => nome.replace(/^Microsoft\s+/i, "").replace(/\s*-\s*Portugu[eê]s?e?\s*\(.*\)$/i, "").replace(/\s*-\s*Portuguese.*$/i, "");

/** Escolher a voz dos avisos e ouvir antes (fica guardado só neste aparelho). */
function EscolherVoz() {
  const [vozes, setVozes] = useState<SpeechSynthesisVoice[]>([]);
  const [nome, setNome] = useState(() => nomeVozEscolhida() ?? "");
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    let vivo = true;
    const ler = () => { if (vivo) setVozes(vozesPortugues(window.speechSynthesis.getVoices())); };
    carregarVozes().then(ler);
    window.speechSynthesis.addEventListener("voiceschanged", ler);
    return () => { vivo = false; window.speechSynthesis.removeEventListener("voiceschanged", ler); };
  }, []);
  if (!vozes.length) return <p className="mb-2 px-1 text-xs text-slate-500">Este aparelho não tem voz em português.</p>;
  const atual = melhorVoz(vozes, nome);
  const semNatural = pontuarVoz(vozes[0]) < 80;
  return (
    <div className="mb-2 rounded-xl bg-violet-50 p-2 dark:bg-violet-500/10">
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Voz dos avisos</span>
          <select className="input h-9 py-1 text-sm" value={atual?.name ?? ""}
            onChange={(e) => { setNome(e.target.value); guardarVoz(e.target.value); falar("Assim fica a voz dos avisos do ERP.", e.target.value, true); }}>
            {vozes.map((v, k) => <option key={v.name} value={v.name}>{nomeCurtoVoz(v.name)}{k === 0 ? " (mais natural)" : ""}</option>)}
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={() => falar("Olá! Este é o aviso do chat do Claude.", atual?.name, true)}><Speaker size={15} /> Ouvir</Button>
      </div>
      {semNatural && <p className="mt-1.5 text-xs text-slate-600">Para uma voz mais natural: no computador, abra o ERP no Microsoft Edge (vozes Francisca e Thalita) ou no Chrome (voz do Google); no iPhone, baixe uma voz "Aprimorada" em Ajustes → Acessibilidade → Conteúdo Falado → Vozes → Português (Brasil).</p>}
    </div>
  );
}

const falarAviso = (n: Notificacao) => { void falar(`${n.titulo}. ${n.texto ?? ""}`); };
const ehExterno = (link: string | null) => !!link && /^https?:\/\//.test(link);
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** "De Fulano · 27/10 10:00", "Você enviou · …" ou só a data (aviso do sistema). */
export function linhaRemetente(n: Pick<Notificacao, "remetente_nome" | "created_at">, souEu: boolean) {
  const quem = souEu ? "Você enviou" : n.remetente_nome ? `De ${n.remetente_nome}` : "";
  return `${quem}${quem ? " · " : ""}${dataHora(n.created_at)}`;
}

/** Tocar num aviso do sino: volta para o meio da tela se falta o meu ciente; sem link e com conversa, abre a
 *  conversa; senão abre o link. */
export function acaoDoHistorico(n: Pick<Notificacao, "conversa_id" | "link">, faltaMeuCiente: boolean): "meio_da_tela" | "conversa" | "abrir" {
  if (faltaMeuCiente) return "meio_da_tela";
  if (n.conversa_id && !n.link) return "conversa";
  return "abrir";
}

/** Aviso embaixo da janela do meio da tela sobre o som que repete (só no urgente e nos chats do Claude). */
export function dicaDoSom(urgente: boolean, claude: boolean, som: boolean) {
  if (urgente) return "O som de urgente repete até você clicar em Ciente.";
  if (!claude) return null;
  return som ? "O som repete a cada 30 segundos até você clicar em Ciente." : "Som desligado.";
}

/** Janela do meio da tela (importante, urgente e chats do Claude), até a pessoa clicar em Ciente. */
function JanelaAviso({ aviso, naFila, podeResponder, som, onAnterior, onProximo, onCiente, onResponder, onCienteEmTodos, onAlternarSom }: {
  aviso: Notificacao; naFila: number; podeResponder: boolean; som: boolean;
  onAnterior: () => void; onProximo: () => void; onCiente: (abrirLink?: boolean) => void; onResponder: () => void;
  onCienteEmTodos: () => void; onAlternarSom: () => void;
}) {
  const claude = ehClaude(aviso);
  const nv = claude
    ? { rotulo: "Chat do Claude", icon: Bot, faixa: "from-fixo-violet-500 to-fixo-violet-700" }
    : NIVEL[aviso.urgencia ?? "importante"];
  const urgente = aviso.urgencia === "urgente";
  const contorno = urgente ? "ring-2 ring-red-500" : claude ? "ring-2 ring-violet-400/70" : "ring-2 ring-amber-400/60";
  const dica = dicaDoSom(urgente, claude, som);
  return (
    <div className="fixed inset-0 z-alerta grid place-items-center bg-ink/60 p-4 backdrop-blur-[3px]" role="alertdialog" aria-modal="true" aria-labelledby="aviso-titulo" aria-describedby="aviso-texto">
      <div className="relative w-full max-w-md">
      {/* no urgente pisca só a borda vermelha em volta; o cartão fica sempre nítido */}
      {urgente && <span className="pointer-events-none absolute -inset-2 rounded-[30px] ring-4 ring-red-500/70 motion-safe:animate-pulse" aria-hidden />}
      <div className={`relative w-full animate-[entrar_.3s_ease-out] overflow-hidden rounded-2xl bg-surface shadow-pop ${contorno}`}>
        <div className={`bg-gradient-to-br ${nv.faixa} px-5 pb-4 pt-5 text-white`}>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider"><nv.icon size={15} /> {nv.rotulo}</span>
            {naFila > 1 && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-white/85">
                <button type="button" onClick={onAnterior} aria-label="Aviso anterior" className="botao-claro h-7 w-7 rounded-full"><ChevronLeft size={16} /></button>
                <span className="num px-1">1 de {naFila}</span>
                <button type="button" onClick={onProximo} aria-label="Próximo aviso" className="botao-claro h-7 w-7 rounded-full"><ChevronRight size={16} /></button>
              </span>
            )}
          </div>
          <h2 id="aviso-titulo" className="mt-3 text-xl font-bold leading-tight [overflow-wrap:anywhere]">{aviso.titulo}</h2>
          <p className="mt-1 text-sm text-white/85">{aviso.remetente_nome ? `De ${aviso.remetente_nome} · ` : ""}{dataHora(aviso.created_at)}</p>
        </div>
        <div className="space-y-4 p-5">
          {aviso.texto && <p id="aviso-texto" className="whitespace-pre-wrap text-sm leading-relaxed text-fg [overflow-wrap:anywhere]">{aviso.texto}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {claude && <Button variant="secondary" onClick={() => falarAviso(aviso)}><Speaker size={16} /> Ouvir de novo</Button>}
            {aviso.link && <Button variant="secondary" onClick={() => onCiente(true)}>{claude ? "Abrir o chat" : "Abrir"}</Button>}
            {podeResponder && <Button variant="secondary" onClick={onResponder}><Reply size={16} /> Responder</Button>}
            <Button onClick={() => onCiente()} autoFocus><Check size={16} /> Ciente</Button>
          </div>
          {naFila > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">Mais {naFila - 1} {naFila === 2 ? "aviso" : "avisos"} esperando</span>
              <Button variant="secondary" tamanho="mini" onClick={onCienteEmTodos}><CheckCheck size={14} /> Ciente em todos ({naFila})</Button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-slate-500">
            {dica && <span>{dica}</span>}
            <button type="button" onClick={onAlternarSom} className="link-discreto inline-flex items-center gap-1">
              {som ? <><VolumeX size={13} /> Desligar o som</> : <><Volume2 size={13} /> Ligar o som</>}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/** Uma linha do histórico do sino: título, quem mandou, quem já deu ciente e o botão de responder. */
function ItemHistorico({ n, souEu, nova, faltaMeuCiente, cientes, podeResponder, onAbrir, onResponder }: {
  n: Notificacao; souEu: boolean; nova: boolean; faltaMeuCiente: boolean; cientes: number; podeResponder: boolean;
  onAbrir: () => void; onResponder: () => void;
}) {
  const e = estiloDe(n);
  const total = n.destinatarios?.length ?? 0;
  const todosCientes = !!total && cientes >= total;
  const verConversa = souEu && !!n.conversa_id;
  return (
    <li className="flex items-start gap-1">
      <button type="button" onClick={onAbrir} className="linha-clicavel flex min-w-0 flex-1 items-start gap-3 p-2">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${e.cor} 18%, transparent)`, color: e.cor }}><e.icon size={17} /></span>
        <span className="min-w-0 flex-1">
          {n.urgencia && n.urgencia !== "normal" && (
            <span className="mb-0.5 inline-block rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-white" style={{ background: NIVEL[n.urgencia].cor }}>{NIVEL[n.urgencia].rotulo}</span>
          )}
          <span className={`block text-sm leading-tight ${nova ? "font-bold text-fg" : "font-semibold text-slate-700"}`}>{n.titulo}</span>
          {n.texto && <span className="block truncate text-xs text-slate-500">{n.texto}</span>}
          <span className="block text-2xs text-slate-400">{linhaRemetente(n, souEu)}</span>
          {souEu && n.exige_ciencia && (
            <span className={`mt-0.5 block text-2xs font-semibold ${todosCientes ? "text-emerald-600" : "text-amber-600"}`}>
              ✓ {cientes}{total ? ` de ${total}` : ""} {cientes === 1 ? "ciente" : "cientes"}
            </span>
          )}
          {faltaMeuCiente && <span className="mt-0.5 block text-2xs font-semibold text-red-600">Falta o seu ciente</span>}
        </span>
      </button>
      {(podeResponder || verConversa) && (
        <button type="button" onClick={onResponder} aria-label={`Responder: ${n.titulo}`} title={podeResponder ? "Responder" : "Ver a conversa"}
          className="botao-icone mt-1.5 p-2 text-brand"><Reply size={16} /></button>
      )}
    </li>
  );
}

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const perfil = usePerfil();
  const eu = perfil.user_id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [popups, setPopups] = useState<Notificacao[]>([]);
  const [centro, setCentro] = useState<Notificacao[]>([]); // importantes e urgentes esperando "Ciente"
  const [painel, setPainel] = useState(false);
  useFecharComEsc(painel, () => setPainel(false));
  const [compor, setCompor] = useState<string[] | null>(null); // aberto: para quem (vazio = escolher)
  const [responderA, setResponderA] = useState<Notificacao | null>(null);
  const [som, setSom] = useState(somLigado);
  const [voz, setVoz] = useState(vozLigada);
  const vistos = useRef(new Set<number>());
  const pendentesVistos = useRef(false);

  // aviso para pessoas escolhidas só aparece para elas (o administrador vê no banco, mas não recebe o pop-up dos outros)
  const paraMim = (n: Notificacao) => !n.destinatarios?.length || n.destinatarios.includes(eu);
  const meu = (n: Notificacao) => !!eu && n.remetente_id === eu;
  // aviso de uma pessoa (não do sistema) que não fui eu que mandei: dá para responder
  const respondivel = (n: Notificacao) => !!n.remetente_id && !meu(n);
  const responder = (n: Notificacao) => { setPopups((p) => p.filter((x) => x.id !== n.id)); setPainel(false); setResponderA(n); };

  const { data: todas = [] } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: async () => {
      // 200: os avisos dos chats (muitos por dia) não podem empurrar as mensagens da equipe para fora
      const { data, error } = await supabase.from("notificacoes").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Notificacao[];
    },
    refetchInterval: 60_000, // segurança caso a conexão em tempo real caia
  });
  // "Ver como": o banco lê com o login da dona, então aqui fica só o que a pessoa simulada receberia (pedido de 27/10):
  // as mensagens para ela e os avisos do papel dela; nada dos chats do Claude nem de Segurança
  const verComo = lerVerComo();
  const daPessoa = (n: Notificacao) => !verComo || (n.destinatarios?.length
    ? !!verComo.user_id && n.destinatarios.includes(verComo.user_id)
    : !ehClaude(n) && !n.titulo.startsWith("Segurança:") && (!n.papeis?.length || perfil.tem(...(n.papeis as Papel[]))));
  const minhas = useMemo(() => todas.filter((n) => (paraMim(n) || meu(n)) && daPessoa(n)), [todas, eu]); // eslint-disable-line react-hooks/exhaustive-deps
  // o sino é só a conversa com a equipe e os avisos do trabalho: os dos chats do Claude e os de Segurança aparecem só no
  // meio da tela de quem os recebe (pedido de 27/10), não na lista
  const lista = useMemo(() => minhas.filter((n) => !ehClaude(n) && !n.titulo.startsWith("Segurança:")).slice(0, 40), [minhas]);
  const idsAvisos = minhas.filter((n) => n.exige_ciencia).map((n) => n.id);
  const { data: ciencias = [], isFetched: cienciasLidas } = useQuery({
    queryKey: ["notificacoes_ciencia", idsAvisos.join(",")],
    enabled: idsAvisos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("notificacoes_ciencia").select("notificacao_id, user_id, ciente_em").in("notificacao_id", idsAvisos);
      if (error) throw error;
      return data as Ciencia[];
    },
  });
  const { data: dadosEu } = useQuery({
    queryKey: ["usuarios_erp", "vistas", eu],
    queryFn: async () => (await supabase.from("usuarios_erp").select("notificacoes_vistas_em").eq("user_id", eu).single()).data,
  });
  const vistasEm = dadosEu?.notificacoes_vistas_em ?? new Date().toISOString();
  const naoVistas = lista.filter((n) => n.created_at > vistasEm && !meu(n)).length;
  const jaCiente = (n: Notificacao) => ciencias.some((c) => c.notificacao_id === n.id && c.user_id === eu);
  const faltaMeuCiente = (n: Notificacao) => !!n.exige_ciencia && paraMim(n) && !meu(n) && !jaCiente(n);

  // importante ou urgente que chegou enquanto a pessoa estava fora: aparece no meio da tela ao entrar (últimos 7 dias)
  useEffect(() => {
    if (pendentesVistos.current || !eu || !todas.length || (idsAvisos.length > 0 && !cienciasLidas)) return;
    pendentesVistos.current = true;
    const limite = new Date(Date.now() - 7 * 864e5).toISOString();
    const pendentes = minhas.filter((n) => n.exige_ciencia && paraMim(n) && !(meu(n) && !n.destinatarios?.includes(eu)) && !jaCiente(n) && n.created_at > limite);
    if (pendentes.length) {
      setCentro(pendentes.reverse());
      const claude = pendentes.find(ehClaude);
      if (claude) { tocarClaude(); falarAviso(claude); } else tocar(pendentes.some((n) => n.urgencia === "urgente") ? "urgente" : "importante");
    }
  }, [todas, cienciasLidas, eu]); // eslint-disable-line react-hooks/exhaustive-deps

  // aviso de um chat do Claude: o carrilhão repete a cada 30 segundos (até 5 minutos) enquanto não clicar em Ciente
  const claudeAberto = !!centro[0] && ehClaude(centro[0]);
  useEffect(() => {
    if (!claudeAberto) return;
    let n = 0;
    const t = setInterval(() => { if (++n > 10) clearInterval(t); else tocarClaude(); }, 30_000);
    return () => clearInterval(t);
  }, [claudeAberto, centro[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // urgente: a sirene repete a cada 4 segundos (até 2 minutos) enquanto não clicar em Ciente
  const urgenteAberto = centro[0]?.urgencia === "urgente";
  useEffect(() => {
    if (!urgenteAberto) return;
    let n = 0;
    const t = setInterval(() => { if (++n > 30) clearInterval(t); else tocar("urgente"); }, 4000);
    return () => clearInterval(t);
  }, [urgenteAberto, centro[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function mostrar(n: Notificacao) {
    if (vistos.current.has(n.id)) return;
    vistos.current.add(n.id);
    if (!paraMim(n) || (meu(n) && !n.destinatarios?.includes(eu))) return; // o próprio aviso para os outros não aparece para quem mandou
    const nivel = n.urgencia ?? "normal";
    if (ehClaude(n)) {
      setCentro((c) => [n, ...c.filter((x) => x.id !== n.id)]);
      tocarClaude();
      falarAviso(n);
    } else if (nivel !== "normal") {
      setCentro((c) => [...c.filter((x) => x.id !== n.id), n]);
      tocar(nivel);
    } else {
      // no celular o pop-up cobre o topo da tela: um de cada vez e por menos tempo (o histórico fica no sino)
      const celular = window.matchMedia("(max-width: 767px)").matches;
      setPopups((p) => [n, ...p].slice(0, celular ? 1 : 3));
      tocar("normal");
      setTimeout(() => setPopups((p) => p.filter((x) => x.id !== n.id)), celular ? 6_000 : 12_000);
    }
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(n.titulo, { body: [n.remetente_nome && `De ${n.remetente_nome}`, n.texto].filter(Boolean).join(" · "), icon: "/logo-192.png", tag: `erp-${n.id}`, requireInteraction: nivel === "urgente" || ehClaude(n) }); } catch { /* sem suporte */ }
    }
  }

  // Tempo real: cada notificação nova (que a pessoa pode ver) aparece na hora
  useEffect(() => {
    todas.forEach((n) => vistos.current.add(n.id)); // as que já existiam não viram pop-up
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
  }, [todas.length > 0, eu]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrirPainel() {
    setPainel(true);
    await supabase.rpc("marcar_notificacoes_vistas");
    setTimeout(() => qc.invalidateQueries({ queryKey: ["usuarios_erp", "vistas"] }), 1500);
  }
  const irPara = (link: string) => (ehExterno(link) ? window.open(link, "_blank", "noopener") : navigate(link));
  const abrir = (n: Notificacao) => { setPopups((p) => p.filter((x) => x.id !== n.id)); setPainel(false); if (n.link) irPara(n.link); };
  function abrirDoHistorico(n: Notificacao) {
    const acao = acaoDoHistorico(n, faltaMeuCiente(n));
    if (acao === "meio_da_tela") setCentro((c) => [n, ...c.filter((x) => x.id !== n.id)]);
    else if (acao === "conversa") setResponderA(n);
    else abrir(n);
  }
  async function ciente(n: Notificacao, abrirLink?: boolean) {
    setCentro((c) => c.filter((x) => x.id !== n.id));
    if (n.exige_ciencia) {
      const { error } = await supabase.rpc("ciente_aviso", { p_id: n.id });
      if (error) notifyError(error);
      qc.invalidateQueries({ queryKey: ["notificacoes_ciencia"] });
    }
    if (abrirLink && n.link) { setPainel(false); irPara(n.link); }
  }
  // controle da fila do meio da tela (24/10): passar para o próximo ou o anterior sem fechar, e "Ciente em todos"
  const proximo = () => setCentro((c) => (c.length > 1 ? [...c.slice(1), c[0]] : c));
  const anterior = () => setCentro((c) => (c.length > 1 ? [c[c.length - 1], ...c.slice(0, -1)] : c));
  async function cienteEmTodos() {
    const todosAvisos = centro;
    setCentro([]);
    const erros = (await Promise.all(todosAvisos.filter((n) => n.exige_ciencia)
      .map((n) => supabase.rpc("ciente_aviso", { p_id: n.id })))).filter((r) => r.error);
    if (erros.length) notifyError(erros[0].error);
    qc.invalidateQueries({ queryKey: ["notificacoes_ciencia"] });
  }
  function alternarVoz() {
    const nova = !voz;
    try { localStorage.setItem(CHAVE_VOZ, nova ? "on" : "off"); } catch { /* sem armazenamento */ }
    setVoz(nova);
    if (nova) falar("Voz dos avisos dos chats ligada.");
  }
  function alternarSom() {
    const novo = !som;
    try { localStorage.setItem(CHAVE_SOM, novo ? "on" : "off"); } catch { /* sem armazenamento */ }
    setSom(novo);
    if (novo) tocar("normal");
  }

  // a conversa de resposta ou a janela de novo aviso aberta: o aviso do meio da tela espera (senão ficava por cima e não dava para escrever)
  const atual = responderA || compor ? undefined : centro[0];
  return (
    <NotifCtx.Provider value={{ lista, naoVistas, abrirPainel, novoAviso: (para) => setCompor(para ?? []) }}>
      {children}

      {/* Pop-ups do canto (normal) */}
      <div className="pointer-events-none fixed inset-x-3 top-[70px] z-flutuante flex flex-col items-end gap-2 md:inset-x-auto md:right-5 md:top-5" aria-live="assertive">
        {popups.map((n) => {
          const e = estiloDe(n);
          return (
            <div key={n.id} role="alert"
              className="pointer-events-auto flex w-full max-w-sm animate-[entrar_.35s_ease-out] items-center gap-2.5 rounded-2xl border bg-surface p-2.5 shadow-pop md:items-start md:gap-3 md:p-4"
              style={{ borderColor: `color-mix(in srgb, ${e.cor} 45%, transparent)`, boxShadow: `0 18px 40px -18px ${e.cor}` }}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl md:h-11 md:w-11" style={{ background: `color-mix(in srgb, ${e.cor} 20%, transparent)`, color: e.cor }}><e.icon size={20} /></span>
              <div className="min-w-0 flex-1">
                {/* no celular a linha toda é o botão de abrir; no computador fica o "Abrir →" */}
                <button type="button" disabled={!n.link} onClick={() => abrir(n)} className="block w-full min-w-0 text-left disabled:cursor-default md:pointer-events-none">
                  {n.remetente_nome && <span className="block text-xs font-semibold text-slate-500">De {n.remetente_nome}</span>}
                  <span className="block truncate text-sm font-bold leading-tight text-fg md:whitespace-normal md:text-sm">{n.titulo}</span>
                  {n.texto && <span className="mt-0.5 block truncate text-xs text-slate-600 md:line-clamp-2 md:whitespace-normal md:text-sm">{n.texto}</span>}
                </button>
                <span className="flex flex-wrap gap-x-4">
                  {n.link && <button type="button" onClick={() => abrir(n)} className="link-acao mt-2 hidden text-sm md:inline">Abrir →</button>}
                  {respondivel(n) && <button type="button" onClick={() => responder(n)} className="link-acao mt-1.5 inline-flex items-center gap-1 text-sm md:mt-2"><Reply size={14} /> Responder</button>}
                </span>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setPopups((p) => p.filter((x) => x.id !== n.id))} className="botao-icone p-1"><X size={16} /></button>
            </div>
          );
        })}
      </div>

      {/* Importante e urgente: no meio da tela, até clicar em Ciente */}
      {atual && (
        <JanelaAviso aviso={atual} naFila={centro.length} podeResponder={respondivel(atual)} som={som}
          onAnterior={anterior} onProximo={proximo} onCiente={(abrirLink) => ciente(atual, abrirLink)}
          onResponder={() => { ciente(atual); setResponderA(atual); }} onCienteEmTodos={cienteEmTodos} onAlternarSom={alternarSom} />
      )}

      {/* Histórico */}
      {painel && (
        <div role="presentation" className="fixed inset-0 z-sobre-janela bg-ink/40 backdrop-blur-[1px]" onClick={() => setPainel(false)}>
          <div className="cartao absolute inset-x-3 top-[70px] max-h-[75vh] overflow-y-auto p-3 shadow-pop md:left-auto md:right-5 md:top-5 md:w-96"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="font-bold text-fg">Notificações</span>
              <span className="flex items-center gap-1">
                <button type="button" onClick={alternarSom} title={som ? "Som dos avisos ligado (o urgente toca sempre)" : "Som dos avisos desligado (o urgente toca sempre)"}
                  aria-label={som ? "Desligar o som dos avisos" : "Ligar o som dos avisos"} className="botao-icone">
                  {som ? <Volume2 size={17} /> : <VolumeX size={17} />}
                </button>
                <button type="button" onClick={alternarVoz} title={voz ? "Voz dos avisos dos chats ligada" : "Voz dos avisos dos chats desligada"}
                  aria-label={voz ? "Desligar a voz dos avisos dos chats" : "Ligar a voz dos avisos dos chats"} aria-pressed={voz}
                  className={`botao-icone ${voz ? "text-violet-600" : "text-slate-400"}`}>
                  <Speaker size={17} />
                </button>
                <button type="button" aria-label="Fechar" onClick={() => setPainel(false)} className="botao-icone p-1"><X size={18} /></button>
              </span>
            </div>
            {voz && <EscolherVoz />}
            <button type="button" onClick={() => { setPainel(false); setCompor([]); }}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-bold text-brand-fg shadow-sm hover:brightness-110">
              <Send size={16} /> Enviar aviso para a equipe
            </button>
            {"Notification" in window && Notification.permission === "default" && (
              <button type="button" onClick={() => Notification.requestPermission()} className="mb-2 w-full rounded-xl bg-brand-light px-3 py-2 text-left text-sm font-semibold text-fg">
                🔔 Avisar também quando o ERP estiver minimizado
              </button>
            )}
            {lista.length ? (
              <ul className="space-y-1">
                {lista.map((n) => (
                  <ItemHistorico key={n.id} n={n} souEu={meu(n)} nova={n.created_at > vistasEm && !meu(n)} faltaMeuCiente={faltaMeuCiente(n)}
                    cientes={ciencias.filter((c) => c.notificacao_id === n.id).length} podeResponder={respondivel(n)}
                    onAbrir={() => abrirDoHistorico(n)} onResponder={() => responder(n)} />
                ))}
              </ul>
            ) : <p className="p-6 text-center text-sm text-slate-500">Nada por aqui ainda.</p>}
          </div>
        </div>
      )}

      {compor && <NovoAviso paraInicial={compor} onClose={() => setCompor(null)} />}
      {responderA && <ResponderAviso aviso={responderA} onClose={() => setResponderA(null)} />}
    </NotifCtx.Provider>
  );
}

/** Escrever um aviso: para pessoas, para um perfil ou para todos, com o nível de urgência. */
function NovoAviso({ paraInicial = [], onClose }: { paraInicial?: string[]; onClose: () => void }) {
  const { user_id: eu } = usePerfil();
  const local = useLocation();
  const qc = useQueryClient();
  const { data: usuarios = [] } = useQuery({
    queryKey: ["usuarios_para_aviso"],
    queryFn: async () => { const { data, error } = await supabase.rpc("usuarios_para_aviso"); if (error) throw error; return (data ?? []) as { user_id: string; nome: string; papel: string }[]; },
  });
  const [modo, setModo] = useState<"pessoas" | "perfil" | "todos">("pessoas");
  const [pessoas, setPessoas] = useState<string[]>(paraInicial);
  const [perfil, setPerfil] = useState("");
  const [urgencia, setUrgencia] = useState<Urgencia>("normal");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [ligar, setLigar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const perfis = [...new Set(usuarios.map((u) => u.papel))].filter(Boolean);
  const qtd = modo === "pessoas" ? pessoas.length : modo === "perfil" ? usuarios.filter((u) => u.papel === perfil || u.papel === "admin").length : usuarios.length;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (modo === "pessoas" && !pessoas.length) return notifyError(new Error("Escolha pelo menos uma pessoa"));
    if (modo === "perfil" && !perfil) return notifyError(new Error("Escolha o perfil"));
    setEnviando(true);
    const { error } = await supabase.rpc("enviar_aviso", {
      p_titulo: titulo, p_texto: texto || null, p_urgencia: urgencia,
      p_para: modo === "pessoas" ? pessoas : [], p_papeis: modo === "perfil" ? [perfil] : [], p_link: ligar ? local.pathname : null,
    });
    setEnviando(false);
    if (error) return notifyError(error);
    notify(urgencia === "normal" ? "Aviso enviado" : `Aviso ${NIVEL[urgencia].rotulo.toLowerCase()} enviado: você vê no sino quem deu ciente`);
    qc.invalidateQueries({ queryKey: ["notificacoes"] });
    onClose();
  }

  const aba = (v: typeof modo, rotulo: string) => (
    <button type="button" onClick={() => setModo(v)} aria-pressed={modo === v}
      className={chip(modo === v)}>{rotulo}</button>
  );
  return (
    <Modal open onClose={onClose} title="Enviar aviso">
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <div className="mb-1.5 text-xs font-semibold text-slate-600">Para quem</div>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 p-1">{aba("pessoas", "Pessoas")}{aba("perfil", "Um perfil")}{aba("todos", "Todos")}</div>
          {modo === "pessoas" && (
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {usuarios.map((u) => (
                <label key={u.user_id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${pessoas.includes(u.user_id) ? "border-brand bg-brand-light" : "border-slate-200 hover:bg-slate-50"}`}>
                  <input type="checkbox" className="h-4 w-4" checked={pessoas.includes(u.user_id)} onChange={(e) => setPessoas(e.target.checked ? [...pessoas, u.user_id] : pessoas.filter((x) => x !== u.user_id))} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-fg">{u.nome}{u.user_id === eu ? " (você)" : ""}</span>
                  <span className="shrink-0 text-xs text-slate-500">{rotuloPapel(u.papel)}</span>
                </label>
              ))}
            </div>
          )}
          {modo === "perfil" && (
            <select className="input mt-2" value={perfil} onChange={(e) => setPerfil(e.target.value)} aria-label="Perfil">
              <option value="">Escolha o perfil…</option>
              {perfis.filter((p) => p !== "admin").map((p) => <option key={p} value={p}>{rotuloPapel(p)}</option>)}
            </select>
          )}
          {modo === "todos" && <p className="mt-2 text-sm text-slate-600">Todas as {usuarios.length} pessoas que usam o ERP recebem.</p>}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold text-slate-600">Urgência</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(NIVEL) as Urgencia[]).map((k) => {
              const nv = NIVEL[k];
              const ativo = urgencia === k;
              return (
                <button key={k} type="button" onClick={() => { setUrgencia(k); tocar(k); }} aria-pressed={ativo}
                  className={`rounded-2xl border-2 p-3 text-left transition ${ativo ? "shadow-card" : "border-slate-200 opacity-80 hover:opacity-100"}`}
                  style={ativo ? { borderColor: nv.cor, background: `color-mix(in srgb, ${nv.cor} 12%, transparent)` } : undefined}>
                  <span className="flex items-center gap-1.5 font-bold" style={{ color: nv.cor }}><nv.icon size={17} /> {nv.rotulo}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-600">{nv.ajuda}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Toque num nível para ouvir o som.</p>
        </div>

        <Field label="Aviso"><input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={140} placeholder="Ex.: Cliente esperando retorno da OS 15" /></Field>
        <Field label="Detalhes (opcional)"><textarea className="input min-h-[90px]" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={ligar} onChange={(e) => setLigar(e.target.checked)} /> Ligar a esta tela (quem receber abre direto aqui)</label>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">{qtd} {qtd === 1 ? "pessoa recebe" : "pessoas recebem"}</span>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={enviando}><Send size={16} /> {enviando ? "Enviando…" : "Enviar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Conversa de um aviso (a primeira mensagem e as respostas que eu posso ver) e a caixa para responder. */
function ResponderAviso({ aviso, onClose }: { aviso: Notificacao; onClose: () => void }) {
  const { user_id: eu } = usePerfil();
  const qc = useQueryClient();
  const raiz = aviso.conversa_id ?? aviso.id;
  const { data: conversa = [aviso] } = useQuery({
    queryKey: ["notificacoes", "conversa", raiz],
    queryFn: async () => {
      const { data, error } = await supabase.from("notificacoes").select("*").or(`id.eq.${raiz},conversa_id.eq.${raiz}`).order("created_at").limit(100);
      if (error) throw error;
      return (data?.length ? data : [aviso]) as Notificacao[];
    },
  });
  // responde à última mensagem de outra pessoa (assim a resposta chega a todos que já participaram)
  const alvo = [...conversa].reverse().find((n) => n.remetente_id && n.remetente_id !== eu) ?? (aviso.remetente_id !== eu ? aviso : null);
  const [texto, setTexto] = useState("");
  const [urgencia, setUrgencia] = useState<Urgencia>("normal");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!alvo) return;
    setEnviando(true);
    const { error } = await supabase.rpc("responder_aviso", { p_id: alvo.id, p_texto: texto, p_urgencia: urgencia });
    setEnviando(false);
    if (error) return notifyError(error);
    notify(urgencia === "normal" ? "Resposta enviada" : `Resposta ${NIVEL[urgencia].rotulo.toLowerCase()} enviada: você vê no sino quem deu ciente`);
    qc.invalidateQueries({ queryKey: ["notificacoes"] });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Conversa: ${aviso.titulo.replace(/^(Re: )+/, "")}`}>
      <div className="space-y-4">
        <ol className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
          {conversa.map((n) => {
            const minha = n.remetente_id === eu;
            const nv = n.urgencia && n.urgencia !== "normal" ? NIVEL[n.urgencia] : null;
            return (
              <li key={n.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${minha ? "bg-brand-light" : "bg-slate-100"}`}>
                  <div className="text-2xs font-semibold text-slate-500">
                    {minha ? "Você" : n.remetente_nome ?? "ERP"} · {new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {nv && <span className="ml-1 rounded-full px-1.5 py-px text-2xs font-bold uppercase text-white" style={{ background: nv.cor }}>{nv.rotulo}</span>}
                  </div>
                  {!n.resposta_de && <div className="text-sm font-bold text-fg [overflow-wrap:anywhere]">{n.titulo}</div>}
                  {n.texto && <p className="whitespace-pre-wrap text-sm text-fg [overflow-wrap:anywhere]">{n.texto}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        {alvo ? (
          <form onSubmit={enviar} className="space-y-3">
            <Field label={`Responder para ${alvo.remetente_nome ?? "quem mandou"}${(alvo.destinatarios?.length ?? 0) > 1 ? " e quem participa" : ""}`}>
              <textarea className="input min-h-[80px]" value={texto} onChange={(e) => setTexto(e.target.value)} required maxLength={2000} autoFocus />
            </Field>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Urgência">
              {(Object.keys(NIVEL) as Urgencia[]).map((k) => (
                <button key={k} type="button" aria-pressed={urgencia === k} onClick={() => { setUrgencia(k); tocar(k); }}
                  className={chip(urgencia === k, "bg-surface")}
                  style={urgencia === k ? { borderColor: NIVEL[k].cor, color: NIVEL[k].cor } : undefined}>
                  {(() => { const I = NIVEL[k].icon; return <I size={14} />; })()} {NIVEL[k].rotulo}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
              <Button disabled={enviando || !texto.trim()}><Send size={16} /> {enviando ? "Enviando…" : "Responder"}</Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Ainda ninguém respondeu este aviso.</p>
        )}
      </div>
    </Modal>
  );
}

/** Sino com o número de notificações novas. */
export function Sino({ claro }: { claro?: boolean }) {
  const { naoVistas, abrirPainel } = useNotificacoes();
  return (
    <button type="button" onClick={abrirPainel} aria-label={naoVistas ? `${naoVistas} notificações novas` : "Notificações"}
      className={`botao-icone relative h-9 w-9 rounded-full ${claro ? "text-slate-600 hover:bg-slate-100" : "text-white hover:bg-white/10"}`}>
      <Bell size={19} />
      {naoVistas > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-solido-vermelho px-1 text-2xs font-bold text-white">{naoVistas > 9 ? "9+" : naoVistas}</span>}
    </button>
  );
}
