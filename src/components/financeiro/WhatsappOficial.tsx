// WhatsApp oficial (API da Meta): configurar o número, ligar o envio automático da régua, mandar os modelos para
// aprovação, ver o que saiu (enviado, entregue, lido, falhou) e responder quem escreveu de volta.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCheck, Copy, Loader2, MessageCircle, Send, Settings2, ShieldCheck } from "lucide-react";
import { Button, Card, Field, Modal, Tabs } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import type { Etapa } from "@/lib/cobranca";

export type StatusWhatsapp = {
  configurado: boolean; ativo: boolean; numero: string | null; nome: string | null; numero_id: string | null; waba_id: string | null;
  assinatura: boolean; webhook: string; verify_token: string | null;
};
export type EtapaWa = Etapa & { wa_modelo?: string | null; wa_status?: string | null; wa_mensagem_base?: string | null; wa_erro?: string | null };
type Mensagem = {
  id: string; direcao: "saida" | "entrada"; telefone: string; cliente_id: string | null; texto: string | null; modelo: string | null;
  status: string; erro: string | null; created_at: string; etapa_id: string | null; cliente?: { nome: string; nome_fantasia?: string | null } | null;
};

/** Situação do modelo da etapa na Meta, em português. */
export function situacaoModelo(e: EtapaWa): { texto: string; cor: string } {
  if (!e.canal_whatsapp) return { texto: "", cor: "" };
  if (e.wa_modelo && e.wa_mensagem_base !== e.mensagem) return { texto: "mensagem mudou: envie o modelo de novo", cor: "border-amber-300 bg-amber-50 text-amber-900" };
  switch (e.wa_status) {
    case "APPROVED": return { texto: "modelo aprovado", cor: "border-emerald-300 bg-emerald-50 text-emerald-800" };
    case "PENDING": case "IN_APPEAL": return { texto: "modelo em análise na Meta", cor: "border-sky-300 bg-sky-50 text-sky-800" };
    case "REJECTED": return { texto: "modelo recusado", cor: "border-red-300 bg-red-50 text-red-800" };
    case "PAUSED": case "DISABLED": return { texto: "modelo pausado pela Meta", cor: "border-red-300 bg-red-50 text-red-800" };
    default: return { texto: "modelo não enviado", cor: "border-slate-300 bg-slate-50 text-slate-600" };
  }
}

const SIT: Record<string, { r: string; cor: string }> = {
  pendente: { r: "na fila", cor: "text-slate-500" }, enviando: { r: "enviando", cor: "text-slate-500" }, enviado: { r: "enviado", cor: "text-slate-600" },
  entregue: { r: "entregue", cor: "text-sky-700" }, lido: { r: "lido", cor: "text-emerald-700" }, erro: { r: "não enviado", cor: "text-red-700" },
};
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const nomeCli = (m: Mensagem) => m.cliente?.nome_fantasia?.trim() || m.cliente?.nome || `+${m.telefone}`;

export function useStatusWhatsapp() {
  return useQuery({
    queryKey: ["whatsapp_status"],
    queryFn: () => callFunction<StatusWhatsapp>("whatsapp", { acao: "status" }),
    retry: false,
  });
}

