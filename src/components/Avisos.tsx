// Avisos automáticos: "Meus avisos" (cada pessoa conecta o Telegram) e o painel do admin em Configurações.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ExternalLink, Mail, RefreshCw, Send, Smartphone } from "lucide-react";
import { Badge, Button, Field, Modal, Tabs } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { callFunction, DEMO, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import {
  EXEMPLOS, htmlEmail, mensagemCliente, PAPEL_ROTULO, textoTelegram, type Aviso, type AvisoTipo, type Empresa,
} from "@/lib/avisos";

function useTipos() {
  return useQuery({
    queryKey: ["avisos_tipos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avisos_tipos").select("*").order("ordem", { ascending: true });
      if (error) throw error;
      return data as AvisoTipo[];
    },
  });
}

function useEmpresa() {
  return useQuery({
    queryKey: ["configuracoes", "avisos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").eq("id", 1).single();
      if (error) throw error;
      return data as Record<string, any>;
    },
  });
}

const empresaDe = (c: Record<string, any> | undefined): Empresa => ({
  nome: c?.nome_fantasia || c?.razao_social || "MF Máquinas", telefone: c?.telefone, whatsapp: c?.whatsapp,
  email: c?.email, endereco: c?.endereco, municipio: c?.municipio, uf: c?.uf,
});

