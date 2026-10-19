// Aba "Assinatura" do cadastro: a ficha cadastral assinada eletronicamente pelo cliente.
// Duas formas: no aparelho da empresa (presencial) ou pelo link que o cliente abre no celular, confere, corrige e assina.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck, Ban, CheckCircle2, Clock, Copy, Eye, FileDown, Fingerprint, Link2, Mail, MessageCircle, PenLine, ShieldCheck, Smartphone,
} from "lucide-react";
import { Button, Field, Modal } from "../ui";
import { Assinatura } from "../Assinatura";
import { PdfViewer } from "../PdfViewer";
import { useInvalidate, useRows } from "@/lib/data";
import { callFunction, DEMO, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { useConfig } from "@/lib/useConfig";
import { whatsappLink, pl } from "@/lib/format";
import { cpfValido } from "@/lib/compliance";
import { formatarDoc } from "@/lib/mascaras";
import { erroAssinante, hashLegivel, linkFicha, mensagemFicha, ROTULOS_FICHA } from "@/lib/fichaCadastral";
import type { AssinaturaFicha as Registro } from "@/lib/types";
import { confirmar, pedirTexto } from "@/components/Dialogos";

const CAMPOS = "id,cliente_id,token,canal,status,nome,cpf,ip,hash,alteracoes,visualizado_em,assinado_em,expira_em,created_at";
const quando = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

export function useAssinaturasFicha() {
  return useRows<Registro>("clientes_assinaturas", { select: CAMPOS, order: "created_at", ascending: false });
}

export function AssinaturaFicha({ cliente, salvarAntes, podeEditar }: {
  cliente: Record<string, any>;
  /** Grava o que foi mexido no cadastro antes de assinar (a ficha assinada é a que está no banco). Devolve o id. */
  salvarAntes: () => Promise<string | null>;
  podeEditar: boolean;
}) {
  const { data: todas = [] } = useAssinaturasFicha();
  const { data: cfg } = useConfig();
  const invalidar = useInvalidate();
  const lista = todas.filter((a) => a.cliente_id === cliente.id);
  const assinada = lista.find((a) => a.status === "assinado");
  const pendente = lista.find((a) => a.status === "pendente" && new Date(a.expira_em) > new Date());
  const [modo, setModo] = useState<"presencial" | null>(null);
  const [email, setEmail] = useState<{ para: string; assunto: string; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const empresa = cfg?.nome_fantasia || cfg?.razao_social || "MF Máquinas";
  const nomeCliente = String(cliente.nome_fantasia || cliente.nome || "");
  const navigate = useNavigate();

  if (!cliente.id) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
        <PenLine className="mx-auto text-slate-400" size={28} />
        <p className="mt-2 font-semibold text-fg">Salve o cadastro para pedir a assinatura</p>
        <p className="text-sm text-slate-500">Depois de salvar, o cliente assina aqui mesmo ou pelo link no celular dele.</p>
      </div>
    );
  }

  async function gerarLink() {
    setOcupado(true);
    try {
      const id = await salvarAntes();
      if (!id) return null;
      const { data, error } = await supabase.rpc("ficha_cadastral_link", { p_cliente: id });
      if (error) throw error;
      invalidar("clientes_assinaturas");
      return linkFicha((data as { token: string }).token);
    } catch (e) { notifyError(e); return null; } finally { setOcupado(false); }
  }

  async function enviar(como: "copiar" | "whatsapp" | "email") {
    // abre a janela já (o navegador do celular bloqueia janela aberta depois de esperar a resposta)
    const janela = como === "whatsapp" ? window.open("", "_blank") : null;
    const link = pendente ? linkFicha(pendente.token) : await gerarLink();
    if (!link) { janela?.close(); return; }
    const texto = mensagemFicha(nomeCliente, empresa, link);
    if (como === "copiar") {
      try { await navigator.clipboard.writeText(link); notify("Link copiado: cole na conversa com o cliente"); } catch { (await pedirTexto("Copie o link:", link)); }
    } else if (como === "whatsapp") {
      if (janela) janela.location.href = whatsappLink(cliente.whatsapp ?? "", texto);
    } else {
      // e-mail sai pela caixa do ERP (Configurações → E-mail); sem caixa ligada, dá para abrir no programa de e-mail ou copiar
      setEmail({ para: cliente.email ?? cliente.email_nfe ?? "", assunto: `Ficha cadastral - ${empresa}`, texto });
    }
  }

  async function cancelar(id: string) {
    if (!(await confirmar("Cancelar este link? O cliente não vai conseguir assinar por ele."))) return;
    const { error } = await supabase.rpc("ficha_cadastral_cancelar", { p_id: id });
    if (error) return notifyError(error);
    invalidar("clientes_assinaturas");
    notify("Link cancelado");
  }

  async function comprovante(id: string) {
    try {
      const { data, error } = await supabase.from("clientes_assinaturas").select("*").eq("id", id).single();
      if (error) throw error;
      const { pdfFichaCadastral } = await import("@/lib/pdf");
      setPdf(await pdfFichaCadastral(data as any, cfg!, ROTULOS_FICHA));
    } catch (e) { notifyError(e); }
  }

  async function conferir(id: string) {
    const { data, error } = await supabase.rpc("ficha_cadastral_conferir", { p_id: id });
    if (error) return notifyError(error);
    notify(data ? "Assinatura íntegra: nada foi alterado depois de assinar" : "Atenção: os dados desta assinatura foram alterados depois", data ? "ok" : "erro");
  }

  return (
    <div className="space-y-4">
      {email && <EnviarEmail inicial={email} onClose={() => setEmail(null)} />}
      {pdf && <PdfViewer blob={pdf} nome={`ficha-cadastral-${cliente.codigo ?? ""}.pdf`} titulo="Ficha cadastral assinada" onClose={() => setPdf(null)} />}

      {/* situação atual */}
      {assinada ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-solido-verde text-white"><BadgeCheck size={26} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-emerald-900">Ficha assinada por {assinada.nome}</div>
            <div className="text-sm text-emerald-800">
              {quando(assinada.assinado_em)} · {assinada.canal === "presencial" ? "presencial" : "pelo link"}{assinada.ip ? ` · IP ${assinada.ip}` : ""}
            </div>
            <div className="mt-1 flex items-center gap-1 truncate font-mono text-2xs text-emerald-700" title={assinada.hash ?? ""}>
              <Fingerprint size={12} className="shrink-0" /> {hashLegivel(assinada.hash).slice(0, 39)}…
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col">
            <Button type="button" variant="secondary" onClick={() => comprovante(assinada.id)}><FileDown size={15} /> Comprovante</Button>
            <Button type="button" variant="ghost" onClick={() => conferir(assinada.id)}><ShieldCheck size={15} /> Conferir</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Ficha ainda não assinada.</b> A assinatura confirma os dados para nota fiscal, entrega e cobrança e registra o aceite do cliente
          (nome, CPF, desenho, data, hora e IP, com código de verificação).
        </div>
      )}

      {/* link pendente */}
      {pendente && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-sky-900">
            <Link2 size={16} /> <b>Link enviado</b> em {quando(pendente.created_at)}
            {pendente.visualizado_em
              ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold"><Eye size={12} /> cliente abriu {quando(pendente.visualizado_em)}</span>
              : <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-slate-600"><Clock size={12} /> ainda não abriu</span>}
            <span className="text-xs text-sky-800">vale até {new Date(pendente.expira_em).toLocaleDateString("pt-BR")}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly className="input font-mono !text-xs" value={linkFicha(pendente.token)} onFocus={(e) => e.target.select()} aria-label="Link da ficha" />
            {DEMO && <Button type="button" variant="secondary" onClick={() => navigate(`/ficha/${pendente.token}`)} title="Na prévia: abrir a página que o cliente vê"><Eye size={15} /></Button>}
            {podeEditar && <Button type="button" variant="ghost" className="!text-red-600" onClick={() => cancelar(pendente.id)} title="Cancelar este link"><Ban size={15} /></Button>}
          </div>
        </div>
      )}

      {/* ações */}
      {podeEditar && modo !== "presencial" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setModo("presencial")}
            className="group rounded-2xl border border-slate-200 bg-surface p-4 text-left shadow-card transition hover:border-brand hover:shadow-pop">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-light text-brand"><PenLine size={22} /></span>
            <div className="mt-3 font-bold text-fg">{assinada ? "Assinar de novo aqui" : "Assinar agora neste aparelho"}</div>
            <p className="text-sm text-slate-500">O cliente está com você: confere os dados, assina com o dedo e pronto.</p>
          </button>
          <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Smartphone size={22} /></span>
            <div className="mt-3 font-bold text-fg">Enviar link para o cliente</div>
            <p className="text-sm text-slate-500">Ele confere, corrige contato e endereço e assina pelo celular (vale 15 dias).</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button type="button" disabled={ocupado} className="!bg-emerald-600 hover:!bg-emerald-700" onClick={() => enviar("whatsapp")} title={cliente.whatsapp ? "Enviar pelo WhatsApp" : "Cadastre o WhatsApp para enviar direto"}>
                <MessageCircle size={15} /> <span className="hidden sm:inline">WhatsApp</span>
              </Button>
              <Button type="button" variant="secondary" disabled={ocupado} onClick={() => enviar("email")}><Mail size={15} /> <span className="hidden sm:inline">E-mail</span></Button>
              <Button type="button" variant="secondary" disabled={ocupado} onClick={() => enviar("copiar")}><Copy size={15} /> <span className="hidden sm:inline">Copiar</span></Button>
            </div>
          </div>
        </div>
      )}

      {modo === "presencial" && (
        <AssinarPresencial cliente={cliente} salvarAntes={salvarAntes} onCancelar={() => setModo(null)}
          onAssinado={() => { setModo(null); invalidar("clientes_assinaturas", "clientes"); }} />
      )}

      {/* histórico */}
      {lista.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Histórico</div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {lista.map((a) => {
              const vencido = a.status === "pendente" && new Date(a.expira_em) <= new Date();
              const tom = a.status === "assinado" ? "bg-emerald-100 text-emerald-800" : a.status === "cancelado" || vencido ? "bg-slate-100 text-slate-600" : "bg-sky-100 text-sky-800";
              const rotulo = a.status === "assinado" ? "assinada" : a.status === "cancelado" ? "cancelado" : vencido ? "vencido" : "aguardando";
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tom}`}>{rotulo}</span>
                  <span className="text-slate-600">{a.canal === "presencial" ? "Presencial" : "Link"} · {quando(a.assinado_em ?? a.created_at)}</span>
                  {a.nome && <span className="font-medium text-fg">{a.nome}</span>}
                  {a.alteracoes && <span className="text-xs text-amber-700" title={Object.keys(a.alteracoes).map((k) => ROTULOS_FICHA[k] ?? k).join(", ")}>atualizou {Object.keys(a.alteracoes).length} {pl(Object.keys(a.alteracoes).length, "dado", "dados")}</span>}
                  {a.status === "assinado" && (
                    <button type="button" className="ml-auto text-xs font-semibold text-brand hover:underline" onClick={() => comprovante(a.id)}>Comprovante</button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function AssinarPresencial({ cliente, salvarAntes, onCancelar, onAssinado }: {
  cliente: Record<string, any>; salvarAntes: () => Promise<string | null>; onCancelar: () => void; onAssinado: () => void;
}) {
  const pf = cliente.tipo_pessoa === "PF";
  const [nome, setNome] = useState(pf ? String(cliente.nome ?? "") : "");
  const [cpf, setCpf] = useState(pf ? String(cliente.cpf_cnpj ?? "") : "");
  const [png, setPng] = useState<string | null>(null);
  const [aceite, setAceite] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const { data: termo } = useQuery({
    queryKey: ["termo_ficha_cadastral"],
    queryFn: async () => { const { data, error } = await supabase.rpc("termo_ficha_cadastral"); if (error) throw error; return data as string; },
  });
  const erro = erroAssinante(nome, cpf, cpfValido);

  async function assinar() {
    if (erro) return notify(erro, "erro");
    if (!termo) return notify("A declaração ainda não carregou: espere ou recarregue a página antes de assinar", "erro");
    if (!png) return notify("Faça a assinatura no quadro", "erro");
    if (!aceite) return notify("Marque que leu e concorda com a declaração", "erro");
    setOcupado(true);
    try {
      const id = await salvarAntes();
      if (!id) return;
      const { error } = await supabase.rpc("ficha_cadastral_assinar_presencial", { p_cliente: id, p_nome: nome.trim(), p_cpf: cpf, p_png: png, p_user_agent: navigator.userAgent });
      if (error) throw error;
      notify("Ficha assinada. O comprovante já está disponível.");
      onAssinado();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-brand/40 bg-brand-light/30 p-4">
      <div className="flex items-center gap-2 font-bold text-fg"><PenLine size={18} className="text-brand" /> Assinatura presencial</div>
      <p className="rounded-xl bg-surface p-3 text-sm leading-relaxed text-slate-700">{termo ?? "Carregando a declaração…"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={pf ? "Nome completo de quem assina" : "Nome completo de quem assina pela empresa"}>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="CPF de quem assina">
          <input className="input" inputMode="numeric" value={formatarDoc(cpf).slice(0, 14)} onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="000.000.000-00" />
        </Field>
      </div>
      <Assinatura valor={png} onChange={setPng} />
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
        Li a declaração e confirmo que os dados da ficha estão corretos.
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancelar}>Voltar</Button>
        <Button type="button" disabled={ocupado || !termo} onClick={assinar}><CheckCircle2 size={16} /> {ocupado ? "Registrando…" : "Assinar ficha"}</Button>
      </div>
    </div>
  );
}

/** Manda o link da ficha pela caixa de e-mail do ERP. Sem caixa ligada: abre no programa de e-mail do aparelho ou copia o texto. */
function EnviarEmail({ inicial, onClose }: { inicial: { para: string; assunto: string; texto: string }; onClose: () => void }) {
  const { data: caixas = [], isLoading } = useRows<{ id: string; nome: string; email: string }>("email_contas", { select: "id, nome, email", order: "nome", ascending: true });
  const [m, setM] = useState(inicial);
  const [conta, setConta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const contaId = conta || caixas[0]?.id || "";
  const mailto = `mailto:${m.para}?subject=${encodeURIComponent(m.assunto)}&body=${encodeURIComponent(m.texto)}`;
  async function enviar() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.para.trim())) return notify("Digite o e-mail do cliente", "erro");
    setEnviando(true);
    try {
      await callFunction("email-caixa", { acao: "enviar", conta_id: contaId, para: m.para.trim(), assunto: m.assunto, texto: m.texto });
      notify(`E-mail enviado para ${m.para.trim()}`);
      onClose();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(m.texto); notify("Texto copiado: cole no seu e-mail"); } catch { await pedirTexto("Copie o texto:", m.texto); }
  }
  return (
    <Modal open onClose={onClose} title="Enviar a ficha por e-mail">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        <Field label="Para"><input className="input" type="email" value={m.para} onChange={(e) => setM({ ...m, para: e.target.value })} placeholder="email@cliente.com.br" autoFocus={!m.para} /></Field>
        <Field label="Assunto"><input className="input" value={m.assunto} onChange={(e) => setM({ ...m, assunto: e.target.value })} /></Field>
        <Field label="Mensagem"><textarea className="input" rows={6} value={m.texto} onChange={(e) => setM({ ...m, texto: e.target.value })} /></Field>
        {caixas.length > 1 && (
          <Field label="Enviar pela caixa"><select className="input" value={contaId} onChange={(e) => setConta(e.target.value)}>{caixas.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.email}</option>)}</select></Field>
        )}
        {!isLoading && !caixas.length && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Nenhuma caixa de e-mail ligada ao ERP (Configurações → E-mail). Use o seu programa de e-mail ou copie o texto.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={copiar}><Copy size={15} /> Copiar texto</Button>
          <a className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={mailto}><Mail size={15} /> Abrir no meu e-mail</a>
          {caixas.length > 0 && <Button type="submit" disabled={enviando}><Mail size={15} /> {enviando ? "Enviando…" : "Enviar pelo ERP"}</Button>}
        </div>
      </form>
    </Modal>
  );
}