export function WhatsappOficial({ etapas }: { etapas: EtapaWa[] }) {
  const { tem, pode } = usePerfil();
  const admin = tem();
  const podeEditar = pode("editar_financeiro");
  const invalidar = useInvalidate();
  const { data: st, refetch } = useStatusWhatsapp();
  const [config, setConfig] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const comWhats = etapas.filter((e) => e.canal_whatsapp && e.ativo);
  const faltaEnviar = comWhats.filter((e) => !e.wa_modelo || e.wa_mensagem_base !== e.mensagem || e.wa_status === "REJECTED");

  async function acao(nome: string, fn: () => Promise<unknown>) {
    setOcupado(nome);
    try { await fn(); } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }
  const automatico = (ligado: boolean) => acao("auto", async () => {
    await callFunction("whatsapp", { acao: "automatico", ligado });
    notify(ligado ? "Envio automático ligado: a régua sai sozinha pelo WhatsApp" : "Envio automático desligado: o WhatsApp volta para a lista do dia");
    refetch();
  });
  const modelos = () => acao("modelos", async () => {
    const r = await callFunction<{ enviados: number; erros: string[] }>("whatsapp", { acao: "modelos" });
    invalidar("regua_cobranca");
    if (r.erros?.length) notify(`A Meta recusou: ${r.erros.join("; ")}`, "erro");
    else notify(r.enviados ? `${r.enviados} modelo(s) enviado(s) para aprovação. A Meta costuma responder em minutos.` : "Situação dos modelos atualizada");
  });
  const testar = () => {
    const tel = prompt("Mandar a mensagem de teste da Meta (hello_world) para qual WhatsApp? (DDD + número)");
    if (tel) acao("teste", async () => { await callFunction("whatsapp", { acao: "teste", telefone: tel }); notify("Mensagem de teste enviada"); invalidar("whatsapp_mensagens"); });
  };

  if (!st) return null;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={18} className="text-emerald-600" /> WhatsApp oficial (API da Meta)</h2>
          <p className="text-sm text-slate-600">
            {!st.configurado
              ? "Com o número oficial da empresa, a régua sai sozinha pelo WhatsApp (com Pix), sem clique, e as respostas dos clientes chegam aqui."
              : <>Número <b>{st.numero ?? st.numero_id}</b>{st.nome ? ` (${st.nome})` : ""}. {st.ativo
                  ? "Envio automático ligado: as etapas com modelo aprovado saem sozinhas às 8h (e na criação e no pagamento, na hora)."
                  : "Envio automático desligado: o WhatsApp da régua continua na lista do dia, para mandar com um toque."}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {st.configurado && podeEditar && (
            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5" checked={st.ativo} disabled={ocupado === "auto"} onChange={(e) => automatico(e.target.checked)} />
              Envio automático
            </label>
          )}
          {admin && <Button variant={st.configurado ? "ghost" : "primary"} onClick={() => setConfig(true)}><Settings2 size={16} /> {st.configurado ? "Configurar" : "Ligar o WhatsApp oficial"}</Button>}
        </div>
      </div>

      {st.configurado && comWhats.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>Modelos da régua na Meta</b>
            <div className="flex gap-2">
              {admin && <Button variant="ghost" onClick={testar} disabled={!!ocupado}>Testar número</Button>}
              {podeEditar && <Button variant={faltaEnviar.length ? "primary" : "secondary"} onClick={modelos} disabled={!!ocupado}>
                {ocupado === "modelos" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {faltaEnviar.length ? `Enviar ${faltaEnviar.length} para aprovação` : "Atualizar situação"}
              </Button>}
            </div>
          </div>
          <ul className="space-y-1">
            {comWhats.map((e) => {
              const s = situacaoModelo(e);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[9rem] font-medium">{e.nome}</span>
                  <span className={`rounded border px-1.5 text-xs ${s.cor}`}>{s.texto}</span>
                  {e.wa_erro && <span className="text-xs text-red-700">{e.wa_erro}</span>}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500">Fora de uma conversa aberta, a Meta só deixa mandar mensagens com modelo aprovado. Mudou o texto de uma etapa? Envie o modelo de novo.</p>
        </div>
      )}

      {st.configurado && <Mensagens />}
      {config && <ConfigWhatsapp st={st} onClose={() => setConfig(false)} onPronto={() => { refetch(); }} />}
    </Card>
  );
}

function Mensagens() {
  const invalidar = useInvalidate();
  const [aba, setAba] = useState<"conversas" | "enviadas">("conversas");
  const { data: msgs = [] } = useQuery({
    queryKey: ["whatsapp_mensagens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_mensagens").select("*, cliente:clientes(nome, nome_fantasia)")
        .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
    refetchInterval: 60_000,
  });
  // conversa = telefone que escreveu para a empresa
  const conversas = useMemo(() => {
    const m = new Map<string, Mensagem[]>();
    for (const x of msgs) if (msgs.some((y) => y.telefone === x.telefone && y.direcao === "entrada")) m.set(x.telefone, [...(m.get(x.telefone) ?? []), x]);
    return [...m.values()].map((l) => l.sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }, [msgs]);
  const enviadas = msgs.filter((m) => m.direcao === "saida");
  const falhas = enviadas.filter((m) => m.status === "erro").length;

  return (
    <div className="mt-3">
      <Tabs value={aba} onChange={setAba} options={[
        { value: "conversas", label: `Respostas dos clientes (${conversas.length})` },
        { value: "enviadas", label: `Enviadas (${enviadas.length})${falhas ? ` · ${falhas} falha(s)` : ""}` },
      ]} />
      {aba === "conversas" && (
        !conversas.length ? <p className="mt-2 text-sm text-slate-500">Ninguém respondeu nos últimos 30 dias.</p> : (
          <ul className="mt-2 space-y-3">
            {conversas.map((c) => <Conversa key={c[0].telefone} msgs={c} onEnviada={() => invalidar("whatsapp_mensagens")} />)}
          </ul>
        )
      )}
      {aba === "enviadas" && (
        !enviadas.length ? <p className="mt-2 text-sm text-slate-500">Nada enviado pelo WhatsApp oficial nos últimos 30 dias.</p> : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {enviadas.slice(0, 100).map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
                <div className="min-w-[12rem] flex-1 basis-60">
                  <div className="font-medium">{nomeCli(m)} <span className="text-xs font-normal text-slate-500">{quando(m.created_at)}</span></div>
                  <p className="line-clamp-2 whitespace-pre-line text-xs text-slate-600">{m.texto ?? m.modelo}</p>
                  {m.erro && <p className="text-xs text-red-700">{m.erro}</p>}
                </div>
                <span className={`flex items-center gap-1 text-xs font-semibold ${SIT[m.status]?.cor ?? ""}`}>
                  {m.status === "lido" ? <CheckCheck size={14} /> : m.status === "entregue" ? <CheckCheck size={14} /> : m.status === "erro" ? <AlertTriangle size={14} /> : <Check size={14} />}
                  {SIT[m.status]?.r ?? m.status}
                </span>
                {m.status === "erro" && m.texto && (
                  <a href={whatsappLink(m.telefone, m.texto)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 underline">
                    <MessageCircle size={13} /> Mandar pelo celular
                  </a>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function Conversa({ msgs, onEnviada }: { msgs: Mensagem[]; onEnviada: () => void }) {
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ultimaEntrada = [...msgs].reverse().find((m) => m.direcao === "entrada");
  const aberta = !!ultimaEntrada && Date.now() - new Date(ultimaEntrada.created_at).getTime() < 24 * 3600_000;
  const quem = nomeCli(ultimaEntrada ?? msgs[0]);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      await callFunction("whatsapp", { acao: "responder", telefone: msgs[0].telefone, texto });
      setTexto(""); notify("Resposta enviada"); onEnviada();
    } catch (er) { notifyError(er); } finally { setOcupado(false); }
  }
  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <b>{quem}</b>
        <a href={whatsappLink(msgs[0].telefone, "")} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 underline">+{msgs[0].telefone}</a>
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {msgs.slice(-12).map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${m.direcao === "entrada" ? "bg-slate-100 text-fg" : "ml-auto bg-emerald-50 text-emerald-900"}`}>
            <p className="whitespace-pre-line break-words">{m.texto ?? m.modelo}</p>
            <p className="text-right text-[10px] opacity-70">{quando(m.created_at)}{m.direcao === "saida" ? ` · ${SIT[m.status]?.r ?? m.status}` : ""}</p>
          </div>
        ))}
      </div>
      {aberta ? (
        <form onSubmit={enviar} className="mt-2 flex gap-2">
          <input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responder pelo número oficial…" maxLength={4000} required aria-label={`Responder ${quem}`} />
          <Button disabled={ocupado || !texto.trim()} aria-label="Enviar resposta">{ocupado ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</Button>
        </form>
      ) : <p className="mt-2 text-xs text-slate-500">Passou de 24 h da última mensagem do cliente: a Meta só deixa mandar modelo aprovado. Responda pelo celular.</p>}
    </li>
  );
}

function ConfigWhatsapp({ st, onClose, onPronto }: { st: StatusWhatsapp; onClose: () => void; onPronto: () => void }) {
  const [f, setF] = useState({ numero_id: st.numero_id ?? "", waba_id: st.waba_id ?? "", token: "", app_secret: "" });
  const [ocupado, setOcupado] = useState(false);
  const [webhook, setWebhook] = useState<{ url: string; token: string | null } | null>(st.configurado ? { url: st.webhook, token: st.verify_token } : null);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await callFunction<{ numero: string | null; webhook: string; verify_token: string | null; inscrito: boolean }>("whatsapp", { acao: "configurar", ...f });
      notify(`WhatsApp oficial conferido${r.numero ? `: ${r.numero}` : ""}${r.inscrito ? "" : ". Confira a inscrição do app na conta (webhook)."}`);
      setWebhook({ url: r.webhook, token: r.verify_token });
      setF({ ...f, token: "", app_secret: "" });
      onPronto();
    } catch (er) { notifyError(er); } finally { setOcupado(false); }
  }
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => notify("Copiado"));
  return (
    <Modal open onClose={onClose} title="WhatsApp oficial (API da Meta)" wide>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <ol className="list-decimal space-y-1 pl-5 text-slate-600 sm:col-span-2">
          <li>No <a href="https://business.facebook.com" target="_blank" rel="noreferrer" className="text-brand underline">Meta Business</a>, crie um app do tipo <b>Empresa</b> com o produto <b>WhatsApp</b> e adicione o número da empresa (ele deixa de funcionar no aplicativo comum).</li>
          <li>Em <b>WhatsApp → Configuração da API</b>, copie o <b>ID do número de telefone</b> e o <b>ID da conta do WhatsApp Business</b>.</li>
          <li>Em <b>Usuários do sistema</b>, gere um token permanente com as permissões <i>whatsapp_business_messaging</i> e <i>whatsapp_business_management</i>.</li>
          <li>Em <b>Configurações do app → Básico</b>, copie a <b>Chave secreta do app</b> (confere que os avisos vêm mesmo da Meta).</li>
          <li>Cole aqui. Depois, em <b>WhatsApp → Configuração → Webhook</b>, cole o endereço e o código que aparecem abaixo e marque <b>messages</b>.</li>
        </ol>
        <Field label="ID do número de telefone"><input className="input font-mono" inputMode="numeric" value={f.numero_id} onChange={(e) => setF({ ...f, numero_id: e.target.value })} required /></Field>
        <Field label="ID da conta do WhatsApp Business (WABA)"><input className="input font-mono" inputMode="numeric" value={f.waba_id} onChange={(e) => setF({ ...f, waba_id: e.target.value })} required /></Field>
        <Field label={st.configurado ? "Token de acesso (só para trocar)" : "Token de acesso (permanente)"}>
          <input className="input font-mono" type="password" autoComplete="new-password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} required={!st.configurado} />
        </Field>
        <Field label={st.assinatura ? "Chave secreta do app (só para trocar)" : "Chave secreta do app"}>
          <input className="input font-mono" type="password" autoComplete="new-password" value={f.app_secret} onChange={(e) => setF({ ...f, app_secret: e.target.value })} required={!st.assinatura} />
        </Field>
        <p className="text-xs text-slate-500 sm:col-span-2">O token e a chave ficam no cofre do servidor: ninguém consegue ler depois, nem pela tela.</p>
        {webhook && (
          <div className="space-y-2 rounded-lg bg-slate-50 p-3 sm:col-span-2">
            <b>Webhook (cole na Meta)</b>
            <div className="flex items-center gap-2"><span className="w-28 shrink-0 text-xs text-slate-500">URL de retorno</span><code className="min-w-0 flex-1 truncate text-xs">{webhook.url}</code>
              <Button type="button" variant="ghost" aria-label="Copiar URL" onClick={() => copiar(webhook.url)}><Copy size={14} /></Button></div>
            {webhook.token && <div className="flex items-center gap-2"><span className="w-28 shrink-0 text-xs text-slate-500">Token de verificação</span><code className="min-w-0 flex-1 truncate text-xs">{webhook.token}</code>
              <Button type="button" variant="ghost" aria-label="Copiar token de verificação" onClick={() => copiar(webhook.token!)}><Copy size={14} /></Button></div>}
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          <Button disabled={ocupado}>{ocupado ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Conferir e guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