function Interruptor({ ligado, onChange, rotulo, disabled }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} disabled={disabled} onClick={() => onChange(!ligado)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${ligado ? "bg-brand" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${ligado ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** Como o aviso chega: bolha do Telegram ou o e-mail de verdade. */
export function PreviaAviso({ tipo, nome, papel, empresa }: { tipo: string; nome?: string; papel?: string; empresa: Empresa }) {
  const dados = EXEMPLOS[tipo] ?? {};
  if (tipo.startsWith("cli_")) {
    const m = mensagemCliente(tipo, dados, empresa);
    return (
      <div>
        <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">Assunto:</span> <b className="text-fg">{m.assunto}</b></div>
        <iframe title="Exemplo do e-mail" sandbox="" srcDoc={htmlEmail(m, empresa, "#")} className="h-[560px] w-full rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }
  const html = textoTelegram(tipo, dados, { nome, papel, site: "https://erp" }).replace(/\n/g, "<br>");
  return (
    <div className="rounded-2xl bg-[#0e1621] p-4">
      {/* conteúdo vem dos modelos com os valores já escapados */}
      <div className="max-w-[340px] rounded-2xl rounded-bl-md bg-[#182533] px-3.5 py-2.5 text-[15px] leading-snug text-[#f5f5f5] [&_a]:text-[#6ab3f3] [&_b]:font-bold"
        dangerouslySetInnerHTML={{ __html: html }} />
      <div className="mt-1.5 pl-1 text-xs text-[#6d7f8f]">Robô MF Máquinas · Telegram</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Meus avisos (qualquer pessoa da equipe)
// ---------------------------------------------------------------------
export function MeusAvisos({ onClose }: { onClose: () => void }) {
  const perfil = usePerfil();
  const qc = useQueryClient();
  const { data: tipos = [] } = useTipos();
  const { data: cfg } = useEmpresa();
  const [esperando, setEsperando] = useState(false);
  const eu = useQuery({
    queryKey: ["usuarios_erp", "eu", perfil.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios_erp").select("*").eq("user_id", perfil.user_id).single();
      if (error) throw error;
      return data as { telegram_chat_id: number | null; avisos: Record<string, boolean> | null };
    },
    refetchInterval: (q) => (esperando && !q.state.data?.telegram_chat_id ? 3000 : false),
  });
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [previa, setPrevia] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (eu.data) setPrefs(eu.data.avisos ?? {}); }, [eu.data]);
  const conectado = !!eu.data?.telegram_chat_id;
  useEffect(() => { if (conectado && esperando) { setEsperando(false); notify("Telegram conectado!"); } }, [conectado, esperando]);

  const meus = tipos.filter((t) => t.publico === "equipe" && (perfil.papel === "admin" || t.papeis.includes(perfil.papel)));
  const robo: string | null = cfg?.telegram_bot ?? null;

  async function conectar() {
    setOcupado(true);
    try {
      const { data: token, error } = await supabase.rpc("telegram_gerar_vinculo");
      if (error) throw error;
      if (DEMO) notify("Na demonstração a conexão é simulada");
      else window.open(`https://t.me/${robo}?start=${token}`, "_blank", "noopener");
      setEsperando(true);
      eu.refetch();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  async function desconectar() {
    const { error } = await supabase.rpc("telegram_desconectar");
    if (error) return notifyError(error);
    qc.invalidateQueries({ queryKey: ["usuarios_erp"] });
    notify("Telegram desconectado");
  }
  async function teste() {
    setOcupado(true);
    try { await callFunction("avisos-config", { acao: "telegram_teste" }); notify("Mensagem de teste enviada: veja no Telegram"); }
    catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  async function alternar(tipo: string, v: boolean) {
    const novo = { ...prefs, [tipo]: v };
    setPrefs(novo);
    const { error } = await supabase.rpc("salvar_meus_avisos", { p_avisos: novo });
    if (error) notifyError(error);
  }

  return (
    <Modal open onClose={onClose} title="Meus avisos no celular">
      <div className="space-y-5">
        <div className={`rounded-2xl border p-4 ${conectado ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-start gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${conectado ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
              {conectado ? <Check size={22} /> : <Send size={20} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold text-fg">{conectado ? "Telegram conectado" : "Receber avisos no Telegram"}</div>
              <p className="mt-0.5 text-sm text-slate-600">
                {conectado
                  ? "Os avisos marcados abaixo chegam no seu Telegram, como uma mensagem normal."
                  : robo
                    ? "Toque em conectar: o Telegram abre com o robô da MF. Toque em INICIAR e pronto."
                    : "O administrador ainda não ligou o robô do Telegram (Configurações → Avisos automáticos)."}
              </p>
              {esperando && !conectado && (
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-sky-700">
                  <RefreshCw size={15} className="animate-spin" /> Esperando você tocar em INICIAR no Telegram…
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {conectado ? (
                  <>
                    <Button type="button" variant="secondary" disabled={ocupado} onClick={teste}><Send size={16} /> Enviar teste</Button>
                    <Button type="button" variant="ghost" onClick={desconectar}>Desconectar</Button>
                  </>
                ) : (
                  <Button type="button" disabled={!robo || ocupado} onClick={conectar}><Smartphone size={17} /> {esperando ? "Abrir de novo" : "Conectar meu Telegram"}</Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-bold text-fg">O que eu quero receber</div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {meus.map((t) => (
              <li key={t.tipo} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-fg">{t.titulo}</div>
                    <div className="text-sm text-slate-500">{t.ativo ? t.descricao : "Desligado pelo administrador"}</div>
                    <button type="button" onClick={() => setPrevia(previa === t.tipo ? null : t.tipo)} className="mt-1 text-xs font-semibold text-brand hover:underline">
                      {previa === t.tipo ? "Fechar exemplo" : "Ver exemplo"}
                    </button>
                  </div>
                  <Interruptor rotulo={t.titulo} ligado={t.ativo && prefs[t.tipo] !== false} disabled={!t.ativo} onChange={(v) => alternar(t.tipo, v)} />
                </div>
                {previa === t.tipo && <div className="mt-3"><PreviaAviso tipo={t.tipo} nome={perfil.nome} papel={perfil.papel} empresa={empresaDe(cfg)} /></div>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Configurações → Avisos automáticos (admin)
// ---------------------------------------------------------------------
type Status = { robo: string | null; webhook: boolean; conectados: number; erro: string | null; email: boolean };

export function AvisosConfig() {
  const perfil = usePerfil();
  const qc = useQueryClient();
  const [aba, setAba] = useState<"equipe" | "clientes" | "historico">("equipe");
  const { data: tipos = [] } = useTipos();
  const { data: cfg } = useEmpresa();
  const [status, setStatus] = useState<Status | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [previa, setPrevia] = useState<AvisoTipo | null>(null);
  const [emailTeste, setEmailTeste] = useState("");
  const [local, setLocal] = useState<{ avisos_email_ativo: boolean; email_responder_para: string } | null>(null);
  useEffect(() => { if (cfg && !local) setLocal({ avisos_email_ativo: !!cfg.avisos_email_ativo, email_responder_para: cfg.email_responder_para ?? "" }); }, [cfg, local]);
  const empresa = useMemo(() => empresaDe(cfg), [cfg]);

  async function chamar(acao: string, extra: Record<string, unknown> = {}) {
    setOcupado(true);
    try {
      const r = await callFunction("avisos-config", { acao, ...extra });
      if (acao === "telegram_status") setStatus(r);
      return r;
    } catch (e) {
      if (acao === "telegram_status") setStatus({ robo: null, webhook: false, conectados: 0, erro: (e as Error).message, email: false });
      else notifyError(e);
    } finally { setOcupado(false); }
  }
  useEffect(() => { chamar("telegram_status"); }, []);

  async function ligarRobo() {
    const r = await chamar("telegram_configurar");
    if (r?.robo) { notify(`Robô @${r.robo} ligado`); qc.invalidateQueries({ queryKey: ["configuracoes"] }); chamar("telegram_status"); }
  }
  async function salvarCfg(campos: Partial<{ avisos_email_ativo: boolean; email_responder_para: string | null }>) {
    setLocal((l) => (l ? { ...l, ...campos, email_responder_para: (campos.email_responder_para ?? l.email_responder_para) || "" } : l));
    const { error } = await supabase.from("configuracoes").update(campos).eq("id", 1);
    if (error) return notifyError(error);
    notify("Salvo");
  }
  async function alternarTipo(t: AvisoTipo, ativo: boolean) {
    const { error } = await supabase.from("avisos_tipos").update({ ativo }).eq("tipo", t.tipo);
    if (error) return notifyError(error);
    qc.invalidateQueries({ queryKey: ["avisos_tipos"] });
  }

  const lista = (publico: "equipe" | "cliente") => (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {tipos.filter((t) => t.publico === publico).map((t) => (
        <li key={t.tipo} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-fg">{t.titulo}</div>
            <div className="text-sm text-slate-500">{t.descricao}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {publico === "equipe" && t.papeis.map((p) => <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{PAPEL_ROTULO[p]}</span>)}
              <button type="button" onClick={() => setPrevia(t)} className="text-xs font-semibold text-brand hover:underline">Ver exemplo</button>
            </div>
          </div>
          <Interruptor rotulo={t.titulo} ligado={t.ativo} onChange={(v) => alternarTipo(t, v)} />
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Bell size={18} className="text-brand" /> Avisos automáticos</h2>
      <p className="mb-3 text-sm text-slate-600">A equipe recebe no <b>Telegram</b> (cada um só o do seu setor) e os clientes recebem por <b>e-mail</b>.</p>
      <Tabs value={aba} onChange={setAba} options={[
        { value: "equipe", label: "Equipe (Telegram)" }, { value: "clientes", label: "Clientes (e-mail)" }, { value: "historico", label: "Histórico" },
      ]} />

      {aba === "equipe" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            {status?.robo && status.webhook ? (
              <p className="text-emerald-700"><b>Robô @{status.robo} ligado ✓</b> · {status.conectados} pessoa(s) conectada(s). Cada pessoa conecta o próprio Telegram em <b>Meus avisos</b> (menu, embaixo).</p>
            ) : (
              <>
                <p className="mb-2 font-semibold text-fg">Para ligar o robô (uma vez só):</p>
                <ol className="mb-3 list-decimal space-y-1 pl-5 text-slate-600">
                  <li>No Telegram, abra <b>@BotFather</b>, mande <code>/newbot</code> e dê um nome (ex.: <i>MF Máquinas Avisos</i>).</li>
                  <li>Ele responde com um <b>token</b>. Guarde no Supabase como o secret <code>TELEGRAM_BOT_TOKEN</code> (e crie também <code>TELEGRAM_WEBHOOK_SECRET</code> com uma senha qualquer).</li>
                  <li>Volte aqui e toque em <b>Ligar o robô</b>.</li>
                </ol>
                {status?.erro && <p className="mb-2 text-red-600">{status.erro}</p>}
                <Button type="button" disabled={ocupado} onClick={ligarRobo}>Ligar o robô</Button>
              </>
            )}
          </div>
          {lista("equipe")}
        </div>
      )}

      {aba === "clientes" && local && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Mail size={22} className="shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-fg">Enviar e-mails para os clientes</div>
              <div className="text-sm text-slate-500">
                {status?.email ? "Envio configurado ✓" : "Falta configurar o envio (secrets RESEND_API_KEY e EMAIL_REMETENTE)."} Só recebe quem tem e-mail no cadastro e não pediu para sair da lista.
              </div>
            </div>
            <Interruptor rotulo="Enviar e-mails para os clientes" ligado={local.avisos_email_ativo} onChange={(v) => salvarCfg({ avisos_email_ativo: v })} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Respostas dos clientes vão para (e-mail)">
              <input className="input" type="email" placeholder={cfg?.email ?? "comercial@..."} value={local.email_responder_para}
                onChange={(e) => setLocal({ ...local, email_responder_para: e.target.value })}
                onBlur={() => (local.email_responder_para || null) !== (cfg?.email_responder_para ?? null) && salvarCfg({ email_responder_para: local.email_responder_para || null })} />
            </Field>
            <Field label="Mandar um e-mail de teste para">
              <div className="flex gap-2">
                <input className="input" type="email" placeholder="voce@exemplo.com" value={emailTeste} onChange={(e) => setEmailTeste(e.target.value)} />
                <Button type="button" variant="secondary" disabled={ocupado || !emailTeste}
                  onClick={async () => { if (await chamar("email_teste", { para: emailTeste })) notify("E-mail de teste enviado"); }}>Enviar</Button>
              </div>
            </Field>
          </div>
          {lista("cliente")}
        </div>
      )}

      {aba === "historico" && <Historico tipos={tipos} ocupado={ocupado} enviarAgora={async () => {
        const r = await chamar("enviar_agora");
        if (r) { notify(`${r.enviados} enviado(s)${r.erros ? `, ${r.erros} com erro` : ""}`); qc.invalidateQueries({ queryKey: ["avisos"] }); }
      }} />}

      {previa && (
        <Modal open onClose={() => setPrevia(null)} title={`Exemplo: ${previa.titulo}`}>
          <PreviaAviso tipo={previa.tipo} nome={perfil.nome} papel="admin" empresa={empresa} />
        </Modal>
      )}
    </div>
  );
}

function Historico({ tipos, enviarAgora, ocupado }: { tipos: AvisoTipo[]; enviarAgora: () => void; ocupado: boolean }) {
  const qc = useQueryClient();
  const { data: avisos = [] } = useQuery({
    queryKey: ["avisos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avisos").select("*").order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      return data as Aviso[];
    },
  });
  const { data: pessoas = [] } = useQuery({
    queryKey: ["usuarios_erp", "nomes"],
    queryFn: async () => (await supabase.from("usuarios_erp").select("user_id, nome")).data ?? [],
  });
  const titulo = (t: string) => tipos.find((x) => x.tipo === t)?.titulo ?? t;
  const nome = (a: Aviso) => (a.canal === "email" ? `${String(a.dados.cliente ?? "")} · ${a.destino}` : pessoas.find((p: any) => p.user_id === a.usuario_id)?.nome ?? a.destino);
  async function deNovo(a: Aviso) {
    const { error } = await supabase.from("avisos").update({ status: "pendente", tentativas: 0, erro: null }).eq("id", a.id);
    if (error) return notifyError(error);
    qc.invalidateQueries({ queryKey: ["avisos"] });
    notify("Volta para a fila: sai no próximo minuto");
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Últimos 60 avisos. A fila é enviada a cada minuto.</p>
        <Button type="button" variant="secondary" disabled={ocupado} onClick={enviarAgora}><Send size={15} /> Enviar agora</Button>
      </div>
      {avisos.length ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {avisos.map((a) => (
            <li key={a.id} className="flex items-start gap-3 p-3">
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${a.canal === "email" ? "bg-purple-50 text-purple-700" : "bg-sky-50 text-sky-700"}`}>
                {a.canal === "email" ? <Mail size={16} /> : <Send size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-fg">{titulo(a.tipo)}</span>
                  <Badge value={a.status} />
                </div>
                <div className="truncate text-sm text-slate-500">{nome(a)}</div>
                <div className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
                {a.erro && <div className="mt-0.5 text-xs text-red-600">{a.erro}</div>}
              </div>
              {a.status === "erro" && <Button type="button" variant="ghost" className="!px-2" onClick={() => deNovo(a)}><RefreshCw size={15} /> De novo</Button>}
            </li>
          ))}
        </ul>
      ) : <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Nenhum aviso enviado ainda.</p>}
      <a href="https://core.telegram.org/bots/features#botfather" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:underline">
        Ajuda do Telegram sobre robôs <ExternalLink size={12} />
      </a>
    </div>
  );
}
